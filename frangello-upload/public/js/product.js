// ─── INIT ────────────────────────────────────────────────────────────────────
let product = null;
let storeConfig = {};

async function init() {
  // Get product ID from URL: /product/SOME-UUID
  const id = window.location.pathname.split('/').filter(Boolean).pop();
  if (!id || id === 'product') {
    showNotFound();
    return;
  }
  await loadConfig();
  await loadProduct(id);
  initStickyBar();
}

async function loadConfig() {
  try {
    const res = await fetch('/api/config/public');
    storeConfig = await res.json();
    if (storeConfig.storeName) {
      document.querySelector('.logo-main').textContent = storeConfig.storeName.split(' ')[0] || 'Frangello';
    }
  } catch {}
}

async function loadProduct(id) {
  try {
    // Fetch all products and find by ID
    const res = await fetch('/api/products');
    const products = await res.json();
    product = products.find(p => p.id === id);

    if (!product) {
      // Try admin endpoint as fallback (product might be hidden)
      showNotFound();
      return;
    }
    renderProduct(product);
  } catch {
    showNotFound();
  }
}

function renderProduct(p) {
  const currency = storeConfig.currency || 'BYN';
  const discount = p.oldPrice ? Math.round((1 - p.price / p.oldPrice) * 100) : 0;

  // Page title
  document.title = p.name + ' – Frangello By';

  // Image
  const img = document.getElementById('plpImage');
  img.src = p.image || 'https://via.placeholder.com/600x600?text=Product';
  img.alt = p.name;
  img.onerror = () => { img.src = 'https://via.placeholder.com/600x600?text=Frangello+By'; };

  // Badge
  if (p.badge) {
    const badge = document.getElementById('plpBadge');
    badge.textContent = p.badge;
    badge.className = 'plp-badge badge-' + p.badge;
    badge.style.display = 'inline-block';
  }

  // Discount circle
  if (discount > 0) {
    document.getElementById('plpDiscountCircle').style.display = 'flex';
    document.getElementById('plpDiscountPct').textContent = '-' + discount + '%';
  }

  // Collection tag
  if (p.collection) {
    document.getElementById('plpCollection').textContent = p.collection.toUpperCase();
  }

  // Title & description
  document.getElementById('plpTitle').textContent = p.name;
  document.getElementById('plpDesc').textContent = p.description || '';

  // Prices
  document.getElementById('plpPrice').textContent = p.price.toLocaleString() + ' ' + currency;
  if (p.oldPrice) {
    const oldPriceEl = document.getElementById('plpOldPrice');
    oldPriceEl.textContent = p.oldPrice.toLocaleString() + ' ' + currency;
    oldPriceEl.style.display = 'inline';
    const saved = p.oldPrice - p.price;
    document.getElementById('plpSaveBadge').style.display = 'flex';
    document.getElementById('plpSaveAmount').textContent = saved.toLocaleString() + ' ' + currency;
  }

  // Sticky bar
  document.getElementById('stickyPrice').textContent = p.price.toLocaleString() + ' ' + currency;

  // Show main content
  document.getElementById('productLoading').style.display = 'none';
  document.getElementById('productMain').classList.remove('hidden');
}

function showNotFound() {
  document.getElementById('productLoading').style.display = 'none';
  document.getElementById('productNotFound').classList.remove('hidden');
}

// ─── ORDER FORM ───────────────────────────────────────────────────────────────
async function submitProductOrder(e) {
  e.preventDefault();
  if (!product) return;

  const name = document.getElementById('plpName').value.trim();
  const phone = document.getElementById('plpPhone').value.trim();
  if (!name || !phone) return;

  const btn = document.getElementById('plpOrderBtn');
  btn.disabled = true;
  btn.textContent = 'Placing Order...';

  try {
    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name, phone,
        productId: product.id,
        productName: product.name,
        price: product.price
      })
    });
    const data = await res.json();
    if (data.success) {
      document.getElementById('plpSuccessName').textContent = name;
      document.getElementById('plpSuccessPhone').textContent = phone;
      document.getElementById('plpOrderForm').classList.add('hidden');
      document.getElementById('plpSuccess').classList.remove('hidden');
      document.getElementById('stickyBar').classList.remove('visible');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      showToast('Something went wrong. Try again.');
    }
  } catch {
    showToast('Connection error. Please try again.');
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M7 18c-1.1 0-1.99.9-1.99 2S5.9 22 7 22s2-.9 2-2-.9-2-2-2zm10 0c-1.1 0-1.99.9-1.99 2s.89 2 1.99 2 2-.9 2-2-.9-2-2-2zm-8.9-5h7.45c.75 0 1.41-.41 1.75-1.03L20.7 6H5.21l-.94-2H1v2h2l3.6 7.59L5.25 15c-.16.28-.25.61-.25.96C5 17.1 5.9 18 7 18h12v-2H7.42c-.13 0-.25-.11-.25-.25z"/></svg> Order Now – Cash on Delivery`;
  }
}

function scrollToForm() {
  const form = document.getElementById('plpOrderForm');
  if (!form.classList.contains('hidden')) {
    form.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => document.getElementById('plpName').focus(), 400);
  }
}

// ─── STICKY BAR ───────────────────────────────────────────────────────────────
function initStickyBar() {
  const bar = document.getElementById('stickyBar');
  const form = document.getElementById('plpOrderForm');
  bar.classList.remove('hidden');

  const observer = new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting) {
      bar.classList.remove('visible');
    } else {
      if (!document.getElementById('plpSuccess').classList.contains('hidden') === false) return;
      bar.classList.add('visible');
    }
  }, { threshold: 0.1 });

  observer.observe(form);
}

// ─── TOAST ────────────────────────────────────────────────────────────────────
function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
}

init();
