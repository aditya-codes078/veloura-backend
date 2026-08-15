/* Veloura order backend — Express + SQLite (CommonJS, no build step) */
try { require('dotenv').config(); } catch (e) { /* dotenv optional — env vars can also be set by the host */ }
const path = require('path');
const fs = require('fs');
const express = require('express');
const { DatabaseSync } = require('node:sqlite'); // built into Node 24 — no native compilation needed

const PORT = process.env.PORT ? Number(process.env.PORT) : 8000;
const ADMIN_KEY = process.env.ADMIN_KEY || 'veloura-aditya-2026';
const OWNER_EMAIL = process.env.OWNER_EMAIL || 'a75127130@gmail.com';
const ROOT = __dirname;
const DB_PATH = process.env.DB_PATH || path.join(ROOT, '..', 'veloura-data', 'data.db');

/* ---------------- email transport ----------------
   Order alerts are sent through Resend (https://resend.com) over HTTPS.
   We deliberately do NOT use Gmail SMTP here — most free hosts (Render,
   Railway, etc) block outbound SMTP ports to stop spam, which makes Gmail
   sending fail with "Connection timeout". Resend sends over plain HTTPS
   (the same protocol as any web request), so it isn't blocked.

   Setup (2 minutes, no credit card):
     1. Sign up at https://resend.com using a75127130@gmail.com
        (sign up with THIS exact email — see step 3 below)
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
function cleanFlavourName(s) {
  return String(s || '').replace(/[<>]/g, '').trim().slice(0, 60);
}
function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
const DELIVERY_FEE = 49;
const FREE_DELIVERY_ABOVE = 499;

/* ---------------- db ---------------- */
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true }); // create the data folder on first run
const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL;');
db.exec(`
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

function nextOrderCode() {
  const { ymd } = istParts();
  const row = db
    .prepare("SELECT COUNT(*) AS c FROM orders WHERE order_code LIKE ?")
    .get(`VLR-${ymd}-%`);
  return `VLR-${ymd}-${String(row.c + 1).padStart(4, '0')}`;
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
    `Delivery: ${order.delivery_fee === 0 ? 'Free' : inr(order.delivery_fee)}`,
    `Total: ${inr(order.total)}`,
    `Payment: ${order.payment_method}`,
    `Notes: ${order.notes || '—'}`,
  ].join('\n');
  const html = `
<div style="font-family:Georgia,serif;max-width:560px;color:#2A1E17">
  <p style="font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:#B47F22;margin:0 0 6px">Veloura Ice Cream Parlour &amp; Café · Kanpur</p>
  <h2 style="margin:0 0 4px;font-size:22px">New order ${order.order_code}</h2>
  <p style="margin:0 0 18px;color:#6B564A;font-size:13px">${order.created_at_ist}</p>
  <table style="width:100%;border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px">
    ${rows}
    <tr><td style="padding:8px 0">Subtotal</td><td style="padding:8px 0;text-align:right">${inr(order.subtotal)}</td></tr>
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

function sendOwnerAlert(order) {
  const { subject, body, html } = buildEmail(order);

  if (!emailReady) {
    const msg = 'RESEND_API_KEY not configured on the server.';
    console.error(`[email] alert skipped for ${order.order_code}: ${msg}`);
    try {
      db.prepare('UPDATE orders SET email_sent = 0, email_error = ? WHERE id = ?').run(msg, order.id);
    } catch (e) {
      console.error('[email] db update failed', e.message);
    }
    return;
  }

  fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Veloura <onboarding@resend.dev>',
      to: [OWNER_EMAIL],
      subject,
      text: body,
      html,
    }),
  })
    .then(async (res) => {
      const ok = res.ok;
      let msg = null;
      if (!ok) {
        const errBody = await res.text().catch(() => '');
        msg = `Resend ${res.status}: ${errBody}`.slice(0, 400);
      }
      if (!ok) console.error(`[email] alert failed for ${order.order_code}: ${msg}`);
      else console.log(`[email] alert sent for ${order.order_code}`);
      try {
        db.prepare('UPDATE orders SET email_sent = ?, email_error = ? WHERE id = ?').run(
          ok ? 1 : 0,
          ok ? null : msg,
          order.id
        );
      } catch (e) {
        console.error('[email] db update failed', e.message);
      }
    })
    .catch((err) => {
      const msg = String(err.message || err).slice(0, 400);
      console.error(`[email] alert failed for ${order.order_code}: ${msg}`);
      try {
        db.prepare('UPDATE orders SET email_sent = 0, email_error = ? WHERE id = ?').run(msg, order.id);
      } catch (e) {
        console.error('[email] db update failed', e.message);
      }
    });
}

/* ---------------- app ---------------- */
const app = express();
app.use(express.json({ limit: '256kb' }));
app.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Headers', 'Content-Type, x-admin-key');
  res.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.get('/api/health', (_req, res) => res.json({ ok: true, time: istParts().display }));
app.get('/api/catalog', (_req, res) =>
  res.json({ products: Object.values(CATALOG), delivery_fee: DELIVERY_FEE, free_delivery_above: FREE_DELIVERY_ABOVE })
);

app.post('/api/orders', (req, res) => {
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
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) errors.email = 'Enter a valid email address.';
  if (address.length < 8) errors.address = 'Please enter your full delivery address.';
  if (city.length < 2) errors.city = 'Please enter your city.';
  if (!/^\d{6}$/.test(pincode)) errors.pincode = 'Pincode must be 6 digits.';
  if (payment !== 'UPI' && payment !== 'COD') errors.payment_method = 'Choose UPI or Cash on Delivery.';

  const rawItems = Array.isArray(b.items) ? b.items : [];
  const items = [];
  for (const it of rawItems) {
    const p = CATALOG[String(it && it.id)];
    const qty = Math.floor(Number(it && it.qty));
    if (!p || !Number.isFinite(qty) || qty < 1 || qty > 50) continue;
    const flavourId = it && it.flavourId ? String(it.flavourId) : '';
    const flavourName = cleanFlavourName(it && it.flavour);
    const baseName = cleanFlavourName(it && it.base); // e.g. "Triple Stack Signature" from the 3D counter
    const premium = flavourId && PREMIUM_FLAVOURS.has(flavourId) ? 60 : 0;
    const label = baseName || p.name;
    const name = flavourName ? `${label} — ${flavourName}` : label;
    items.push({ id: p.id, name, price: p.price + premium, qty });
  }
  if (!items.length) errors.items = 'Your cart is empty.';

  if (Object.keys(errors).length) return res.status(400).json({ error: 'validation_failed', errors });

  const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);
  const delivery_fee = subtotal >= FREE_DELIVERY_ABOVE ? 0 : DELIVERY_FEE;
  const total = subtotal + delivery_fee;
  const now = new Date();
  const ist = istParts(now);
  const order_code = nextOrderCode();

  const info = db
    .prepare(
      `INSERT INTO orders (order_code, created_at, created_at_ist, customer_name, phone, email, address, city,
        pincode, items, subtotal, delivery_fee, total, payment_method, notes, status, email_sent)
       VALUES (@order_code,@created_at,@created_at_ist,@customer_name,@phone,@email,@address,@city,
        @pincode,@items,@subtotal,@delivery_fee,@total,@payment_method,@notes,'new',0)`
    )
    .run({
      order_code,
      created_at: now.toISOString(),
      created_at_ist: ist.display,
      customer_name: name,
      phone,
      email,
      address,
      city,
      pincode,
      items: JSON.stringify(items),
      subtotal,
      delivery_fee,
      total,
      payment_method: payment,
      notes,
    });

  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(info.lastInsertRowid);
  setImmediate(() => {
    try { sendOwnerAlert(order); } catch (e) { console.error('[email] threw', e.message); }
  });

  res.status(201).json({
    ok: true,
    order_code,
    subtotal,
    delivery_fee,
    total,
    payment_method: payment,
    created_at_ist: ist.display,
  });
});

app.get('/api/orders', requireAdmin, (_req, res) => {
  const rows = db.prepare('SELECT * FROM orders ORDER BY id DESC').all();
  res.json({
    orders: rows.map((r) => ({ ...r, items: JSON.parse(r.items), email_sent: !!r.email_sent })),
  });
});

const STATUSES = ['new', 'confirmed', 'out_for_delivery', 'delivered', 'cancelled'];
app.patch('/api/orders/:id/status', requireAdmin, (req, res) => {
  const status = String((req.body || {}).status || '');
  if (!STATUSES.includes(status)) return res.status(400).json({ error: 'invalid_status', allowed: STATUSES });
  const r = db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(status, Number(req.params.id));
  if (!r.changes) return res.status(404).json({ error: 'not_found' });
  res.json({ ok: true, id: Number(req.params.id), status });
});

app.get('/api/admin/summary', requireAdmin, (_req, res) => {
  const rows = db.prepare("SELECT total, created_at, status FROM orders WHERE status != 'cancelled'").all();
  const todayKey = istParts().dateKey;
  let ordersToday = 0, revenueToday = 0, revenueTotal = 0;
  for (const r of rows) {
    revenueTotal += r.total;
    if (istParts(new Date(r.created_at)).dateKey === todayKey) {
      ordersToday += 1;
      revenueToday += r.total;
    }
  }
  const totalOrders = db.prepare('SELECT COUNT(*) AS c FROM orders').get().c;
  const emailFailures = db.prepare('SELECT COUNT(*) AS c FROM orders WHERE email_sent = 0').get().c;
  res.json({ orders_today: ordersToday, revenue_today: revenueToday, total_orders: totalOrders, revenue_total: revenueTotal, email_failures: emailFailures });
});

/* static files so the sandbox can also serve the site directly */
// never serve the database or the server source over HTTP
app.use((req, res, next) => {
  if (/^\/(data\.db|server\.js|package(-lock)?\.json)/i.test(req.path)) return res.status(404).end();
  next();
});
app.use(express.static(ROOT, { extensions: ['html'] }));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Veloura backend listening on ${PORT} · db ${DB_PATH} · admin key ${ADMIN_KEY === 'veloura-aditya-2026' ? '(default)' : '(from env)'}`);
  if (!fs.existsSync(DB_PATH)) console.log('created new database');
});
