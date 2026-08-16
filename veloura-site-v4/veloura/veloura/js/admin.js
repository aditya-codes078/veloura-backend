/* Veloura owner dashboard — key gate, summary, orders table, status updates,
   CSV, new-order sound/notification alerts, KOT printing, WhatsApp ping,
   and menu stock toggles. */
(function () {
  'use strict';

  var API = window.VELOURA_API_BASE || '';
  var WA_NUMBER = window.VELOURA_WHATSAPP_NUMBER || '';
  var KEY_STORE = 'veloura_admin_key';
  var STATUSES = [
    ['new', 'New'],
    ['confirmed', 'Confirmed'],
    ['out_for_delivery', 'Out for delivery'],
    ['delivered', 'Delivered'],
    ['cancelled', 'Cancelled'],
  ];

  function $(id) { return document.getElementById(id); }
  function inr(n) { return '₹' + Number(n || 0).toLocaleString('en-IN'); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  // In-memory session store. Browser storage APIs (localStorage/sessionStorage)
  // are blocked inside the preview iframe's opaque origin, so the admin key is
  // held in memory for the life of the page and re-entered after a reload.
  var MEM = Object.create(null);
  function sess(k, v) {
    if (v === undefined) return MEM[k] || null;
    if (v === null) delete MEM[k]; else MEM[k] = v;
    return null;
  }

  var adminKey = sess(KEY_STORE) || '';
  var orders = [];
  var timer = null;
  var knownOrderIds = null; // null until first load, so we never alert on the initial page load
  var alertsEnabled = false;
  var audioCtx = null;

  function api(path, opts) {
    opts = opts || {};
    opts.headers = Object.assign({ 'x-admin-key': adminKey }, opts.headers || {});
    return fetch(API + path, opts).then(function (res) {
      if (res.status === 401) { var e = new Error('unauthorized'); e.code = 401; throw e; }
      if (!res.ok) throw new Error('request_failed_' + res.status);
      return res.json();
    });
  }

  /* ---------- new-order sound + browser notification ---------- */
  function playChime() {
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      var now = audioCtx.currentTime;
      [0, 0.18, 0.36].forEach(function (offset, i) {
        var osc = audioCtx.createOscillator();
        var gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.value = i === 2 ? 1046.5 : 880; // a friendly two-then-high chime, not a harsh beep
        gain.gain.setValueAtTime(0, now + offset);
        gain.gain.linearRampToValueAtTime(0.35, now + offset + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.32);
        osc.connect(gain).connect(audioCtx.destination);
        osc.start(now + offset);
        osc.stop(now + offset + 0.34);
      });
    } catch (e) { /* audio not available — silently skip */ }
  }

  $('enable-alerts').addEventListener('click', function () {
    alertsEnabled = true;
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
    playChime();
    if (window.Notification && Notification.permission !== 'granted') {
      Notification.requestPermission();
    }
    $('enable-alerts').textContent = 'Alerts on ✓';
    $('enable-alerts').disabled = true;
  });

  function notifyNewOrders(newOnes) {
    if (!alertsEnabled || !newOnes.length) return;
    playChime();
    if (window.Notification && Notification.permission === 'granted') {
      var o = newOnes[0];
      var body = newOnes.length === 1
        ? (o.customer_name + ' · ' + inr(o.total) + ' · ' + (o.items || []).map(function (i) { return i.name; }).join(', '))
        : newOnes.length + ' new orders just came in.';
      try {
        var n = new Notification('🍦 New Veloura order' + (newOnes.length > 1 ? 's' : '') + '!', { body: body });
        n.onclick = function () { window.focus(); n.close(); };
      } catch (e) {}
    }
  }

  /* ---------- gate ---------- */
  $('gate-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var val = $('gate-key').value.trim();
    $('gate-err').textContent = '';
    if (!val) { $('gate-err').textContent = 'Please enter the admin key.'; return; }
    var btn = $('gate-btn');
    btn.disabled = true; btn.classList.add('is-loading'); btn.textContent = 'Checking…';
    adminKey = val;
    api('/api/admin/summary')
      .then(function () {
        sess(KEY_STORE, val);
        enterDash();
      })
      .catch(function (err) {
        adminKey = '';
        $('gate-err').textContent =
          err.code === 401 ? 'That key is not right. Try again.' : 'Could not reach the order server. Is it running?';
      })
      .then(function () {
        btn.disabled = false; btn.classList.remove('is-loading'); btn.textContent = 'Unlock dashboard';
      });
  });

  function enterDash() {
    $('gate').hidden = true;
    $('dash').hidden = false;
    load();
    loadStock();
    if (timer) clearInterval(timer);
    timer = setInterval(load, 20000);
  }

  function lock() {
    adminKey = '';
    sess(KEY_STORE, null);
    if (timer) clearInterval(timer);
    $('dash').hidden = true;
    $('gate').hidden = false;
    $('gate-key').value = '';
  }
  $('logout').addEventListener('click', lock);
  $('refresh').addEventListener('click', function () { load(true); });

  /* ---------- load ---------- */
  function load(manual) {
    if (!adminKey) return;
    if (manual) $('sync').textContent = 'Refreshing…';
    Promise.all([api('/api/admin/summary'), api('/api/orders')])
      .then(function (r) {
        var s = r[0];
        $('k-ot').textContent = s.orders_today;
        $('k-rt').textContent = inr(s.revenue_today);
        $('k-to').textContent = s.total_orders;
        $('k-tr').textContent = inr(s.revenue_total);
        orders = r[1].orders || [];

        var currentIds = orders.map(function (o) { return o.id; });
        if (knownOrderIds !== null) {
          var newOnes = orders.filter(function (o) { return knownOrderIds.indexOf(o.id) === -1; });
          if (newOnes.length) notifyNewOrders(newOnes);
        }
        knownOrderIds = currentIds;

        renderRows();
        $('dash-error').hidden = true;
        var now = new Date();
        $('sync').textContent = 'Updated ' + now.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' IST';
      })
      .catch(function (err) {
        if (err.code === 401) { lock(); $('gate-err').textContent = 'Session key rejected. Please sign in again.'; return; }
        $('dash-error').hidden = false;
        $('dash-error').textContent = 'Could not reach the order server. Retrying automatically…';
      });
  }

  function renderRows() {
    var tbody = $('rows');
    $('order-n').textContent = orders.length ? '(' + orders.length + ')' : '';
    if (!orders.length) {
      tbody.innerHTML = '';
      $('empty').hidden = false;
      $('table-wrap').hidden = true;
      return;
    }
    $('empty').hidden = true;
    $('table-wrap').hidden = false;
    tbody.innerHTML = orders.map(function (o) {
      var items = (o.items || []).map(function (i) {
        return '<i>' + esc(i.name) + ' × ' + i.qty + ' — ' + inr(i.price * i.qty) + '</i>';
      }).join('');
      var opts = STATUSES.map(function (s) {
        return '<option value="' + s[0] + '"' + (o.status === s[0] ? ' selected' : '') + '>' + s[1] + '</option>';
      }).join('');
      var waLink = '';
      if (WA_NUMBER) {
        var itemsLine = (o.items || []).map(function (i) { return i.name + ' x' + i.qty; }).join(', ');
        var msg = 'New order ' + o.order_code + '! Customer: ' + o.customer_name + ' (' + o.phone + '). ' +
          'Items: ' + itemsLine + '. Total: ' + inr(o.total) + '. Address: ' + o.address + ', ' + o.city + ' — ' + o.pincode + '.';
        waLink = 'https://wa.me/' + WA_NUMBER + '?text=' + encodeURIComponent(msg);
      }
      return '<tr data-id="' + o.id + '" data-status="' + esc(o.status) + '">' +
        '<td class="o-code">' + esc(o.order_code) + '</td>' +
        '<td>' + esc(o.created_at_ist) + '</td>' +
        '<td class="o-cust"><b>' + esc(o.customer_name) + '</b><span>' + esc(o.phone) + '</span><span>' + esc(o.email) + '</span></td>' +
        '<td class="o-addr">' + esc(o.address) + '<br/>' + esc(o.city) + ' — ' + esc(o.pincode) +
        (o.notes ? '<br/><em>“' + esc(o.notes) + '”</em>' : '') + '</td>' +
        '<td class="o-items">' + items + '</td>' +
        '<td class="num o-total">' + inr(o.total) + '<small>' + inr(o.subtotal) + ' + ' +
        (o.delivery_fee === 0 ? 'free del.' : inr(o.delivery_fee) + ' del.') + '</small></td>' +
        '<td><span class="pill ' + (o.payment_method === 'UPI' ? 'pill-upi' : 'pill-cod') + '">' +
        (o.payment_method === 'UPI' ? 'UPI' : 'COD') + '</span></td>' +
        '<td><span class="pill ' + (o.email_sent ? 'pill-ok' : 'pill-fail') + '" title="' +
        esc(o.email_error || (o.email_sent ? 'Alert emailed to owner' : 'Alert not sent')) + '">' +
        (o.email_sent ? 'Sent' : 'Not sent') + '</span></td>' +
        '<td><select class="status" data-id="' + o.id + '">' + opts + '</select></td>' +
        '<td class="o-actions">' +
        '<button type="button" class="btn-icon" data-kot="' + o.id + '" title="Print KOT / bill">🖨️</button>' +
        (waLink ? '<a class="btn-icon" href="' + waLink + '" target="_blank" rel="noopener" title="Send via WhatsApp">💬</a>' : '') +
        '</td>' +
        '</tr>';
    }).join('');
  }

  $('rows').addEventListener('change', function (e) {
    var sel = e.target.closest('select.status');
    if (!sel) return;
    var id = sel.getAttribute('data-id');
    var row = sel.closest('tr');
    row.classList.add('saving');
    sel.disabled = true;
    api('/api/orders/' + id + '/status', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: sel.value }),
    })
      .then(function (r) {
        row.setAttribute('data-status', r.status);
        var o = orders.filter(function (x) { return String(x.id) === String(id); })[0];
        if (o) o.status = r.status;
      })
      .catch(function () {
        $('dash-error').hidden = false;
        $('dash-error').textContent = 'Status update failed. Please try again.';
      })
      .then(function () { row.classList.remove('saving'); sel.disabled = false; });
  });

  /* ---------- KOT / bill printing ---------- */
  $('rows').addEventListener('click', function (e) {
    var btn = e.target.closest('[data-kot]');
    if (!btn) return;
    var id = btn.getAttribute('data-kot');
    var o = orders.filter(function (x) { return String(x.id) === String(id); })[0];
    if (o) printKot(o);
  });

  function printKot(o) {
    var itemsHtml = (o.items || []).map(function (i) {
      return '<div class="kot-line"><span>' + esc(i.qty) + '× ' + esc(i.name) + '</span><span>' + inr(i.price * i.qty) + '</span></div>';
    }).join('');
    var area = $('kot-print-area');
    area.innerHTML =
      '<div class="kot-ticket">' +
      '<p class="kot-brand">VELOURA</p>' +
      '<p class="kot-sub">Ice Cream Parlour &amp; Café · Kanpur</p>' +
      '<p class="kot-code">' + esc(o.order_code) + '</p>' +
      '<p class="kot-time">' + esc(o.created_at_ist) + '</p>' +
      '<hr/>' +
      '<p class="kot-cust"><b>' + esc(o.customer_name) + '</b><br/>' + esc(o.phone) + '</p>' +
      '<p class="kot-addr">' + esc(o.address) + ', ' + esc(o.city) + ' — ' + esc(o.pincode) + '</p>' +
      (o.notes ? '<p class="kot-notes">Note: ' + esc(o.notes) + '</p>' : '') +
      '<hr/>' +
      itemsHtml +
      '<hr/>' +
      '<div class="kot-line"><span>Subtotal</span><span>' + inr(o.subtotal) + '</span></div>' +
      '<div class="kot-line"><span>Delivery</span><span>' + (o.delivery_fee === 0 ? 'Free' : inr(o.delivery_fee)) + '</span></div>' +
      '<div class="kot-line kot-total"><span>Total</span><span>' + inr(o.total) + '</span></div>' +
      '<p class="kot-pay">Payment: ' + esc(o.payment_method) + '</p>' +
      '<hr/>' +
      '<p class="kot-thanks">Thank you! 🍦</p>' +
      '</div>';
    window.print();
  }

  /* ---------- menu / stock toggles ---------- */
  function loadStock() {
    api('/api/admin/stock')
      .then(function (r) {
        var grid = $('stock-grid');
        grid.innerHTML = (r.flavours || []).map(function (f) {
          return '<label class="stock-item' + (f.available ? '' : ' is-out') + '">' +
            '<input type="checkbox" data-flavour-stock="' + esc(f.id) + '"' + (f.available ? ' checked' : '') + ' />' +
            '<span>' + esc(f.name) + '</span>' +
            '</label>';
        }).join('');
      })
      .catch(function () { /* stock panel is a nice-to-have — fail quietly */ });
  }

  $('stock-grid').addEventListener('change', function (e) {
    var box = e.target.closest('[data-flavour-stock]');
    if (!box) return;
    var id = box.getAttribute('data-flavour-stock');
    var label = box.closest('.stock-item');
    label.classList.toggle('is-out', !box.checked);
    api('/api/admin/stock/' + id, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ available: box.checked }),
    }).catch(function () {
      box.checked = !box.checked; // revert on failure
      label.classList.toggle('is-out', !box.checked);
      $('dash-error').hidden = false;
      $('dash-error').textContent = 'Could not update stock. Please try again.';
    });
  });

  /* ---------- CSV ---------- */
  $('csv').addEventListener('click', function () {
    var head = ['order_code', 'placed_ist', 'customer_name', 'phone', 'email', 'address', 'city', 'pincode',
      'items', 'subtotal', 'delivery_fee', 'total', 'payment_method', 'notes', 'status', 'email_sent'];
    function q(v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; }
    var lines = [head.join(',')];
    orders.forEach(function (o) {
      lines.push([
        o.order_code, o.created_at_ist, o.customer_name, o.phone, o.email, o.address, o.city, o.pincode,
        (o.items || []).map(function (i) { return i.name + ' x' + i.qty; }).join(' | '),
        o.subtotal, o.delivery_fee, o.total, o.payment_method, o.notes, o.status, o.email_sent ? 'yes' : 'no',
      ].map(q).join(','));
    });
    var blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'veloura-orders-' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  });

  if (adminKey) enterDash();
})();
