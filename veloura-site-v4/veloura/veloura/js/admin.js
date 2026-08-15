/* Veloura owner dashboard — key gate, summary, orders table, status updates, CSV. */
(function () {
  'use strict';

  var API = window.VELOURA_API_BASE || '';
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

  function api(path, opts) {
    opts = opts || {};
    opts.headers = Object.assign({ 'x-admin-key': adminKey }, opts.headers || {});
    return fetch(API + path, opts).then(function (res) {
      if (res.status === 401) { var e = new Error('unauthorized'); e.code = 401; throw e; }
      if (!res.ok) throw new Error('request_failed_' + res.status);
      return res.json();
    });
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
