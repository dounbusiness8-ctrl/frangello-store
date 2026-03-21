// ─── STATE ──────────────────────────────────────────────────────────────────
let products = [];
let collections = [];
let activeCollection = 'all';
let config = {};
let currentProduct = null;
let activeReward = null;
let favoriteIds = [];

// ─── INIT ────────────────────────────────────────────────────────────────────
async function init() {
  await Promise.all([loadConfig(), loadCollections()]);
  loadRewardBanner();
  await loadFavoriteIds();
  await loadProducts();
  initHeader();
  initRevealMotion();
  requestAnimationFrame(() => document.body.classList.add('is-ready'));
}

// ─── CONFIG ──────────────────────────────────────────────────────────────────
async function loadConfig() {
  try {
    const res = await fetch('/api/config/public');
    config = await res.json();
    if (config.storeName) document.title = config.storeName + ' – Premium Store';
    if (config.heroTitle) document.getElementById('heroTitle').textContent = config.heroTitle;
    if (config.heroSubtitle) document.getElementById('heroSubtitle').textContent = config.heroSubtitle;
    if (config.whatsapp) {
      const btn = document.getElementById('waFloat');
      btn.href = 'https://wa.me/' + config.whatsapp.replace(/\D/g, '');
      btn.style.display = 'flex';
    }
  } catch (e) {}
}

// ─── HEADER SCROLL ───────────────────────────────────────────────────────────
function initHeader() {
  const header = document.getElementById('header');
  window.addEventListener('scroll', () => {
    header.classList.toggle('scrolled', window.scrollY > 20);
  }, { passive: true });
}

function initRevealMotion() {
  const elements = document.querySelectorAll('.reveal-up');
  if (!elements.length) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  }, {
    threshold: 0.16,
    rootMargin: '0px 0px -40px 0px'
  });

  elements.forEach((element, index) => {
    element.style.transitionDelay = `${Math.min(index * 60, 240)}ms`;
    observer.observe(element);
  });
}

// ─── COLLECTIONS ─────────────────────────────────────────────────────────────
async function loadCollections() {
  try {
    const res = await fetch('/api/collections');
    collections = await res.json();
    renderCollections();
  } catch (e) {}
}

function renderCollections() {
  const bar = document.getElementById('collectionsBar');
  bar.innerHTML = collections.map(c => `
    <button class="col-tab ${c.slug === activeCollection ? 'active' : ''}"
      onclick="filterCollection('${c.slug}')">
      ${c.icon || ''} ${c.name}
    </button>
  `).join('');
}

function filterCollection(slug) {
  activeCollection = slug;
  renderCollections();
  loadProducts(slug);
}

// ─── PRODUCTS ─────────────────────────────────────────────────────────────────
async function loadProducts(collection = 'all') {
  const grid = document.getElementById('productsGrid');
  // Skeleton
  grid.innerHTML = Array(6).fill(0).map(() => `
    <div class="skeleton-card">
      <div class="skeleton skeleton-img"></div>
      <div class="skeleton-body">
        <div class="skeleton skeleton-line"></div>
        <div class="skeleton skeleton-line short"></div>
        <div class="skeleton skeleton-btn"></div>
      </div>
    </div>
  `).join('');

  try {
    const url = collection && collection !== 'all'
      ? `/api/products?collection=${collection}`
      : '/api/products';
    const res = await fetch(url);
    products = await res.json();
    renderProducts(products);
    document.getElementById('statProducts').textContent = products.length + '+';
  } catch (e) {
    grid.innerHTML = '<p style="text-align:center;color:#aaa;padding:40px">Не удалось загрузить товары.</p>';
  }
}

function renderProducts(list) {
  const grid = document.getElementById('productsGrid');
  const noProducts = document.getElementById('noProducts');
  if (!list.length) {
    grid.innerHTML = '';
    noProducts.classList.remove('hidden');
    return;
  }
  noProducts.classList.add('hidden');
  grid.innerHTML = list.map((p, i) => {
    const discount = p.oldPrice ? Math.round((1 - p.price / p.oldPrice) * 100) : 0;
    const variantSummary = Array.isArray(p.variants) && p.variants.length
      ? p.variants.map(v => v.name).filter(Boolean).join(' / ')
      : '';
    const rewardNote = activeReward
      ? `<div class="product-reward-note">🎁 Ваш бонус -50% активен</div>`
      : '';
    const ctaText = activeReward ? 'Открыть товар с бонусом' : 'Подробнее и заказать';
    const favoriteActive = favoriteIds.includes(p.id);
    return `
    <div class="product-card ${activeReward ? 'reward-ready' : ''}" style="animation-delay:${i * 0.06}s">
      <button type="button" class="product-favorite-btn ${favoriteActive ? 'active' : ''}" onclick="toggleFavoriteFromCard(event, '${p.id}')">
        ${favoriteActive ? '❤ В избранном' : '♡ В избранное'}
      </button>
      <a href="/product/${p.id}" class="product-img-wrap">
        <img src="${p.image || 'https://via.placeholder.com/400x400?text=Product'}"
             alt="${p.name}" loading="lazy"
             onerror="this.src='https://via.placeholder.com/400x400?text=Frangello+By'" />
        ${p.badge ? `<span class="product-badge badge-${p.badge}">${p.badge}</span>` : ''}
        <div class="product-overlay"><span class="product-overlay-btn">👁 Смотреть товар</span></div>
      </a>
      <div class="product-body">
        <div class="product-name">${p.name}</div>
        <div class="product-desc">${p.description || ''}</div>
        ${rewardNote}
        ${variantSummary ? `<div class="product-variants-hint">Доступно: ${variantSummary}</div>` : ''}
        <div class="product-prices">
          <span class="product-price">${p.price.toLocaleString()} ${config.currency || 'BYN'}</span>
          ${p.oldPrice ? `<span class="product-old-price">${p.oldPrice.toLocaleString()} ${config.currency || 'BYN'}</span>` : ''}
          ${discount > 0 ? `<span class="product-discount">-${discount}%</span>` : ''}
        </div>
        <a class="btn-order" href="/product/${p.id}" onclick="trackAddToCart(${JSON.stringify({id:p.id,name:p.name,price:p.price,currency:config.currency||'BYN'})})">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M7 18c-1.1 0-1.99.9-1.99 2S5.9 22 7 22s2-.9 2-2-.9-2-2-2zm10 0c-1.1 0-1.99.9-1.99 2s.89 2 1.99 2 2-.9 2-2-.9-2-2-2zm-8.9-5h7.45c.75 0 1.41-.41 1.75-1.03L20.7 6H5.21l-.94-2H1v2h2l3.6 7.59L5.25 15c-.16.28-.25.61-.25.96C5 17.1 5.9 18 7 18h12v-2H7.42c-.13 0-.25-.11-.25-.25z"/></svg>
          ${ctaText}
        </a>
      </div>
    </div>`;
  }).join('');
}

async function loadFavoriteIds() {
  if (!window.FrangelloCustomer || !window.FrangelloCustomer.getToken()) {
    favoriteIds = [];
    return;
  }

  try {
    const res = await window.FrangelloCustomer.fetch('/api/customer/favorites');
    favoriteIds = res.ok ? (await res.json()).map(product => product.id) : [];
  } catch {
    favoriteIds = [];
  }
}

async function toggleFavoriteFromCard(event, productId) {
  event.preventDefault();
  event.stopPropagation();

  if (!window.FrangelloCustomer || !window.FrangelloCustomer.getToken()) {
    showToast('Войдите в кабинет, чтобы сохранять товары в избранное.');
    setTimeout(() => { window.location.href = '/account.html'; }, 500);
    return;
  }

  const active = favoriteIds.includes(productId);
  try {
    const res = await window.FrangelloCustomer.fetch(`/api/customer/favorites/${productId}`, {
      method: active ? 'DELETE' : 'POST'
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error || 'Request failed');
    favoriteIds = data.favorites || [];
    renderProducts(products);
    showToast(active ? 'Товар убран из избранного.' : 'Товар сохранён в избранное.');
  } catch (error) {
    showToast(error.message || 'Не удалось изменить избранное.');
  }
}

function loadRewardBanner() {
  try {
    const stored = localStorage.getItem('frangelloReward');
    if (!stored) return;
    const reward = JSON.parse(stored);
    if (!reward || reward.discount !== 50 || !reward.code) return;
    activeReward = reward;

    const banner = document.getElementById('rewardBanner');
    const code = document.getElementById('rewardBannerCode');
    if (banner && code) {
      code.textContent = reward.code;
      banner.classList.remove('hidden');
    }
  } catch {}
}

// ─── ORDER MODAL ──────────────────────────────────────────────────────────────
function openOrder(productId) {
  currentProduct = products.find(p => p.id === productId);
  if (!currentProduct) return;

  const overlay = document.getElementById('modalOverlay');
  const form = document.getElementById('orderForm');
  const success = document.getElementById('orderSuccess');

  form.classList.remove('hidden');
  success.classList.add('hidden');
  document.getElementById('modalImg').src = currentProduct.image || '';
  document.getElementById('modalProductName').textContent = currentProduct.name;
  document.getElementById('modalPrice').textContent =
    `${currentProduct.price.toLocaleString()} ${config.currency || 'BYN'}`;
  document.getElementById('customerName').value = '';
  document.getElementById('customerPhone').value = '';

  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
  setTimeout(() => document.getElementById('customerName').focus(), 300);
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('open');
  document.body.style.overflow = '';
  currentProduct = null;
}

// Close on Escape
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeModal();
});

async function submitOrder(e) {
  e.preventDefault();
  if (!currentProduct) return;

  const name = document.getElementById('customerName').value.trim();
  const phone = document.getElementById('customerPhone').value.trim();
  if (!name || !phone) return;

  const btn = document.getElementById('submitBtn');
  btn.disabled = true;
  btn.textContent = 'Placing Order...';

  try {
    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name, phone,
        productId: currentProduct.id,
        productName: currentProduct.name,
        price: currentProduct.price
      })
    });
    const data = await res.json();
    if (data.success) {
      document.getElementById('orderForm').classList.add('hidden');
      document.getElementById('successName').textContent = name;
      document.getElementById('successPhone').textContent = phone;
      document.getElementById('orderSuccess').classList.remove('hidden');
    } else {
      showToast('Something went wrong. Please try again.');
    }
  } catch (err) {
    showToast('Connection error. Please try again.');
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M20 4H4c-1.11 0-2 .89-2 2v12c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm0 14H4V8l8 5 8-5v10zm-8-7L4 6h16l-8 5z"/></svg> Order Now – Cash on Delivery`;
  }
}

// ─── TOAST ────────────────────────────────────────────────────────────────────
function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
}

// ─── TRACKING ─────────────────────────────────────────────────────────────────
function trackAddToCart(p) {
  if (!window.metaTrack) return;
  window.metaTrack('AddToCart', {
    currency: p.currency,
    value: Number(p.price || 0),
    content_name: p.name,
    content_ids: [p.id],
    content_type: 'product'
  });
}

// ─── START ────────────────────────────────────────────────────────────────────
init();

window.addEventListener('frangello:customer-updated', async () => {
  await loadFavoriteIds();
  renderProducts(products);
});
