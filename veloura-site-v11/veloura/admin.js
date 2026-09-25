/* Veloura owner dashboard — role-based (manager/kitchen/delivery), sound
   alerts, KOT printing, WhatsApp ping, menu stock, table QR codes. */
(function () {
  'use strict';

  var API = window.VELOURA_API_BASE || '';
  var WA_NUMBER = window.VELOURA_WHATSAPP_NUMBER || '';
  var KEY_STORE = 'veloura_admin_key';

  var ALL_STATUSES = [
    ['new', 'New'],
    ['confirmed', 'Confirmed'],
    ['preparing', 'Preparing'],
    ['ready', 'Ready'],
    ['out_for_delivery', 'Out for delivery'],
    ['delivered', 'Delivered'],
    ['cancelled', 'Cancelled'],
  ];
  // Which statuses each role may SET on an order (manager = all).
  var ROLE_SETTABLE = {
    manager: ALL_STATUSES.map(function (s) { return s[0]; }),
    kitchen: ['confirmed', 'preparing', 'ready'],
    delivery: ['out_for_delivery', 'delivered'],
  };
  var ROLE_LABEL = { manager: 'MANAGER', kitchen: 'KITCHEN', delivery: 'DELIVERY' };
  var ROLE_COPY = {
    manager: 'Every order placed on this site lands here — full control over orders, menu and stock.',
    kitchen: 'Your prep queue — orders waiting to be made, and ones you\'re working on.',
    delivery: 'Orders ready for pickup and out for delivery. Share your live location from here.',
  };

  function $(id) { return document.getElementById(id); }
  function inr(n) { return '₹' + Number(n || 0).toLocaleString('en-IN'); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  // In-memory session store. Browser storage APIs can be blocked inside some
  // preview iframes, so the key is held in memory for the life of the page.
  var MEM = Object.create(null);
  function sess(k, v) {
    if (v === undefined) return MEM[k] || null;
    if (v === null) delete MEM[k]; else MEM[k] = v;
    return null;
  }

  var adminKey = sess(KEY_STORE) || '';
  var myRole = '';
  var orders = [];
  var timer = null;
  var knownOrderIds = null;
  var alertsEnabled = false;
  var audioCtx = null;

  function api(path, opts) {
    opts = opts || {};
    opts.headers = Object.assign({ 'x-admin-key': adminKey }, opts.headers || {});
    return fetch(API + path, opts).then(function (res) {
      if (res.status === 401) { var e = new Error('unauthorized'); e.code = 401; throw e; }
      if (res.status === 403) { var e2 = new Error('forbidden'); e2.code = 403; throw e2; }
      if (!res.ok) throw new Error('request_failed_' + res.status);
      return res.json();
    });
  }

  /* ---------- sound + notification ---------- */
  function playChime() {
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      var now = audioCtx.currentTime;
      [0, 0.18, 0.36].forEach(function (offset, i) {
        var osc = audioCtx.createOscillator();
        var gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.value = i === 2 ? 1046.5 : 880;
        gain.gain.setValueAtTime(0, now + offset);
        gain.gain.linearRampToValueAtTime(0.35, now + offset + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.32);
        osc.connect(gain).connect(audioCtx.destination);
        osc.start(now + offset);
        osc.stop(now + offset + 0.34);
      });
    } catch (e) {}
  }

  var ALERTS_KEY = 'veloura_alerts_enabled';
  function setAlertsUI(on) {
    alertsEnabled = on;
    var btn = $('enable-alerts');
    btn.textContent = on ? 'Alerts on ✓' : 'Enable sound & alerts';
    btn.disabled = on;
  }
  $('enable-alerts').addEventListener('click', function () {
    try { localStorage.setItem(ALERTS_KEY, '1'); } catch (e) {}
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
    playChime();
    if (window.Notification && Notification.permission !== 'granted') Notification.requestPermission();
    setAlertsUI(true);
  });
  try {
    if (localStorage.getItem(ALERTS_KEY) === '1' && window.Notification && Notification.permission === 'granted') {
      setAlertsUI(true);
      try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
    }
  } catch (e) {}
  document.addEventListener('click', function () {
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume().catch(function () {});
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
    if (!val) { $('gate-err').textContent = 'Please enter your access key.'; return; }
    var btn = $('gate-btn');
    btn.disabled = true; btn.classList.add('is-loading'); btn.textContent = 'Checking…';
    adminKey = val;
    api('/api/admin/whoami')
      .then(function (r) {
        myRole = r.role;
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
    $('role-tag').textContent = ROLE_LABEL[myRole] || myRole.toUpperCase();
    $('role-copy').textContent = ROLE_COPY[myRole] || '';
    var isManager = myRole === 'manager';
    $('kpis').hidden = !isManager;
    $('stock-wrap').hidden = !isManager;
    $('table-qr-wrap').hidden = !isManager;
    $('csv').hidden = !isManager;
    load();
    if (isManager) loadStock();
    if (timer) clearInterval(timer);
    timer = setInterval(load, 20000);
  }

  function lock() {
    adminKey = '';
    myRole = '';
    sess(KEY_STORE, null);
    if (timer) clearInterval(timer);
    $('dash').hidden = true;
    $('gate').hidden = false;
    $('gate-key').value = '';
  }
  $('logout').addEventListener('click', lock);
  $('refresh').addEventListener('click', function () { load(true); });

  /* ---------- load orders ---------- */
  function load(manual) {
    if (!adminKey) return;
    if (manual) $('sync').textContent = 'Refreshing…';
    var calls = [api('/api/orders')];
    if (myRole === 'manager') calls.push(api('/api/admin/summary'));
    Promise.all(calls)
      .then(function (r) {
        orders = r[0].orders || [];
        if (r[1]) {
          var s = r[1];
          $('k-ot').textContent = s.orders_today;
          $('k-rt').textContent = inr(s.revenue_today);
          $('k-to').textContent = s.total_orders;
          $('k-tr').textContent = inr(s.revenue_total);
        }

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
    var settable = ROLE_SETTABLE[myRole] || [];
    tbody.innerHTML = orders.map(function (o) {
      var items = (o.items || []).map(function (i) {
        return '<i>' + esc(i.name) + ' × ' + i.qty + ' — ' + inr(i.price * i.qty) + '</i>';
      }).join('');
      var opts = ALL_STATUSES.map(function (s) {
        var disabled = s[0] !== o.status && settable.indexOf(s[0]) === -1;
        return '<option value="' + s[0] + '"' + (o.status === s[0] ? ' selected' : '') + (disabled ? ' disabled' : '') + '>' + s[1] + '</option>';
      }).join('');
      var locCell = o.table_number
        ? '<b>Table ' + esc(o.table_number) + '</b><span>Dine-in</span>'
        : esc(o.address) + '<br/>' + esc(o.city) + ' — ' + esc(o.pincode);
      var waLink = '';
      if (WA_NUMBER) {
        var itemsLine = (o.items || []).map(function (i) { return i.name + ' x' + i.qty; }).join(', ');
        var where = o.table_number ? 'Table ' + o.table_number : (o.address + ', ' + o.city + ' — ' + o.pincode);
        var msg = 'New order ' + o.order_code + '! Customer: ' + o.customer_name + ' (' + o.phone + '). ' +
          'Items: ' + itemsLine + '. Total: ' + inr(o.total) + '. ' + where + '.';
        waLink = 'https://wa.me/' + WA_NUMBER + '?text=' + encodeURIComponent(msg);
      }
      return '<tr data-id="' + o.id + '" data-status="' + esc(o.status) + '">' +
        '<td class="o-code">' + esc(o.order_code) + '</td>' +
        '<td>' + esc(o.created_at_ist) + '</td>' +
        '<td class="o-cust"><b>' + esc(o.customer_name) + '</b><span>' + esc(o.phone) + '</span><span>' + esc(o.email) + '</span></td>' +
        '<td class="o-addr">' + locCell +
        (o.notes ? '<br/><em>“' + esc(o.notes) + '”</em>' : '') + '</td>' +
        '<td class="o-items">' + items + '</td>' +
        '<td class="num o-total">' + inr(o.total) + '<small>' + inr(o.subtotal) +
        (o.gst ? ' + ' + inr(o.gst) + ' GST' : '') + (o.delivery_fee ? ' + ' + inr(o.delivery_fee) + ' del.' : '') + '</small></td>' +
        '<td><span class="pill ' + (o.payment_method === 'UPI' ? 'pill-upi' : 'pill-cod') + '">' +
        (o.payment_method === 'UPI' ? 'UPI' : 'COD') + '</span></td>' +
        '<td><span class="pill ' + (o.email_sent ? 'pill-ok' : 'pill-fail') + '" title="' +
        esc(o.email_error || (o.email_sent ? 'Alert emailed to owner' : 'Alert not sent')) + '">' +
        (o.email_sent ? 'Sent' : 'Not sent') + '</span></td>' +
        '<td><select class="status" data-id="' + o.id + '">' + opts + '</select></td>' +
        '<td class="o-actions">' +
        '<button type="button" class="btn-icon" data-kot="' + o.id + '" title="Print KOT / bill">🖨️</button>' +
        (waLink ? '<a class="btn-icon" href="' + waLink + '" target="_blank" rel="noopener" title="Send via WhatsApp">💬</a>' : '') +
        (myRole === 'delivery' ? '<a class="btn-icon" href="deliver.html" title="Share my location">📍</a>' : '') +
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
        load(); // re-filter (this order may leave my queue now)
      })
      .catch(function (err) {
        $('dash-error').hidden = false;
        $('dash-error').textContent = err.code === 403 ? 'Your role can\'t set that status.' : 'Status update failed. Please try again.';
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
      '<p class="kot-code">' + esc(o.order_code) + (o.table_number ? ' · Table ' + esc(o.table_number) : '') + '</p>' +
      '<p class="kot-time">' + esc(o.created_at_ist) + '</p>' +
      '<hr/>' +
      '<p class="kot-cust"><b>' + esc(o.customer_name) + '</b><br/>' + esc(o.phone) + '</p>' +
      (o.table_number ? '' : '<p class="kot-addr">' + esc(o.address) + ', ' + esc(o.city) + ' — ' + esc(o.pincode) + '</p>') +
      (o.notes ? '<p class="kot-notes">Note: ' + esc(o.notes) + '</p>' : '') +
      '<hr/>' +
      itemsHtml +
      '<hr/>' +
      '<div class="kot-line"><span>Subtotal</span><span>' + inr(o.subtotal) + '</span></div>' +
      (o.gst ? '<div class="kot-line"><span>GST</span><span>' + inr(o.gst) + '</span></div>' : '') +
      (o.delivery_fee ? '<div class="kot-line"><span>Delivery</span><span>' + inr(o.delivery_fee) + '</span></div>' : '') +
      '<div class="kot-line kot-total"><span>Total</span><span>' + inr(o.total) + '</span></div>' +
      '<p class="kot-pay">Payment: ' + esc(o.payment_method) + '</p>' +
      '<hr/>' +
      '<p class="kot-thanks">Thank you! 🍦</p>' +
      '</div>';
    window.print();
  }

  /* ---------- menu / stock (manager only) ---------- */
  function loadStock() {
    api('/api/admin/stock')
      .then(function (r) {
        var grid = $('stock-grid');
        grid.innerHTML = (r.flavours || []).map(function (f) {
          return '<div class="stock-item' + (!f.available ? ' is-out' : f.isLow ? ' is-low' : '') + '">' +
            '<label class="stock-check">' +
            '<input type="checkbox" data-flavour-stock="' + esc(f.id) + '"' + (f.available ? ' checked' : '') + (f.quantity != null ? ' disabled' : '') + ' />' +
            '<span>' + esc(f.name) + '</span>' +
            '</label>' +
            '<input type="number" min="0" class="stock-qty" data-flavour-qty="' + esc(f.id) + '" placeholder="∞" value="' + (f.quantity != null ? f.quantity : '') + '" title="Set a number to track exact stock; leave blank for unlimited" />' +
            '</div>';
        }).join('');

        var out = (r.flavours || []).filter(function (f) { return !f.available; });
        var low = (r.flavours || []).filter(function (f) { return f.available && f.isLow; });
        var banner = $('stock-banner');
        if (out.length || low.length) {
          var parts = [];
          if (out.length) parts.push(out.length + ' sold out (' + out.map(function (f) { return f.name; }).join(', ') + ')');
          if (low.length) parts.push(low.length + ' running low (' + low.map(function (f) { return f.name; }).join(', ') + ')');
          banner.textContent = '⚠️ ' + parts.join(' · ');
          banner.hidden = false;
        } else {
          banner.hidden = true;
        }
      })
      .catch(function () {});
  }

  $('stock-grid').addEventListener('change', function (e) {
    var box = e.target.closest('[data-flavour-stock]');
    var qtyBox = e.target.closest('[data-flavour-qty]');
    if (box) {
      var id = box.getAttribute('data-flavour-stock');
      api('/api/admin/stock/' + id, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ available: box.checked }),
      }).then(loadStock).catch(function () {
        $('dash-error').hidden = false;
        $('dash-error').textContent = 'Could not update stock. Please try again.';
        loadStock();
      });
    }
    if (qtyBox) {
      var qid = qtyBox.getAttribute('data-flavour-qty');
      var raw = qtyBox.value.trim();
      if (raw === '') { loadStock(); return; }
      var qty = Math.max(0, Math.floor(Number(raw)));
      api('/api/admin/stock/' + qid + '/quantity', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantity: qty }),
      }).then(loadStock).catch(function () {
        $('dash-error').hidden = false;
        $('dash-error').textContent = 'Could not update quantity. Please try again.';
        loadStock();
      });
    }
  });

  /* ---------- dine-in table QR codes (manager only) ---------- */
  $('table-qr-build').addEventListener('click', function () {
    var count = Math.max(1, Math.min(60, Math.floor(Number($('table-count').value) || 12)));
    var siteBase = location.href.replace(/admin\.html.*$/, 'index.html');
    var grid = $('table-qr-grid');
    var html = '';
    for (var n = 1; n <= count; n++) {
      var url = siteBase + '?table=' + n;
      var qrImg = 'https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=' + encodeURIComponent(url);
      html += '<div class="table-qr-card">' +
        '<img src="' + qrImg + '" alt="QR for table ' + n + '" width="140" height="140" />' +
        '<b>Table ' + n + '</b>' +
        '</div>';
    }
    grid.innerHTML = html;
  });

  /* ---------- CSV (manager only) ---------- */
  $('csv').addEventListener('click', function () {
    var head = ['order_code', 'placed_ist', 'customer_name', 'phone', 'email', 'address_or_table', 'city', 'pincode',
      'items', 'subtotal', 'gst', 'delivery_fee', 'total', 'payment_method', 'notes', 'status', 'email_sent'];
    function q(v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; }
    var lines = [head.join(',')];
    orders.forEach(function (o) {
      lines.push([
        o.order_code, o.created_at_ist, o.customer_name, o.phone, o.email,
        o.table_number ? 'Table ' + o.table_number : o.address, o.city, o.pincode,
        (o.items || []).map(function (i) { return i.name + ' x' + i.qty; }).join(' | '),
        o.subtotal, o.gst || 0, o.delivery_fee, o.total, o.payment_method, o.notes, o.status, o.email_sent ? 'yes' : 'no',
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

  if (adminKey) {
    api('/api/admin/whoami').then(function (r) { myRole = r.role; enterDash(); }).catch(function () { adminKey = ''; });
  }
})();
