/* Veloura — cart drawer, checkout and order submission. Plain script, no modules. */
(function () {
  'use strict';

  // The order backend's URL. Netlify only hosts static files (HTML/CSS/JS) —
  // it cannot run server.js. So this must point to wherever you deploy the
  // backend separately (Render, Railway, etc). Set it once in index.html via
  // window.VELOURA_API_BASE — see the <script> tag near the top of <body>.
  var API = window.VELOURA_API_BASE || '';

  // Dine-in mode: if the page was opened as index.html?table=4 (from a table
  // QR code), skip delivery address entirely and tag the order "Table 4".
  var TABLE_NUMBER = new URLSearchParams(location.search).get('table') || '';

  var UPI = { id: '', name: '' };
  var GST_PERCENT = 0;
  fetch(API + '/api/catalog').then(function (r) { return r.json(); }).then(function (d) {
    UPI.id = d.upi_id || ''; UPI.name = d.upi_name || '';
    GST_PERCENT = Number(d.gst_percent) || 0;
    renderCart(); // re-render once we know the real GST rate
  }).catch(function () {});

  var PRODUCTS = {
    single: { id: 'single', name: 'Single Scoop Waffle Cone', price: 149 },
    double: { id: 'double', name: 'Double Scoop Waffle Cone', price: 229 },
    triple: { id: 'triple', name: 'Triple Stack Signature Cone', price: 299 },
    pint: { id: 'pint', name: 'Pint (500 ml tub)', price: 499 },
    family: { id: 'family', name: 'Family Tub (1 L)', price: 899 },
  };
  var DELIVERY_FEE = 49;
  var FREE_ABOVE = 499;

  function inr(n) {
    return '₹' + Number(n).toLocaleString('en-IN');
  }
  function $(id) { return document.getElementById(id); }

  /* ---------- state ---------- */
  // Cart lines are keyed by "productId" or "productId::flavourId::tag" so the
  // same product can be added multiple times with different flavours/builds.
  var cart = {}; // lineKey -> { productId, flavourId, flavourName, baseName, qty }
  var PREMIUM_FLAVOURS = { dubai: 1, pistachio: 1, pistiramisu: 1, ube: 1 };
  var appliedCoupon = null; // { code, discount, label, freeDelivery }

  var CART_STORE_KEY = 'veloura_cart_v1';
  function saveCart() {
    try { localStorage.setItem(CART_STORE_KEY, JSON.stringify(cart)); } catch (e) {}
  }
  function loadCart() {
    try {
      var raw = localStorage.getItem(CART_STORE_KEY);
      if (!raw) return;
      var parsed = JSON.parse(raw);
      Object.keys(parsed).forEach(function (k) {
        var line = parsed[k];
        if (line && PRODUCTS[line.productId] && Number(line.qty) > 0) cart[k] = line;
      });
    } catch (e) {}
  }

  function lineKey(productId, flavourId, tag) {
    return [productId, flavourId || '', tag || ''].join('::');
  }
  function lineUnitPrice(line) {
    var base = PRODUCTS[line.productId].price;
    return base + (line.flavourId && PREMIUM_FLAVOURS[line.flavourId] ? 60 : 0);
  }
  function lineName(line) {
    var base = line.baseName || PRODUCTS[line.productId].name;
    return line.flavourName ? base + ' — ' + line.flavourName : base;
  }

  function totals() {
    var subtotal = 0;
    Object.keys(cart).forEach(function (k) { subtotal += lineUnitPrice(cart[k]) * cart[k].qty; });
    var delivery = TABLE_NUMBER ? 0 : (subtotal === 0 ? 0 : subtotal >= FREE_ABOVE ? 0 : DELIVERY_FEE);
    var discount = 0;
    if (appliedCoupon && subtotal > 0) {
      discount = Math.min(appliedCoupon.discount, subtotal);
      if (appliedCoupon.freeDelivery) delivery = 0;
    }
    var gst = GST_PERCENT ? Math.round(((subtotal - discount) * GST_PERCENT) / 100) : 0;
    var total = Math.max(0, subtotal + delivery - discount + gst);
    return { subtotal: subtotal, delivery: delivery, discount: discount, gst: gst, total: total };
  }
  function itemCount() {
    return Object.keys(cart).reduce(function (s, k) { return s + cart[k].qty; }, 0);
  }

  /* ---------- elements ---------- */
  var drawer = $('drawer'), scrim = $('drawer-scrim');
  var stepCart = $('step-cart'), stepCheckout = $('step-checkout'), stepSuccess = $('step-success');
  var linesEl = $('cart-lines'), emptyEl = $('cart-empty'), totalsEl = $('cart-totals');
  var countEl = $('cart-count');
  var form = $('checkout-form');
  var apiError = $('api-error');
  var placeBtn = $('place-order');
  var lastFocus = null;

  /* ---------- dine-in banner + address fields ---------- */
  if (TABLE_NUMBER) {
    var dineBanner = document.createElement('div');
    dineBanner.className = 'dinein-banner';
    dineBanner.textContent = 'Ordering for Table ' + TABLE_NUMBER + ' — no delivery needed.';
    if (form) form.insertBefore(dineBanner, form.firstChild);
    ['address', 'city', 'pincode'].forEach(function (n) {
      var field = form && form.querySelector('[name="' + n + '"]');
      if (field) {
        var wrap = field.closest('.field') || field.closest('.field-row') || field;
        wrap.hidden = true;
        field.required = false;
      }
    });
  }

  /* ---------- rendering ---------- */
  function renderCart() {
    var keys = Object.keys(cart);
    linesEl.innerHTML = '';
    keys.forEach(function (k) {
      var line = cart[k], name = lineName(line), price = lineUnitPrice(line), qty = line.qty;
      var li = document.createElement('li');
      li.className = 'cart-line';
      li.innerHTML =
        '<div class="cl-main"><b>' + name + '</b><span>' + inr(price) + ' each</span></div>' +
        '<div class="stepper" role="group" aria-label="Quantity for ' + name + '">' +
        '<button type="button" class="step-btn" data-dec="' + k + '" aria-label="Decrease quantity">−</button>' +
        '<span class="qty" data-qty="' + k + '">' + qty + '</span>' +
        '<button type="button" class="step-btn" data-inc="' + k + '" aria-label="Increase quantity">+</button>' +
        '</div>' +
        '<div class="cl-price">' + inr(price * qty) + '</div>';
      linesEl.appendChild(li);
    });

    var t = totals();
    var has = keys.length > 0;
    emptyEl.hidden = has;
    totalsEl.hidden = !has;
    $('to-checkout').disabled = !has;
    var couponRow = $('coupon-row');
    if (couponRow) couponRow.hidden = !has;

    $('sum-subtotal').textContent = inr(t.subtotal);
    $('sum-delivery').textContent = t.delivery === 0 && t.subtotal > 0 ? 'Free' : inr(t.delivery);
    $('sum-total').textContent = inr(t.total);
    $('co-subtotal').textContent = inr(t.subtotal);
    $('co-delivery').textContent = t.delivery === 0 && t.subtotal > 0 ? 'Free' : inr(t.delivery);
    $('co-total').textContent = inr(t.total);

    var discRow = $('sum-discount-row'), coDiscRow = $('co-discount-row');
    var discOn = t.discount > 0;
    if (discRow) discRow.hidden = !discOn;
    if (coDiscRow) coDiscRow.hidden = !discOn;
    if (discOn) {
      var label = appliedCoupon ? appliedCoupon.code : 'Discount';
      if ($('sum-discount-label')) $('sum-discount-label').textContent = 'Discount (' + label + ')';
      if ($('co-discount-label')) $('co-discount-label').textContent = 'Discount (' + label + ')';
      $('sum-discount').textContent = '−' + inr(t.discount);
      $('co-discount').textContent = '−' + inr(t.discount);
    }

    var gstRow = $('sum-gst-row'), coGstRow = $('co-gst-row');
    var gstOn = t.gst > 0;
    if (gstRow) gstRow.hidden = !gstOn;
    if (coGstRow) coGstRow.hidden = !gstOn;
    if (gstOn) {
      if ($('sum-gst-label')) $('sum-gst-label').textContent = 'GST (' + GST_PERCENT + '%)';
      if ($('co-gst-label')) $('co-gst-label').textContent = 'GST (' + GST_PERCENT + '%)';
      $('sum-gst').textContent = inr(t.gst);
      $('co-gst').textContent = inr(t.gst);
    }

    var hint = $('free-hint');
    if (hint) {
      if (TABLE_NUMBER) {
        hint.hidden = true;
      } else if (t.subtotal > 0 && t.subtotal < FREE_ABOVE) {
        hint.textContent = 'Add ' + inr(FREE_ABOVE - t.subtotal) + ' more for free delivery in Kanpur.';
        hint.hidden = false;
      } else if (t.subtotal >= FREE_ABOVE) {
        hint.textContent = 'Free delivery unlocked in Kanpur. 🍦';
        hint.hidden = false;
      } else {
        hint.hidden = true;
      }
    }

    var n = itemCount();
    countEl.textContent = String(n);
    countEl.hidden = n === 0;
    saveCart();
  }

  /* ---------- drawer ---------- */
  function showStep(which) {
    stepCart.hidden = which !== 'cart';
    stepCheckout.hidden = which !== 'checkout';
    stepSuccess.hidden = which !== 'success';
    $('drawer-kicker').textContent =
      which === 'cart' ? 'Your cart' : which === 'checkout' ? 'Checkout' : 'Confirmed';
    $('drawer-title').textContent =
      which === 'cart' ? 'A little something sweet'
        : which === 'checkout' ? (TABLE_NUMBER ? 'Confirm your order' : 'Where should it go?')
          : 'Thank you, truly.';
    drawer.scrollTop = 0;
  }

  function openDrawer(step) {
    lastFocus = document.activeElement;
    drawer.hidden = false;
    scrim.hidden = false;
    requestAnimationFrame(function () {
      drawer.classList.add('is-open');
      scrim.classList.add('is-open');
    });
    document.body.style.overflow = 'hidden';
    if (step) showStep(step);
    var f = drawer.querySelector('button:not([disabled]), input, textarea');
    if (f) f.focus({ preventScroll: true });
  }

  function closeDrawer() {
    drawer.classList.remove('is-open');
    scrim.classList.remove('is-open');
    document.body.style.overflow = '';
    setTimeout(function () { drawer.hidden = true; scrim.hidden = true; }, 340);
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }

  /* ---------- cart mutations ---------- */
  function addToCart(productId, flavourId, flavourName, baseName) {
    if (!PRODUCTS[productId]) return;
    var k = lineKey(productId, flavourId, baseName);
    if (cart[k]) {
      cart[k].qty = Math.min(50, cart[k].qty + 1);
    } else {
      cart[k] = {
        productId: productId,
        flavourId: flavourId || null,
        flavourName: flavourName || null,
        baseName: baseName || null,
        qty: 1,
      };
    }
    renderCart();
    openDrawer('cart');
  }
  // Adds a Double Scoop Waffle Cone in the given flavour — called from the
  // flavour cabinet's "Add to cart" buttons (see js/ui.js).
  function addFlavour(flavourId, flavourName) {
    addToCart('double', flavourId, flavourName);
  }
  // Adds the currently-built 3D counter selection (variety + size + flavour).
  var SIZE_TO_PRODUCT = { mini: 'single', regular: 'double', large: 'triple', party: 'family' };
  function addBuild(varietyName, sizeId, flavourId, flavourName) {
    var productId = SIZE_TO_PRODUCT[sizeId] || 'double';
    addToCart(productId, flavourId, flavourName, varietyName);
  }

  document.querySelectorAll('[data-add]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      addToCart(btn.getAttribute('data-add'));
      btn.classList.add('is-added');
      var original = btn.textContent;
      btn.textContent = 'Added ✓';
      setTimeout(function () { btn.textContent = original; btn.classList.remove('is-added'); }, 1200);
    });
  });

  linesEl.addEventListener('click', function (e) {
    var t = e.target.closest('button');
    if (!t) return;
    var inc = t.getAttribute('data-inc'), dec = t.getAttribute('data-dec');
    var k = inc || dec;
    if (!k || !cart[k]) return;
    if (inc) { cart[k].qty = Math.min(50, cart[k].qty + 1); }
    if (dec) { cart[k].qty -= 1; if (cart[k].qty < 1) delete cart[k]; }
    renderCart();
    if (!Object.keys(cart).length) showStep('cart');
  });

  /* ---------- coupon ---------- */
  var couponInput = $('coupon-input'), couponMsg = $('coupon-msg'), couponApplyBtn = $('coupon-apply');
  function setCouponMsg(text, ok) {
    if (!couponMsg) return;
    couponMsg.textContent = text;
    couponMsg.className = 'coupon-msg' + (text ? (ok ? ' is-ok' : ' is-err') : '');
  }
  if (couponApplyBtn) {
    couponApplyBtn.addEventListener('click', function () {
      var code = couponInput.value.trim();
      if (!code) { setCouponMsg('Enter a code first.', false); return; }
      var t = totals();
      couponApplyBtn.disabled = true;
      couponApplyBtn.textContent = '…';
      fetch(API + '/api/coupon/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code, subtotal: t.subtotal }),
      })
        .then(function (r) { return r.json(); })
        .then(function (r) {
          if (!r.ok) { setCouponMsg(r.error || 'That code is not valid.', false); appliedCoupon = null; }
          else {
            appliedCoupon = { code: code.toUpperCase(), discount: r.discount, label: r.label, freeDelivery: r.freeDelivery };
            setCouponMsg('Applied: ' + r.label, true);
          }
          renderCart();
        })
        .catch(function () { setCouponMsg('Could not check that code — please try again.', false); })
        .then(function () { couponApplyBtn.disabled = false; couponApplyBtn.textContent = 'Apply'; });
    });
  }

  $('cart-open').addEventListener('click', function () { openDrawer(Object.keys(cart).length ? 'cart' : 'cart'); });
  $('drawer-close').addEventListener('click', closeDrawer);
  scrim.addEventListener('click', closeDrawer);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !drawer.hidden) closeDrawer();
  });
  $('to-checkout').addEventListener('click', function () { showStep('checkout'); });
  $('back-to-cart').addEventListener('click', function () { showStep('cart'); });
  $('success-done').addEventListener('click', closeDrawer);

  /* ---------- validation ---------- */
  function setError(field, msg) {
    var el = form.querySelector('[data-err="' + field + '"]');
    if (el) el.textContent = msg || '';
    var input = form.querySelector('[name="' + field + '"]');
    if (input && input.type !== 'radio') input.classList.toggle('is-invalid', !!msg);
  }
  function clearErrors() {
    form.querySelectorAll('.err').forEach(function (e) { e.textContent = ''; });
    form.querySelectorAll('.is-invalid').forEach(function (e) { e.classList.remove('is-invalid'); });
    apiError.hidden = true;
  }

  function readForm() {
    var pay = form.querySelector('input[name="payment_method"]:checked');
    return {
      customer_name: form.customer_name.value.trim(),
      phone: form.phone.value.replace(/[\s-]/g, '').replace(/^\+91/, ''),
      email: form.email.value.trim(),
      address: TABLE_NUMBER ? '' : form.address.value.trim(),
      city: TABLE_NUMBER ? '' : form.city.value.trim(),
      pincode: TABLE_NUMBER ? '' : form.pincode.value.trim(),
      payment_method: pay ? pay.value : '',
      notes: form.notes.value.trim(),
    };
  }

  function validate(d) {
    var errs = {};
    if (d.customer_name.length < 2) errs.customer_name = 'Please enter your full name.';
    if (!/^[6-9]\d{9}$/.test(d.phone)) errs.phone = 'Enter a valid 10-digit Indian mobile number.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.email)) errs.email = 'Enter a valid email address.';
    if (!TABLE_NUMBER) {
      if (d.address.length < 8) errs.address = 'Please enter your full delivery address.';
      if (d.city.length < 2) errs.city = 'Please enter your city.';
      if (!/^\d{6}$/.test(d.pincode)) errs.pincode = 'Pincode must be 6 digits.';
    }
    if (d.payment_method !== 'UPI' && d.payment_method !== 'COD') errs.payment_method = 'Choose UPI or Cash on Delivery.';
    if (!Object.keys(cart).length) errs.items = 'Your cart is empty.';
    return errs;
  }

  ['customer_name', 'phone', 'email', 'address', 'city', 'pincode'].forEach(function (n) {
    var input = form.querySelector('[name="' + n + '"]');
    if (input) input.addEventListener('input', function () { setError(n, ''); });
  });

  /* ---------- submit ---------- */
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    clearErrors();
    var data = readForm();
    var errs = validate(data);
    if (Object.keys(errs).length) {
      Object.keys(errs).forEach(function (k) { setError(k, errs[k]); });
      if (errs.items) { apiError.hidden = false; apiError.textContent = errs.items; }
      var firstBad = form.querySelector('.is-invalid');
      if (firstBad) firstBad.focus({ preventScroll: false });
      return;
    }

    data.items = Object.keys(cart).map(function (k) {
      var line = cart[k];
      return {
        id: line.productId,
        qty: line.qty,
        flavour: line.flavourName || undefined,
        flavourId: line.flavourId || undefined,
        base: line.baseName || undefined,
      };
    });
    if (appliedCoupon) data.coupon_code = appliedCoupon.code;
    if (TABLE_NUMBER) data.table_number = TABLE_NUMBER;

    placeBtn.disabled = true;
    placeBtn.classList.add('is-loading');
    placeBtn.textContent = 'Placing order…';

    fetch(API + '/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
      .then(function (res) {
        return res.json().then(function (body) { return { ok: res.ok, body: body }; });
      })
      .then(function (r) {
        if (!r.ok) {
          if (r.body && r.body.errors) {
            var errKeys = Object.keys(r.body.errors);
            if (errKeys.length === 1 && errKeys[0] === 'coupon_code') {
              setCouponMsg(r.body.errors.coupon_code, false);
              showStep('cart');
            } else {
              errKeys.forEach(function (k) {
                if (k === 'coupon_code') setCouponMsg(r.body.errors[k], false);
                else setError(k, r.body.errors[k]);
              });
              apiError.hidden = false;
              apiError.textContent = 'Please fix the highlighted fields and try again.';
            }
          } else {
            apiError.hidden = false;
            apiError.textContent = 'We could not place your order just now. Please try again in a moment.';
          }
          return;
        }
        var b = r.body;
        $('ok-code').textContent = b.order_code;
        $('ok-total').textContent = inr(b.total);
        $('ok-pay').textContent = b.payment_method === 'COD' ? 'Cash on Delivery' : 'UPI';
        $('ok-time').textContent = b.created_at_ist;
        var trackLink = $('track-link');
        if (trackLink) {
          trackLink.href = 'track.html?code=' + encodeURIComponent(b.order_code) + '&phone4=' + encodeURIComponent(data.phone.slice(-4));
        }
        var upiBox = $('upi-box');
        if (upiBox) {
          if (b.payment_method === 'UPI' && UPI.id) {
            var upiUri = 'upi://pay?pa=' + encodeURIComponent(UPI.id) + '&pn=' + encodeURIComponent(UPI.name || 'Veloura') +
              '&am=' + encodeURIComponent(b.total) + '&cu=INR&tn=' + encodeURIComponent('Veloura order ' + b.order_code);
            $('upi-qr').src = 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=' + encodeURIComponent(upiUri);
            $('upi-pay-link').href = upiUri;
            upiBox.hidden = false;
          } else {
            upiBox.hidden = true;
          }
        }
        cart = {};
        appliedCoupon = null;
        setCouponMsg('', false);
        if (couponInput) couponInput.value = '';
        saveCart();
        renderCart();
        form.reset();
        if (!TABLE_NUMBER) form.city.value = 'Kanpur';
        showStep('success');
      })
      .catch(function () {
        apiError.hidden = false;
        apiError.textContent = 'Network error — we could not reach the creamery. Please check your connection and try again.';
      })
      .then(function () {
        placeBtn.disabled = false;
        placeBtn.classList.remove('is-loading');
        placeBtn.textContent = 'Place order';
      });
  });

  loadCart();
  renderCart();
  window.VelouraCart = { add: addToCart, addFlavour: addFlavour, addBuild: addBuild, open: openDrawer, state: function () { return { cart: cart, totals: totals() }; } };
})();
