/* Veloura — page behaviour: nav, reveals, flavour cabinet, variety switcher,
   size control, parlour tabs, info card. The 3D stage is driven through window.Veloura. */
import { VARIETIES, SIZES } from './varieties.js';
import { FLAVOURS, FLAVOUR_BY_ID, TAG_LABEL } from './flavours.js';

const PREMIUM = new Set(['dubai', 'pistachio', 'pistiramisu', 'ube']);
const inr = (n) => '₹' + Math.round(n).toLocaleString('en-IN');
const round10 = (n) => Math.round(n / 10) * 10;

const state = { variety: 'cone', size: 'regular', flavour: 'vanilla', outlet: 'all' };

const getVariety = (id) => VARIETIES.find((v) => v.id === id);
const getSize = (id) => SIZES.find((s) => s.id === id);

function priceFor(varietyId, sizeId, flavourId) {
  const v = getVariety(varietyId), s = getSize(sizeId);
  const premium = PREMIUM.has(flavourId) ? 60 : 0;
  const scales = v.scoopBased ? s.mult : 1 + (s.mult - 1) * 0.45;
  return round10(v.price * scales) + premium;
}

/* ---------------- sticky nav ---------------- */
const nav = document.getElementById('nav');
const onScroll = () => nav.classList.toggle('is-stuck', window.scrollY > 12);
window.addEventListener('scroll', onScroll, { passive: true });
onScroll();

/* ---------------- variety icons ---------------- */
const ICONS = {
  cone: '<path d="M6 9h12l-6 12Z"/><circle cx="12" cy="6.4" r="3.6"/>',
  triple: '<path d="M7 12h10l-5 10Z"/><circle cx="12" cy="9.6" r="3.1"/><circle cx="12" cy="5.6" r="2.4"/>',
  glass: '<path d="M7 6h10l-1.6 7a3.4 3.4 0 0 1-6.8 0Z"/><path d="M12 16v4M9 21h6"/>',
  kulfi: '<path d="M8.5 4h7l-1 12h-5Z"/><path d="M12 16v5"/>',
  popsicle: '<rect x="7" y="3" width="10" height="13" rx="4.5"/><path d="M12 16v5"/>',
  bowl: '<path d="M4 12h16a8 8 0 0 1-16 0Z"/><circle cx="9.5" cy="8.6" r="3"/><circle cx="15" cy="9" r="2.6"/>',
  mochi: '<ellipse cx="8" cy="12" rx="3.4" ry="2.8"/><ellipse cx="15.5" cy="12" rx="3.4" ry="2.8"/><path d="M3 16h18"/>',
  sandwich: '<rect x="4" y="6" width="16" height="3" rx="1.2"/><rect x="4.6" y="10" width="14.8" height="4" rx="1"/><rect x="4" y="15" width="16" height="3" rx="1.2"/>',
  cup: '<path d="M7 8h10l-1.4 10H8.4Z"/><path d="M6 8h12"/><circle cx="12" cy="6" r="2.6"/>',
  tub: '<path d="M6 8h12l-1 11H7Z"/><ellipse cx="12" cy="8" rx="6" ry="2"/>',
  falooda: '<path d="M8.6 4h6.8l-1 16H9.6Z"/><path d="M10 3l5 17" /><circle cx="12" cy="3" r="2"/>',
  shake: '<path d="M7 8h10l-1.2 11H8.2Z"/><path d="M6 8h12"/><circle cx="10.6" cy="5.4" r="2.4"/><path d="M15 8V3"/>',
};
const icon = (k) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[k] || ICONS.cone}</svg>`;

/* ---------------- parlours ---------------- */
const PARLOURS = [
  {
    id: 'kanpur', name: 'Veloura Swaroop Nagar', city: 'Kanpur',
    line: 'The flagship. Where the churn happens and where we get told off if the cone isn\'t warm.',
    address: '14/78, Ratan Lal Nagar Road, Swaroop Nagar, Kanpur, Uttar Pradesh 208002',
    phone: '+91 90007 41208', hours: '11:00 am – 11:30 pm, daily',
    signatures: ['triple', 'kulfi', 'tub'],
  },
  {
    id: 'lucknow', name: 'Veloura Hazratganj', city: 'Lucknow',
    line: 'A heritage-street café with cane chairs, ceiling fans and a kulfi counter that never stops.',
    address: '3 Ashok Marg, opposite Halwasiya Court, Hazratganj, Lucknow, Uttar Pradesh 226001',
    phone: '+91 90005 33471', hours: '12:00 pm – 12:00 am, daily',
    signatures: ['kulfi', 'falooda', 'bowl'],
  },
  {
    id: 'delhi', name: 'Veloura Connaught Place', city: 'New Delhi',
    line: 'A late-night sundae bar. Open till 1 am, because Delhi decides on dessert at 12:40.',
    address: 'M-Block, Inner Circle, Connaught Place, New Delhi 110001',
    phone: '+91 90006 88120', hours: '1:00 pm – 1:00 am, daily',
    signatures: ['sundae', 'freakshake', 'triple'],
  },
  {
    id: 'bengaluru', name: 'Veloura Indiranagar', city: 'Bengaluru',
    line: 'Vegan and low-sugar counter. Coconut-cream bases, oat milk on request, no eye-rolling.',
    address: '712, 12th Main Road, HAL 2nd Stage, Indiranagar, Bengaluru, Karnataka 560038',
    phone: '+91 90008 25640', hours: '11:30 am – 11:00 pm, daily',
    signatures: ['gelato', 'popsicle', 'mochi'],
  },
  {
    id: 'mumbai', name: 'Veloura Bandra West', city: 'Mumbai',
    line: 'A beachside kiosk with a freakshake bar. Salt in the air, sprinkles on everything.',
    address: 'Shop 4, Carter Road Promenade, Bandra West, Mumbai, Maharashtra 400050',
    phone: '+91 90009 17734', hours: '12:00 pm – 12:30 am, daily',
    signatures: ['freakshake', 'sandwich', 'mochi'],
  },
];

/* ---------------- variety chips ---------------- */
const varietyChips = document.getElementById('variety-chips');
VARIETIES.forEach((v) => {
  const b = document.createElement('button');
  b.className = 'chip chip-v' + (v.id === state.variety ? ' is-active' : '');
  b.dataset.variety = v.id;
  b.type = 'button';
  b.innerHTML = `${icon(v.icon)}<span>${v.short}</span><em class="star" aria-hidden="true">★</em>`;
  b.addEventListener('click', () => selectVariety(v.id));
  varietyChips.appendChild(b);
});

const varietyNote = document.getElementById('variety-note');
const varietyPrice = document.getElementById('variety-price');

function selectVariety(id) {
  state.variety = id;
  [...varietyChips.children].forEach((c) => c.classList.toggle('is-active', c.dataset.variety === id));
  const v = getVariety(id);
  varietyNote.textContent = v.note;
  if (window.Veloura) window.Veloura.setVariety(id);
  syncPrices();
  document.querySelectorAll('.variety-card').forEach((c) => c.classList.toggle('is-active', c.dataset.variety === id));
}

/* ---------------- size segmented control ---------------- */
const seg = document.getElementById('size-seg');
SIZES.forEach((s) => {
  const b = document.createElement('button');
  b.className = 'seg-btn' + (s.id === state.size ? ' is-active' : '');
  b.type = 'button';
  b.dataset.size = s.id;
  b.innerHTML = `<b>${s.label}</b><span>${s.ml}</span>`;
  b.addEventListener('click', () => selectSize(s.id));
  seg.appendChild(b);
});
function selectSize(id) {
  state.size = id;
  [...seg.children].forEach((c) => c.classList.toggle('is-active', c.dataset.size === id));
  if (window.Veloura) window.Veloura.setSize(id);
  syncPrices();
}

/* ---------------- flavour quick chips ---------------- */
const quick = document.getElementById('flavour-quick');
FLAVOURS.slice(0, 6).concat(FLAVOUR_BY_ID.vanilla).forEach((f, i, arr) => {
  if (arr.findIndex((x) => x.id === f.id) !== i) return;
  const b = document.createElement('button');
  b.className = 'chip' + (f.id === state.flavour ? ' is-active' : '');
  b.type = 'button';
  b.dataset.flavour = f.id;
  b.innerHTML = `<i style="--sw:#${f.base.toString(16).padStart(6, '0')}"></i>${f.name.replace(/ \(.*\)$/, '')}`;
  b.addEventListener('click', () => selectFlavour(f.id));
  quick.appendChild(b);
});

const flavourNote = document.getElementById('flavour-note');
const flavourBadge = document.getElementById('flavour-badge');
flavourNote.style.transition = 'opacity .18s ease';

function selectFlavour(id, scroll) {
  state.flavour = id;
  const f = FLAVOUR_BY_ID[id];
  [...quick.children].forEach((c) => c.classList.toggle('is-active', c.dataset.flavour === id));
  document.querySelectorAll('.flavour-card').forEach((c) => c.classList.toggle('is-active', c.dataset.flavour === id));
  if (window.Veloura) window.Veloura.setFlavour(id);
  flavourNote.style.opacity = '0';
  setTimeout(() => {
    flavourNote.textContent = f.note + ' ' + f.line2;
    flavourNote.style.opacity = '1';
  }, 160);
  flavourBadge.textContent = TAG_LABEL[f.tag] || 'Classic';
  document.documentElement.style.setProperty('--flavour-accent', f.accentHex);
  syncPrices();
  if (scroll) {
    document.getElementById('studio').scrollIntoView({ behavior: 'smooth', block: 'start' });
    window.dispatchEvent(new CustomEvent('veloura:refocus'));
  }
}

/* ---------------- price sync ---------------- */
const sizeLine = document.getElementById('size-line');
const sizeMeta = document.getElementById('size-meta');
const studioCtaSummary = document.getElementById('studio-cta-summary');
const studioCtaPrice = document.getElementById('studio-cta-price');
function syncPrices() {
  const v = getVariety(state.variety), s = getSize(state.size);
  const p = priceFor(state.variety, state.size, state.flavour);
  varietyPrice.textContent = inr(p);
  const scoops = v.scoopBased ? `${s.scoops} scoop${s.scoops > 1 ? 's' : ''}` : 'single piece';
  sizeMeta.textContent = `${s.ml} · ${scoops}`;
  sizeLine.textContent = `${s.label} · ${s.ml} · ${scoops} · ${inr(p)}${PREMIUM.has(state.flavour) ? ' (incl. +₹60 premium)' : ''}`;
  document.querySelectorAll('.variety-card').forEach((c) => {
    const id = c.dataset.variety;
    const el = c.querySelector('.vc-price');
    if (el) el.textContent = `Mini ${inr(priceFor(id, 'mini', state.flavour))} · Regular ${inr(priceFor(id, 'regular', state.flavour))} · Large ${inr(priceFor(id, 'large', state.flavour))} · Party ${inr(priceFor(id, 'party', state.flavour))}`;
    const addBtn = c.querySelector('[data-variety-add]');
    if (addBtn) addBtn.textContent = `Add to cart · ${inr(priceFor(id, 'regular', state.flavour))}`;
  });
  if (studioCtaSummary) {
    const flavour = FLAVOUR_BY_ID[state.flavour];
    studioCtaSummary.textContent = `${v.name} · ${s.label} · ${flavour ? flavour.name : ''}`;
    studioCtaPrice.textContent = inr(p);
  }
}

document.getElementById('studio-add-cart')?.addEventListener('click', () => {
  const v = getVariety(state.variety);
  const flavour = FLAVOUR_BY_ID[state.flavour];
  if (window.VelouraCart) window.VelouraCart.addBuild(v.name, state.size, state.flavour, flavour ? flavour.name : '');
});

/* ---------------- flavour cabinet ---------------- */
const grid = document.getElementById('flavour-grid');
FLAVOURS.forEach((f) => {
  const el = document.createElement('article');
  el.className = 'flavour-card reveal' + (f.id === state.flavour ? ' is-active' : '');
  el.dataset.flavour = f.id;
  el.dataset.tag = f.tag;
  el.tabIndex = 0;
  el.setAttribute('role', 'button');
  el.style.setProperty('--f-base', '#' + f.base.toString(16).padStart(6, '0'));
  el.style.setProperty('--f-swirl', '#' + f.swirl.toString(16).padStart(6, '0'));
  el.style.setProperty('--f-accent', f.accentHex);
  el.innerHTML = `
    <div class="fc-swatch" aria-hidden="true">${
      f.image ? `<img src="${f.image}" alt="" loading="lazy" />` : ''
    }</div>
    <div class="fc-body">
      <div class="fc-top">
        <h3>${f.name}</h3>
        ${f.badge ? `<span class="fc-hot">${f.badge}</span>` : ''}
      </div>
      <p>${f.note}<br />${f.line2}</p>
      <div class="fc-meta">
        <span class="fc-tag t-${f.tag}">${TAG_LABEL[f.tag]}</span>
        ${f.heat ? `<span class="fc-heat">${f.heat}</span>` : ''}
        ${PREMIUM.has(f.id) ? '<span class="fc-premium">+₹60</span>' : ''}
        <span class="fc-load">Load in 3D →</span>
      </div>
      <button type="button" class="fc-add" data-flavour-add="${f.id}">
        Add to cart · ${inr(priceFor('cone', 'regular', f.id))}
      </button>
    </div>`;
  const go = () => selectFlavour(f.id, true);
  el.addEventListener('click', go);
  el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
  el.querySelector('[data-flavour-add]').addEventListener('click', (e) => {
    e.stopPropagation();
    if (window.VelouraCart) window.VelouraCart.addFlavour(f.id, f.name);
  });
  grid.appendChild(el);
});

/* filters */
document.querySelectorAll('#flavour-filters .pill').forEach((p) => {
  p.addEventListener('click', () => {
    document.querySelectorAll('#flavour-filters .pill').forEach((x) => x.classList.toggle('is-active', x === p));
    const f = p.dataset.filter;
    document.querySelectorAll('.flavour-card').forEach((c) => {
      c.hidden = !(f === 'all' || c.dataset.tag === f);
    });
  });
});

/* ---------------- variety menu cards ---------------- */
const vgrid = document.getElementById('variety-grid');
VARIETIES.forEach((v) => {
  const el = document.createElement('article');
  el.className = 'variety-card reveal' + (v.id === state.variety ? ' is-active' : '');
  el.dataset.variety = v.id;
  el.tabIndex = 0;
  el.setAttribute('role', 'button');
  el.innerHTML = `
    <div class="vc-icon" aria-hidden="true">${icon(v.icon)}</div>
    <h3>${v.name}</h3>
    <p>${v.note}</p>
    <p class="vc-price"></p>
    <div class="vc-actions">
      <span class="vc-cta">Build it in 3D →</span>
      <button type="button" class="vc-add" data-variety-add="${v.id}">Add to cart · ${inr(priceFor(v.id, 'regular', state.flavour))}</button>
    </div>`;
  const go = () => {
    selectVariety(v.id);
    document.getElementById('studio').scrollIntoView({ behavior: 'smooth', block: 'start' });
    window.dispatchEvent(new CustomEvent('veloura:refocus'));
  };
  el.addEventListener('click', go);
  el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
  el.querySelector('[data-variety-add]').addEventListener('click', (e) => {
    e.stopPropagation();
    const flavour = FLAVOUR_BY_ID[state.flavour];
    if (window.VelouraCart) window.VelouraCart.addBuild(v.name, 'regular', state.flavour, flavour ? flavour.name : '');
  });
  vgrid.appendChild(el);
});

/* ---------------- parlours ---------------- */
const pgrid = document.getElementById('parlour-grid');
PARLOURS.forEach((p) => {
  const el = document.createElement('article');
  el.className = 'parlour reveal';
  el.dataset.outlet = p.id;
  el.innerHTML = `
    <p class="eyebrow">${p.city}</p>
    <h3>${p.name}</h3>
    <p class="p-line">${p.line}</p>
    <dl class="p-meta">
      <div><dt>Address</dt><dd>${p.address}</dd></div>
      <div><dt>Phone</dt><dd><a href="tel:${p.phone.replace(/\s/g, '')}">${p.phone}</a></dd></div>
      <div><dt>Hours</dt><dd>${p.hours}</dd></div>
    </dl>
    <p class="p-sig-label">Signature here</p>
    <div class="p-sigs">${p.signatures.map((s) => `<button class="pill pill-sm" type="button" data-sig="${s}">${getVariety(s).short}</button>`).join('')}</div>`;
  el.querySelectorAll('[data-sig]').forEach((b) => b.addEventListener('click', (e) => {
    e.stopPropagation();
    selectVariety(b.dataset.sig);
    document.getElementById('studio').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));
  pgrid.appendChild(el);
});

const tabs = document.getElementById('outlet-tabs');
[{ id: 'all', label: 'All parlours' }].concat(PARLOURS.map((p) => ({ id: p.id, label: p.city }))).forEach((t) => {
  const b = document.createElement('button');
  b.className = 'pill' + (t.id === 'all' ? ' is-active' : '');
  b.type = 'button';
  b.dataset.outlet = t.id;
  b.textContent = t.label;
  b.addEventListener('click', () => selectOutlet(t.id));
  tabs.appendChild(b);
});

const signatureLine = document.createElement('p');
signatureLine.className = 'sig-note';
signatureLine.hidden = true;
varietyChips.after(signatureLine);

function selectOutlet(id) {
  state.outlet = id;
  [...tabs.children].forEach((c) => c.classList.toggle('is-active', c.dataset.outlet === id));
  const p = PARLOURS.find((x) => x.id === id);
  document.querySelectorAll('.parlour').forEach((c) => {
    c.classList.toggle('is-dim', !!p && c.dataset.outlet !== id);
    c.classList.toggle('is-focus', !!p && c.dataset.outlet === id);
  });
  const sigs = p ? p.signatures : [];
  [...varietyChips.children].forEach((c) => c.classList.toggle('is-signature', sigs.includes(c.dataset.variety)));
  document.querySelectorAll('.variety-card').forEach((c) => c.classList.toggle('is-signature', sigs.includes(c.dataset.variety)));
  if (p) {
    signatureLine.hidden = false;
    signatureLine.innerHTML = `★ Signature at <b>${p.name}</b>: ${p.signatures.map((s) => getVariety(s).short).join(' · ')}`;
  } else {
    signatureLine.hidden = true;
  }
}

/* ---------------- info card ---------------- */
const card = document.getElementById('info-card');
const kicker = document.getElementById('info-kicker');
const title = document.getElementById('info-title');
const body = document.getElementById('info-body');
const list = document.getElementById('info-list');

function showCard(d) {
  if (!d || !d.title) return;
  kicker.textContent = d.kicker || 'Component';
  title.textContent = d.title;
  body.textContent = d.body || '';
  list.innerHTML = '';
  (d.list || []).forEach((li) => {
    const el = document.createElement('li');
    el.textContent = li;
    list.appendChild(el);
  });
  card.hidden = false;
  card.style.animation = 'none';
  void card.offsetWidth;
  card.style.animation = '';
}
function hideCard() { card.hidden = true; }
window.addEventListener('veloura:info', (e) => showCard(e.detail));
window.addEventListener('veloura:dismiss', hideCard);
document.getElementById('info-close').addEventListener('click', hideCard);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideCard(); });

/* ---------------- reveals (after injection) ---------------- */
const io = new IntersectionObserver((entries) => {
  entries.forEach((e, i) => {
    if (e.isIntersecting) {
      setTimeout(() => e.target.classList.add('in'), Math.min(i * 60, 260));
      io.unobserve(e.target);
    }
  });
}, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
document.querySelectorAll('.reveal').forEach((el) => io.observe(el));

/* ---------------- init ---------------- */
selectFlavour('vanilla');
syncPrices();
