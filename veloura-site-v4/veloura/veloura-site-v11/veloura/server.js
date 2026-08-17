/* Veloura order backend — Express + Turso (libSQL). CommonJS, no build step. */
try { require('dotenv').config(); } catch (e) { /* dotenv optional — env vars can also be set by the host */ }
const path = require('path');
const fs = require('fs');
const express = require('express');
const rateLimit = require('express-rate-limit');
const { createClient } = require('@libsql/client');

const PORT = process.env.PORT ? Number(process.env.PORT) : 8000;
const ADMIN_KEY = process.env.ADMIN_KEY || 'veloura-aditya-2026';
const OWNER_EMAIL = process.env.OWNER_EMAIL || 'a75127130@gmail.com';
// Your own UPI ID (VPA), e.g. "yourname@okhdfcbank" — find it in any UPI app
// under "My QR code" or "Profile". Customers pay this directly; there's no
// gateway, so you confirm payment yourself by checking your bank/UPI app.
const OWNER_UPI_ID = process.env.OWNER_UPI_ID || 'aditya32u6v@okaxis';
const OWNER_UPI_NAME = process.env.OWNER_UPI_NAME || 'Veloura Ice Cream Parlour';
// A flavour is "low stock" once its quantity drops to or below this.
const LOW_STOCK_THRESHOLD = process.env.LOW_STOCK_THRESHOLD ? Number(process.env.LOW_STOCK_THRESHOLD) : 10;
const ROOT = __dirname;

/* ---------------- database ----------------
   Orders live in Turso (a cloud SQLite service), NOT on the server's local
   disk. This matters because Render's free tier wipes local files every time
   the service restarts or spins down from inactivity — a plain SQLite file
   would lose all its orders every ~15 minutes of quiet. Turso keeps the data
   safe outside the server entirely.

   Setup (2 minutes, free, no credit card):
     1. Sign up at https://turso.tech
     2. Create a database (any name, e.g. "veloura")
     3. Copy its URL and create an auth token from the dashboard
     4. Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN as environment variables

   If those aren't set, this falls back to a local SQLite file — fine for
   testing on your own computer, but NOT for Render (same wipe problem). */
const TURSO_URL = process.env.TURSO_DATABASE_URL || ('file:' + path.join(ROOT, '..', 'veloura-data', 'local.db'));
const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN || undefined;
if (!process.env.TURSO_DATABASE_URL) {
  fs.mkdirSync(path.join(ROOT, '..', 'veloura-data'), { recursive: true });
  console.warn('[db] TURSO_DATABASE_URL not set — using a local file. This is fine for testing on your own computer, but on Render this file will NOT persist. Set up Turso for production.');
}
const db = createClient({ url: TURSO_URL, authToken: TURSO_TOKEN });

/* ---------------- email transport ----------------
   Order alerts are sent through Resend (https://resend.com) over HTTPS.
   We deliberately do NOT use Gmail SMTP here — most free hosts (Render,
   Railway, etc) block outbound SMTP ports to stop spam, which makes Gmail
   sending fail with "Connection timeout". Resend sends over plain HTTPS
   (the same protocol as any web request), so it isn't blocked.

   Setup (2 minutes, no credit card):
     1. Sign up at https://resend.com using a75127130@gmail.com
        (sign up with THIS exact email)
     2. Dashboard → API Keys → Create API Key → copy it
     3. Set the environment variable RESEND_API_KEY to that key.
   Without a verified domain, Resend only allows sending TO the email
   address you signed up with — which is exactly OWNER_EMAIL here, so no
   domain setup is needed at all.

   If RESEND_API_KEY is not set, the server still runs and orders still
   save — it just skips sending the email and logs a warning, so checkout
   never breaks. */
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const emailReady = !!RESEND_API_KEY;
if (!emailReady) {
  console.warn('[email] RESEND_API_KEY not set — order alert emails are disabled.');
}

/* ---------------- catalogue (server is the source of truth for prices) --------------- */
const CATALOG = {
  single: { id: 'single', name: 'Single Scoop Waffle Cone', price: 149 },
  double: { id: 'double', name: 'Double Scoop Waffle Cone', price: 229 },
  triple: { id: 'triple', name: 'Triple Stack Signature Cone', price: 299 },
  pint: { id: 'pint', name: 'Pint (500 ml tub)', price: 499 },
  family: { id: 'family', name: 'Family Tub (1 L)', price: 899 },
};
// Flavours that carry a +₹60 surcharge — must mirror js/ui.js's PREMIUM set.
const PREMIUM_FLAVOURS = new Set(['dubai', 'pistachio', 'pistiramisu', 'ube']);
// Mirrors js/flavours.js — kept here too so the admin stock toggle can show
// readable names without the browser needing extra admin-only endpoints.
const FLAVOURS = [
  { id: 'dubai', name: 'Dubai Chocolate Kunafa' },
  { id: 'pistachio', name: 'Roasted Pistachio (Sicilian)' },
  { id: 'pistiramisu', name: 'Pistachio Tiramisu' },
  { id: 'matcha', name: 'Matcha White Chocolate' },
  { id: 'biscoff', name: 'Biscoff Cookie Butter' },
  { id: 'mangohab', name: 'Mango Habanero' },
  { id: 'miso', name: 'Miso Salted Caramel' },
  { id: 'ube', name: 'Ube Cheesecake' },
  { id: 'alphonso', name: 'Alphonso Mango' },
  { id: 'kesarpista', name: 'Kesar Pista Kulfi' },
  { id: 'rose', name: 'Rose Gulkand' },
  { id: 'rabdi', name: 'Rabdi Malai Kesar' },
  { id: 'kalakhatta', name: 'Kala Khatta' },
  { id: 'coconut', name: 'Tender Coconut' },
  { id: 'vanilla', name: 'Madagascar Vanilla Bean' },
  { id: 'brownie', name: 'Choco Brownie Fudge' },
];
function cleanFlavourName(s) {
  return String(s || '').replace(/[<>]/g, '').trim().slice(0, 60);
}
function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
const DELIVERY_FEE = 49;
const FREE_DELIVERY_ABOVE = 499;

/* ---------------- coupons ----------------
   Edit this list to add/remove coupon codes. type: 'percent' (value = % off,
   capped by maxDiscount if set) or 'flat' (value = flat ₹ off).
   minSubtotal is optional — the cart must reach that amount to qualify. */
const COUPONS = {
  WELCOME10: { type: 'percent', value: 10, maxDiscount: 100, label: '10% off (up to ₹100)' },
  SCOOP50: { type: 'flat', value: 50, minSubtotal: 300, label: '₹50 off orders above ₹300' },
  FREESHIP: { type: 'flat', value: DELIVERY_FEE, minSubtotal: 0, label: 'Free delivery', freeDelivery: true },
};
function computeCoupon(code, subtotal) {
  const c = COUPONS[String(code || '').trim().toUpperCase()];
  if (!c) return { ok: false, error: 'That code is not valid.' };
  if (c.minSubtotal && subtotal < c.minSubtotal) {
    return { ok: false, error: `Add ${inr(c.minSubtotal - subtotal)} more to use this code.` };
  }
  let discount = c.type === 'percent' ? Math.round((subtotal * c.value) / 100) : c.value;
  if (c.maxDiscount) discount = Math.min(discount, c.maxDiscount);
  discount = Math.min(discount, subtotal);
  return { ok: true, discount, label: c.label, freeDelivery: !!c.freeDelivery };
}

/* ---------------- db setup ---------------- */
async function initDb() {
  await db.execute('PRAGMA journal_mode = WAL;').catch(() => {}); // no-op on remote Turso, harmless locally
  await db.execute(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_code TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      created_at_ist TEXT NOT NULL,
      customer_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      email TEXT NOT NULL,
      address TEXT NOT NULL,
      city TEXT NOT NULL,
      pincode TEXT NOT NULL,
      items TEXT NOT NULL,
      subtotal INTEGER NOT NULL,
      delivery_fee INTEGER NOT NULL,
      total INTEGER NOT NULL,
      payment_method TEXT NOT NULL,
      notes TEXT,
      status TEXT NOT NULL DEFAULT 'new',
      email_sent INTEGER NOT NULL DEFAULT 0,
      email_error TEXT
    );`);
  // Migrations for columns added after the table already existed in production —
  // each wrapped so re-running this on a database that already has the column
  // doesn't crash the server on startup.
  await db.execute('ALTER TABLE orders ADD COLUMN coupon_code TEXT;').catch(() => {});
  await db.execute('ALTER TABLE orders ADD COLUMN discount INTEGER NOT NULL DEFAULT 0;').catch(() => {});
  await db.execute(`
    CREATE TABLE IF NOT EXISTS flavour_stock (
      flavour_id TEXT PRIMARY KEY,
      available INTEGER NOT NULL DEFAULT 1,
      quantity INTEGER
    );`);
  await db.execute('ALTER TABLE flavour_stock ADD COLUMN quantity INTEGER;').catch(() => {});
  await db.execute(`
    CREATE TABLE IF NOT EXISTS order_location (
      order_id INTEGER PRIMARY KEY,
      lat REAL NOT NULL,
      lng REAL NOT NULL,
      updated_at TEXT NOT NULL
    );`);
}

/* ---------------- helpers ---------------- */
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
function istParts(d = new Date()) {
  const t = new Date(d.getTime() + IST_OFFSET_MS);
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return {
    ymd: `${t.getUTCFullYear()}${p(t.getUTCMonth() + 1)}${p(t.getUTCDate())}`,
    dateKey: `${t.getUTCFullYear()}-${p(t.getUTCMonth() + 1)}-${p(t.getUTCDate())}`,
    display:
      `${p(t.getUTCDate())} ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][t.getUTCMonth()]} ${t.getUTCFullYear()}, ` +
      `${p(((t.getUTCHours() + 11) % 12) + 1)}:${p(t.getUTCMinutes())} ${t.getUTCHours() < 12 ? 'AM' : 'PM'} IST`,
  };
}
const inr = (n) => '₹' + Number(n).toLocaleString('en-IN');

async function nextOrderCode() {
  const { ymd } = istParts();
  const rs = await db.execute({ sql: 'SELECT COUNT(*) AS c FROM orders WHERE order_code LIKE ?', args: [`VLR-${ymd}-%`] });
  const c = Number(rs.rows[0].c);
  return `VLR-${ymd}-${String(c + 1).padStart(4, '0')}`;
}

function requireAdmin(req, res, next) {
  const key = req.get('x-admin-key');
  if (!key || key !== ADMIN_KEY) return res.status(401).json({ error: 'Invalid admin key' });
  next();
}

/* ---------------- email alert (fire and forget) ---------------- */
function buildEmail(order) {
  const items = JSON.parse(order.items);
  const rows = items
    .map(
      (i) =>
        `<tr><td style="padding:6px 12px 6px 0;border-bottom:1px solid #eee">${escapeHtml(i.name)} × ${i.qty}</td>` +
        `<td style="padding:6px 0;text-align:right;border-bottom:1px solid #eee">${inr(i.price * i.qty)}</td></tr>`
    )
    .join('');
  const plainItems = items.map((i) => `- ${i.name} x${i.qty} — ${inr(i.price * i.qty)}`).join('\n');
  const subject = `🍦 New Veloura order ${order.order_code} — ${inr(order.total)}`;
  const body = [
    `New Veloura order ${order.order_code}`,
    `Placed: ${order.created_at_ist}`,
    '',
    `Customer: ${order.customer_name}`,
    `Phone: ${order.phone}`,
    `Email: ${order.email}`,
    `Address: ${order.address}, ${order.city} — ${order.pincode}`,
    '',
    'Items:',
    plainItems,
    '',
    `Subtotal: ${inr(order.subtotal)}`,
    order.discount ? `Discount (${order.coupon_code}): -${inr(order.discount)}` : null,
    `Delivery: ${order.delivery_fee === 0 ? 'Free' : inr(order.delivery_fee)}`,
    `Total: ${inr(order.total)}`,
    `Payment: ${order.payment_method}`,
    `Notes: ${order.notes || '—'}`,
  ].filter(Boolean).join('\n');
  const html = `
<div style="font-family:Georgia,serif;max-width:560px;color:#2A1E17">
  <p style="font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:#B47F22;margin:0 0 6px">Veloura Ice Cream Parlour &amp; Café · Kanpur</p>
  <h2 style="margin:0 0 4px;font-size:22px">New order ${order.order_code}</h2>
  <p style="margin:0 0 18px;color:#6B564A;font-size:13px">${order.created_at_ist}</p>
  <table style="width:100%;border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px">
    ${rows}
    <tr><td style="padding:8px 0">Subtotal</td><td style="padding:8px 0;text-align:right">${inr(order.subtotal)}</td></tr>
    ${order.discount ? `<tr><td style="padding:2px 0;color:#2C7A43">Discount (${escapeHtml(order.coupon_code)})</td><td style="padding:2px 0;text-align:right;color:#2C7A43">-${inr(order.discount)}</td></tr>` : ''}
    <tr><td style="padding:2px 0">Delivery</td><td style="padding:2px 0;text-align:right">${order.delivery_fee === 0 ? 'Free' : inr(order.delivery_fee)}</td></tr>
    <tr><td style="padding:8px 0;font-weight:bold;border-top:2px solid #2A1E17">Total</td>
        <td style="padding:8px 0;text-align:right;font-weight:bold;border-top:2px solid #2A1E17">${inr(order.total)}</td></tr>
  </table>
  <p style="font-family:Arial,sans-serif;font-size:14px;margin:18px 0 6px"><b>Payment:</b> ${order.payment_method}</p>
  <div style="font-family:Arial,sans-serif;font-size:14px;background:#FDF8F0;border:1px solid #eadfce;border-radius:10px;padding:14px;margin-top:10px">
    <b>${escapeHtml(order.customer_name)}</b><br/>
    ${escapeHtml(order.phone)} · ${escapeHtml(order.email)}<br/>
    ${escapeHtml(order.address)}<br/>${escapeHtml(order.city)} — ${escapeHtml(order.pincode)}
  </div>
  <p style="font-family:Arial,sans-serif;font-size:14px"><b>Notes:</b> ${order.notes ? escapeHtml(order.notes) : '—'}</p>
</div>`;
  return { subject, body, html };
}

async function markEmail(id, ok, msg) {
  try {
    await db.execute({ sql: 'UPDATE orders SET email_sent = ?, email_error = ? WHERE id = ?', args: [ok ? 1 : 0, ok ? null : msg, id] });
  } catch (e) {
    console.error('[email] db update failed', e.message);
  }
}

async function sendOwnerAlert(order) {
  const { subject, body, html } = buildEmail(order);

  if (!emailReady) {
    const msg = 'RESEND_API_KEY not configured on the server.';
    console.error(`[email] alert skipped for ${order.order_code}: ${msg}`);
    await markEmail(order.id, false, msg);
    return;
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'Veloura <onboarding@resend.dev>', to: [OWNER_EMAIL], subject, text: body, html }),
    });
    const ok = res.ok;
    let msg = null;
    if (!ok) {
      const errBody = await res.text().catch(() => '');
      msg = `Resend ${res.status}: ${errBody}`.slice(0, 400);
    }
    if (!ok) console.error(`[email] alert failed for ${order.order_code}: ${msg}`);
    else console.log(`[email] alert sent for ${order.order_code}`);
    await markEmail(order.id, ok, msg);
  } catch (err) {
    const msg = String(err.message || err).slice(0, 400);
    console.error(`[email] alert failed for ${order.order_code}: ${msg}`);
    await markEmail(order.id, false, msg);
  }
}

/* ---------------- app ---------------- */
const app = express();
app.set('trust proxy', 1); // Render sits behind a proxy — needed for accurate per-IP rate limiting
app.use(express.json({ limit: '256kb' }));
app.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Headers', 'Content-Type, x-admin-key');
  res.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

/* ---------------- spam / abuse protection ----------------
   Two layers: a general per-IP limiter on all API routes, and a tighter
   per-IP limiter specifically on order placement (the thing worth spamming). */
const generalLimiter = rateLimit({
  windowMs: 60 * 1000, max: 60,
  standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many requests — please slow down and try again in a minute.' },
});
const orderLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 8,
  standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many orders from this connection recently. Please wait a bit and try again, or call us if it\'s urgent.' },
});
// A little extra: also throttle repeat orders from the exact same phone
// number, since someone could spam from many IPs but not many phone numbers.
const recentOrdersByPhone = new Map(); // phone -> array of timestamps
function phoneRateLimited(phone) {
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  const arr = (recentOrdersByPhone.get(phone) || []).filter((t) => now - t < windowMs);
  arr.push(now);
  recentOrdersByPhone.set(phone, arr);
  if (recentOrdersByPhone.size > 5000) recentOrdersByPhone.clear(); // simple memory cap, resets rarely
  return arr.length > 6;
}
app.use('/api/', generalLimiter);

app.get('/api/health', (_req, res) => res.json({ ok: true, time: istParts().display }));
app.get('/api/catalog', (_req, res) =>
  res.json({
    products: Object.values(CATALOG), delivery_fee: DELIVERY_FEE, free_delivery_above: FREE_DELIVERY_ABOVE,
    upi_id: OWNER_UPI_ID || null, upi_name: OWNER_UPI_NAME,
  })
);

/* ---- coupon preview: check a code against the current cart subtotal ---- */
app.post('/api/coupon/validate', (req, res) => {
  const { code, subtotal } = req.body || {};
  const result = computeCoupon(code, Number(subtotal) || 0);
  res.json(result);
});

/* ---- public stock status: which flavours are currently 86'd ---- */
app.get('/api/stock', async (_req, res) => {
  try {
    const rs = await db.execute('SELECT flavour_id, available, quantity FROM flavour_stock');
    const out = rs.rows.filter((r) => (r.quantity != null ? Number(r.quantity) <= 0 : !Number(r.available))).map((r) => r.flavour_id);
    res.json({ out_of_stock: out });
  } catch (e) {
    console.error('[stock] read failed', e.message);
    res.json({ out_of_stock: [] }); // fail open — never block the shop over this
  }
});

/* ---- public order tracking: order code + last 4 digits of phone ---- */
app.get('/api/track/:code', async (req, res) => {
  const code = String(req.params.code || '').trim().toUpperCase();
  const last4 = String(req.query.phone4 || '').trim();
  if (!code || !/^\d{4}$/.test(last4)) {
    return res.status(400).json({ error: 'Provide the order code and the last 4 digits of the phone number used.' });
  }
  try {
    const rs = await db.execute({ sql: 'SELECT * FROM orders WHERE order_code = ?', args: [code] });
    const order = rs.rows[0];
    if (!order || String(order.phone).slice(-4) !== last4) {
      return res.status(404).json({ error: 'not_found' });
    }
    let location = null;
    if (order.status === 'out_for_delivery') {
      const locRs = await db.execute({ sql: 'SELECT lat, lng, updated_at FROM order_location WHERE order_id = ?', args: [order.id] });
      if (locRs.rows[0]) location = { lat: locRs.rows[0].lat, lng: locRs.rows[0].lng, updated_at: locRs.rows[0].updated_at };
    }
    res.json({
      order_code: order.order_code,
      status: order.status,
      created_at_ist: order.created_at_ist,
      total: order.total,
      items: JSON.parse(order.items),
      location,
    });
  } catch (e) {
    console.error('[track] failed', e.message);
    res.status(500).json({ error: 'server_error' });
  }
});

/* ---- customer order history: full phone number, most recent first ---- */
app.get('/api/my-orders', async (req, res) => {
  const phone = String(req.query.phone || '').replace(/[\s-]/g, '').replace(/^\+91/, '');
  if (!/^[6-9]\d{9}$/.test(phone)) {
    return res.status(400).json({ error: 'Enter a valid 10-digit mobile number.' });
  }
  try {
    const rs = await db.execute({ sql: 'SELECT * FROM orders WHERE phone = ? ORDER BY id DESC LIMIT 50', args: [phone] });
    res.json({
      orders: rs.rows.map((o) => ({
        order_code: o.order_code, created_at_ist: o.created_at_ist, status: o.status,
        total: o.total, items: JSON.parse(o.items),
      })),
    });
  } catch (e) {
    console.error('[my-orders] failed', e.message);
    res.status(500).json({ error: 'server_error' });
  }
});

/* ---- delivery location sharing ----
   A delivery person opens deliver.html, picks the order, and their phone's
   GPS position gets posted here every few seconds while status is
   "out_for_delivery". The customer's tracking page polls it back out. No
   separate rider accounts — whoever has the order code + admin key can post
   for it, which is fine for a one-person/small-team delivery operation. */
app.post('/api/orders/:code/location', requireAdmin, async (req, res) => {
  const code = String(req.params.code || '').trim().toUpperCase();
  const lat = Number((req.body || {}).lat);
  const lng = Number((req.body || {}).lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return res.status(400).json({ error: 'invalid_coordinates' });
  try {
    const rs = await db.execute({ sql: 'SELECT id FROM orders WHERE order_code = ?', args: [code] });
    const order = rs.rows[0];
    if (!order) return res.status(404).json({ error: 'not_found' });
    await db.execute({
      sql: `INSERT INTO order_location (order_id, lat, lng, updated_at) VALUES (?, ?, ?, ?)
            ON CONFLICT(order_id) DO UPDATE SET lat = excluded.lat, lng = excluded.lng, updated_at = excluded.updated_at`,
      args: [order.id, lat, lng, new Date().toISOString()],
    });
    res.json({ ok: true });
  } catch (e) {
    console.error('[location] update failed', e.message);
    res.status(500).json({ error: 'server_error' });
  }
});

app.post('/api/orders', orderLimiter, async (req, res) => {
  const b = req.body || {};
  const errors = {};
  const name = String(b.customer_name || '').trim();
  const phone = String(b.phone || '').replace(/[\s-]/g, '').replace(/^\+91/, '');
  const email = String(b.email || '').trim();
  const address = String(b.address || '').trim();
  const city = String(b.city || '').trim();
  const pincode = String(b.pincode || '').trim();
  const payment = String(b.payment_method || '').toUpperCase();
  const notes = String(b.notes || '').trim().slice(0, 500);

  if (name.length < 2) errors.customer_name = 'Please enter your full name.';
  if (!/^[6-9]\d{9}$/.test(phone)) errors.phone = 'Enter a valid 10-digit Indian mobile number.';
  else if (phoneRateLimited(phone)) errors.phone = 'Too many orders from this number recently. Please wait a bit, or call us if it\'s urgent.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) errors.email = 'Enter a valid email address.';
  if (address.length < 8) errors.address = 'Please enter your full delivery address.';
  if (city.length < 2) errors.city = 'Please enter your city.';
  if (!/^\d{6}$/.test(pincode)) errors.pincode = 'Pincode must be 6 digits.';
  if (payment !== 'UPI' && payment !== 'COD') errors.payment_method = 'Choose UPI or Cash on Delivery.';

  let stockRows = [];
  try {
    const rs = await db.execute('SELECT flavour_id, available, quantity FROM flavour_stock');
    stockRows = rs.rows;
  } catch (e) { /* fail open */ }
  const outOfStock = new Set(
    stockRows.filter((r) => (r.quantity != null ? Number(r.quantity) <= 0 : !Number(r.available))).map((r) => r.flavour_id)
  );

  const rawItems = Array.isArray(b.items) ? b.items : [];
  const items = [];
  const flavourQtyNeeded = {}; // flavourId -> total qty ordered, for the decrement step below
  for (const it of rawItems) {
    const p = CATALOG[String(it && it.id)];
    const qty = Math.floor(Number(it && it.qty));
    if (!p || !Number.isFinite(qty) || qty < 1 || qty > 50) continue;
    const flavourId = it && it.flavourId ? String(it.flavourId) : '';
    if (flavourId && outOfStock.has(flavourId)) { errors.items = 'One of the flavours in your cart just sold out. Please remove it and try again.'; continue; }
    const flavourName = cleanFlavourName(it && it.flavour);
    const baseName = cleanFlavourName(it && it.base); // e.g. "Triple Stack Signature" from the 3D counter
    const premium = flavourId && PREMIUM_FLAVOURS.has(flavourId) ? 60 : 0;
    const label = baseName || p.name;
    const itemName = flavourName ? `${label} — ${flavourName}` : label;
    items.push({ id: p.id, name: itemName, price: p.price + premium, qty });
    if (flavourId) flavourQtyNeeded[flavourId] = (flavourQtyNeeded[flavourId] || 0) + qty;
  }
  if (!items.length && !errors.items) errors.items = 'Your cart is empty.';

  if (Object.keys(errors).length) return res.status(400).json({ error: 'validation_failed', errors });

  const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);
  let delivery_fee = subtotal >= FREE_DELIVERY_ABOVE ? 0 : DELIVERY_FEE;
  let discount = 0;
  let couponCode = '';
  if (b.coupon_code) {
    const cr = computeCoupon(b.coupon_code, subtotal);
    if (!cr.ok) return res.status(400).json({ error: 'validation_failed', errors: { coupon_code: cr.error } });
    discount = cr.discount;
    if (cr.freeDelivery) delivery_fee = 0;
    couponCode = String(b.coupon_code).trim().toUpperCase();
  }
  const total = Math.max(0, subtotal + delivery_fee - discount);
  const now = new Date();
  const ist = istParts(now);

  try {
    const order_code = await nextOrderCode();
    const insertResult = await db.execute({
      sql: `INSERT INTO orders (order_code, created_at, created_at_ist, customer_name, phone, email, address, city,
              pincode, items, subtotal, delivery_fee, total, payment_method, notes, status, email_sent, coupon_code, discount)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'new',0,?,?)`,
      args: [order_code, now.toISOString(), ist.display, name, phone, email, address, city, pincode,
             JSON.stringify(items), subtotal, delivery_fee, total, payment, notes, couponCode || null, discount],
    });

    const orderId = Number(insertResult.lastInsertRowid);
    const orderRow = { id: orderId, order_code, created_at: now.toISOString(), created_at_ist: ist.display,
      customer_name: name, phone, email, address, city, pincode, items: JSON.stringify(items),
      subtotal, delivery_fee, total, payment_method: payment, notes, coupon_code: couponCode, discount };

    // Decrement tracked-quantity flavours. The WHERE clause requires enough
    // stock to still be there, so two people racing to buy the last one can't
    // both succeed — whichever request loses just won't decrement further
    // (harmless; worst case stock reads slightly stale until the next check).
    for (const [flavourId, qtyNeeded] of Object.entries(flavourQtyNeeded)) {
      await db.execute({
        sql: 'UPDATE flavour_stock SET quantity = quantity - ? WHERE flavour_id = ? AND quantity IS NOT NULL AND quantity >= ?',
        args: [qtyNeeded, flavourId, qtyNeeded],
      }).catch((e) => console.error('[stock] decrement failed for', flavourId, e.message));
    }

    setImmediate(() => {
      sendOwnerAlert(orderRow).catch((e) => console.error('[email] threw', e.message));
    });

    res.status(201).json({ ok: true, order_code, subtotal, delivery_fee, discount, coupon_code: couponCode || null, total, payment_method: payment, created_at_ist: ist.display });
  } catch (e) {
    console.error('[orders] insert failed', e.message);
    res.status(500).json({ error: 'server_error', message: 'Could not save your order. Please try again.' });
  }
});

app.get('/api/orders', requireAdmin, async (_req, res) => {
  try {
    const rs = await db.execute('SELECT * FROM orders ORDER BY id DESC');
    res.json({ orders: rs.rows.map((r) => ({ ...r, items: JSON.parse(r.items), email_sent: !!r.email_sent })) });
  } catch (e) {
    console.error('[orders] list failed', e.message);
    res.status(500).json({ error: 'server_error' });
  }
});

const STATUSES = ['new', 'confirmed', 'out_for_delivery', 'delivered', 'cancelled'];
app.patch('/api/orders/:id/status', requireAdmin, async (req, res) => {
  const status = String((req.body || {}).status || '');
  if (!STATUSES.includes(status)) return res.status(400).json({ error: 'invalid_status', allowed: STATUSES });
  try {
    const r = await db.execute({ sql: 'UPDATE orders SET status = ? WHERE id = ?', args: [status, Number(req.params.id)] });
    if (!r.rowsAffected) return res.status(404).json({ error: 'not_found' });
    res.json({ ok: true, id: Number(req.params.id), status });
  } catch (e) {
    console.error('[orders] status update failed', e.message);
    res.status(500).json({ error: 'server_error' });
  }
});

app.get('/api/admin/summary', requireAdmin, async (_req, res) => {
  try {
    const rs = await db.execute("SELECT total, created_at, status FROM orders WHERE status != 'cancelled'");
    const todayKey = istParts().dateKey;
    let ordersToday = 0, revenueToday = 0, revenueTotal = 0;
    for (const r of rs.rows) {
      revenueTotal += Number(r.total);
      if (istParts(new Date(r.created_at)).dateKey === todayKey) {
        ordersToday += 1;
        revenueToday += Number(r.total);
      }
    }
    const totalRs = await db.execute('SELECT COUNT(*) AS c FROM orders');
    const emailRs = await db.execute('SELECT COUNT(*) AS c FROM orders WHERE email_sent = 0');
    res.json({
      orders_today: ordersToday, revenue_today: revenueToday,
      total_orders: Number(totalRs.rows[0].c), revenue_total: revenueTotal,
      email_failures: Number(emailRs.rows[0].c),
    });
  } catch (e) {
    console.error('[summary] failed', e.message);
    res.status(500).json({ error: 'server_error' });
  }
});

/* ---- admin: menu / stock toggle + quantity ---- */
app.get('/api/admin/stock', requireAdmin, async (_req, res) => {
  try {
    const rs = await db.execute('SELECT flavour_id, available, quantity FROM flavour_stock');
    const overrides = new Map(rs.rows.map((r) => [r.flavour_id, r]));
    res.json({
      low_stock_threshold: LOW_STOCK_THRESHOLD,
      flavours: FLAVOURS.map((f) => {
        const o = overrides.get(f.id);
        const quantity = o && o.quantity != null ? Number(o.quantity) : null; // null = not tracked (unlimited)
        const available = o ? !!Number(o.available) : true;
        return {
          id: f.id, name: f.name,
          available: quantity != null ? quantity > 0 : available,
          quantity,
          isLow: quantity != null && quantity > 0 && quantity <= LOW_STOCK_THRESHOLD,
        };
      }),
    });
  } catch (e) {
    console.error('[stock] admin list failed', e.message);
    res.status(500).json({ error: 'server_error' });
  }
});

// Toggle available on/off (when quantity isn't being tracked for this flavour).
app.patch('/api/admin/stock/:flavourId', requireAdmin, async (req, res) => {
  const flavourId = String(req.params.flavourId || '');
  const available = !!(req.body || {}).available;
  if (!FLAVOURS.some((f) => f.id === flavourId)) return res.status(404).json({ error: 'not_found' });
  try {
    await db.execute({
      sql: `INSERT INTO flavour_stock (flavour_id, available) VALUES (?, ?)
            ON CONFLICT(flavour_id) DO UPDATE SET available = excluded.available`,
      args: [flavourId, available ? 1 : 0],
    });
    res.json({ ok: true, id: flavourId, available });
  } catch (e) {
    console.error('[stock] toggle failed', e.message);
    res.status(500).json({ error: 'server_error' });
  }
});

// Set an exact quantity for a flavour. Once a number is set, that flavour's
// availability is driven by the count (0 = sold out) instead of the toggle.
app.patch('/api/admin/stock/:flavourId/quantity', requireAdmin, async (req, res) => {
  const flavourId = String(req.params.flavourId || '');
  const quantity = Math.max(0, Math.floor(Number((req.body || {}).quantity)));
  if (!FLAVOURS.some((f) => f.id === flavourId)) return res.status(404).json({ error: 'not_found' });
  if (!Number.isFinite(quantity)) return res.status(400).json({ error: 'invalid_quantity' });
  try {
    await db.execute({
      sql: `INSERT INTO flavour_stock (flavour_id, available, quantity) VALUES (?, 1, ?)
            ON CONFLICT(flavour_id) DO UPDATE SET quantity = excluded.quantity, available = 1`,
      args: [flavourId, quantity],
    });
    res.json({ ok: true, id: flavourId, quantity, isLow: quantity > 0 && quantity <= LOW_STOCK_THRESHOLD });
  } catch (e) {
    console.error('[stock] quantity update failed', e.message);
    res.status(500).json({ error: 'server_error' });
  }
});

/* static files so the sandbox can also serve the site directly */
// never serve the server source over HTTP
app.use((req, res, next) => {
  if (/^\/(server\.js|package(-lock)?\.json|\.env)/i.test(req.path)) return res.status(404).end();
  next();
});
app.use(express.static(ROOT, { extensions: ['html'] }));

initDb()
  .then(() => {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Veloura backend listening on ${PORT} · admin key ${ADMIN_KEY === 'veloura-aditya-2026' ? '(default)' : '(from env)'} · db ${process.env.TURSO_DATABASE_URL ? 'Turso (persistent)' : 'local file (NOT persistent on Render)'}`);
    });
  })
  .catch((e) => {
    console.error('[db] failed to initialize:', e.message);
    process.exit(1);
  });
