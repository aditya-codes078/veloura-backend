/* Veloura — cart drawer, checkout and order submission. Plain script, no modules. */
(function () {
  'use strict';

  var API = 'port/8000';

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
  // Cart lines are keyed by "productId" or "productId::flavourId" so the same
  // product can be added multiple times with different flavours.
  var cart = {}; // lineKey -> { productId, flavourId, flavourName, qty }
  var PREMIUM_FLAVOURS = { dubai: 1, pistachio: 1, pistiramisu: 1, ube: 1 };

  function lineKey(productId, flavourId) {
    return flavourId ? productId + '::' + flavourId : productId;
  }
  function lineUnitPrice(line) {
    var base = PRODUCTS[line.productId].price;
    return base + (line.flavourId && PREMIUM_FLAVOURS[line.flavourId] ? 60 : 0);
  }
  function lineName(line) {
    var p = PRODUCTS[line.productId];
    return line.flavourName ? p.name + ' — ' + line.flavourName : p.name;
  }

  function totals() {
    var subtotal = 0;
    Object.keys(cart).forEach(function (k) { subtotal += lineUnitPrice(cart[k]) * cart[k].qty; });
    var delivery = subtotal === 0 ? 0 : subtotal >= FREE_ABOVE ? 0 : DELIVERY_FEE;
    return { subtotal: subtotal, delivery: delivery, total: subtotal + delivery };
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

    $('sum-subtotal').textContent = inr(t.subtotal);
    $('sum-delivery').textContent = t.delivery === 0 && t.subtotal > 0 ? 'Free' : inr(t.delivery);
    $('sum-total').textContent = inr(t.total);
    $('co-subtotal').textContent = inr(t.subtotal);
    $('co-delivery').textContent = t.delivery === 0 && t.subtotal > 0 ? 'Free' : inr(t.delivery);
    $('co-total').textContent = inr(t.total);

    var hint = $('free-hint');
    if (t.subtotal > 0 && t.subtotal < FREE_ABOVE) {
      hint.textContent = 'Add ' + inr(FREE_ABOVE - t.subtotal) + ' more for free delivery in Kanpur.';
      hint.hidden = false;
    } else if (t.subtotal >= FREE_ABOVE) {
      hint.textContent = 'Free delivery unlocked in Kanpur. 🍦';
      hint.hidden = false;
    } else {
      hint.hidden = true;
    }

    var n = itemCount();
    countEl.textContent = String(n);
    countEl.hidden = n === 0;
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
        : which === 'checkout' ? 'Where should it go?'
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
  function addToCart(productId, flavourId, flavourName) {
    if (!PRODUCTS[productId]) return;
    var k = lineKey(productId, flavourId);
    if (cart[k]) {
      cart[k].qty = Math.min(50, cart[k].qty + 1);
    } else {
      cart[k] = { productId: productId, flavourId: flavourId || null, flavourName: flavourName || null, qty: 1 };
    }
    renderCart();
    openDrawer('cart');
  }
  // Adds a Double Scoop Waffle Cone in the given flavour — called from the
  // flavour cabinet's "Add to cart" buttons (see js/ui.js).
  function addFlavour(flavourId, flavourName) {
    addToCart('double', flavourId, flavourName);
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
      address: form.address.value.trim(),
      city: form.city.value.trim(),
      pincode: form.pincode.value.trim(),
      payment_method: pay ? pay.value : '',
      notes: form.notes.value.trim(),
    };
  }

  function validate(d) {
    var errs = {};
    if (d.customer_name.length < 2) errs.customer_name = 'Please enter your full name.';
    if (!/^[6-9]\d{9}$/.test(d.phone)) errs.phone = 'Enter a valid 10-digit Indian mobile number.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.email)) errs.email = 'Enter a valid email address.';
    if (d.address.length < 8) errs.address = 'Please enter your full delivery address.';
    if (d.city.length < 2) errs.city = 'Please enter your city.';
    if (!/^\d{6}$/.test(d.pincode)) errs.pincode = 'Pincode must be 6 digits.';
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
      };
    });

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
            Object.keys(r.body.errors).forEach(function (k) { setError(k, r.body.errors[k]); });
            apiError.hidden = false;
            apiError.textContent = 'Please fix the highlighted fields and try again.';
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
        cart = {};
        renderCart();
        form.reset();
        form.city.value = 'Kanpur';
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

  renderCart();
  window.VelouraCart = { add: addToCart, addFlavour: addFlavour, open: openDrawer, state: function () { return { cart: cart, totals: totals() }; } };
})();
