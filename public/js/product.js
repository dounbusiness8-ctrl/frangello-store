// ─── VISITOR TRACKING ────────────────────────────────────────────────────────
(function initTracking() {
  let sessionId = sessionStorage.getItem('_vsid');
  if (!sessionId) { sessionId = Math.random().toString(36).slice(2) + Date.now().toString(36); sessionStorage.setItem('_vsid', sessionId); }

  function sendView(productId, productName) {
    fetch('/api/track/view', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId, productId, productName }) }).catch(() => {});
  }
  function sendLeave() {
    navigator.sendBeacon('/api/track/leave', JSON.stringify({ sessionId }));
  }

  window.__trackView = sendView;
  window.addEventListener('pagehide', sendLeave);
  setInterval(() => fetch('/api/track/ping', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId }) }).catch(() => {}), 30000);
})();

// ─── INIT ────────────────────────────────────────────────────────────────────
let product = null;
let storeConfig = {};
let selectedVariants = {};
let rewardWasClaimed = false;
let approvedReviews = [];
let cutoffIntervalId = null;
let reviewImageData = '';
let productIsFavorite = false;

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
    if (window.__trackView) window.__trackView(product.id, product.name);
  } catch {
    showNotFound();
  }
}

const reviewImageInput = document.getElementById('plpReviewImageFile');
if (reviewImageInput) {
  reviewImageInput.addEventListener('change', async function() {
    const file = this.files && this.files[0];
    if (!file) {
      reviewImageData = '';
      toggleReviewImagePreview('');
      return;
    }

    if (!file.type.startsWith('image/')) {
      showToast('Выберите файл изображения для отзыва.');
      this.value = '';
      reviewImageData = '';
      toggleReviewImagePreview('');
      return;
    }

    try {
      reviewImageData = await readFileAsDataURL(file);
      toggleReviewImagePreview(reviewImageData);
    } catch {
      showToast('Не удалось прочитать это изображение.');
      this.value = '';
      reviewImageData = '';
      toggleReviewImagePreview('');
    }
  });
}

function renderProduct(p) {
  const currency = storeConfig.currency || 'BYN';
  const discount = p.oldPrice ? Math.round((1 - p.price / p.oldPrice) * 100) : 0;
  selectedVariants = {};

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

  // Title
  document.getElementById('plpTitle').textContent = p.name;
  syncFavoriteButton();

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

  // Sticky bar removed

  renderVariants(p.variants || []);
  renderLandingContent(p);
  loadApprovedReviews(p.id);
  loadProductFavoriteState();
  initCutoffTimer();
  trackProductView(p, currency);

  // Show main content
  document.getElementById('productLoading').style.display = 'none';
  document.getElementById('productMain').classList.remove('hidden');
}

function renderVariants(variants) {
  const wrap = document.getElementById('plpVariants');
  const grid = document.getElementById('plpVariantsGrid');
  if (!Array.isArray(variants) || !variants.length) {
    wrap.classList.add('hidden');
    grid.innerHTML = '';
    return;
  }

  wrap.classList.remove('hidden');
  grid.innerHTML = variants.map((variant, index) => {
    const options = Array.isArray(variant.values) ? variant.values : [];
    const selected = options[0] || '';
    selectedVariants[variant.name] = selected;
    return `
      <div class="plp-variant-group">
        <label for="variant-${index}">${variant.name}</label>
        <select id="variant-${index}" onchange="updateVariantSelection('${escJs(variant.name)}', this.value)">
          ${options.map(option => `<option value="${escAttr(option)}">${option}</option>`).join('')}
        </select>
      </div>
    `;
  }).join('');
}

function renderLandingContent(p) {
  const wrap = document.getElementById('plpStoryStack');
  const section = document.getElementById('plpStorySection');
  if (!wrap) return;

  // New: landingHtml (paste from anywhere)
  if (p.landingHtml && p.landingHtml.trim()) {
    if (section) section.style.display = '';
    wrap.innerHTML = `<div class="plp-landing-html">${p.landingHtml}</div>`;
    // Make all images responsive
    wrap.querySelectorAll('img').forEach(img => {
      img.style.maxWidth = '100%';
      img.style.height = 'auto';
      img.setAttribute('loading', 'lazy');
    });
    return;
  }

  // Fallback: old storyBlocks format
  const copy = Array.isArray(p.storyBlocks)
    ? p.storyBlocks.filter(item => item && (item.title || item.text || item.image))
    : [];

  if (!copy.length) {
    wrap.innerHTML = '';
    if (section) section.style.display = 'none';
    return;
  }

  if (section) section.style.display = '';
  const safeName = escHtml(p.name || 'товар');

  wrap.innerHTML = copy.map((item, index) => {
    const titleLen = (item.title || '').length;
    const titleSize = titleLen === 0 ? '' :
      titleLen <= 20 ? 'font-size:clamp(32px,4.5vw,52px)' :
      titleLen <= 35 ? 'font-size:clamp(26px,3.5vw,40px)' :
      titleLen <= 55 ? 'font-size:clamp(22px,2.8vw,34px)' :
                        'font-size:clamp(18px,2.2vw,28px)';
    const textLen = (item.text || '').length;
    const textSize = textLen <= 80 ? 'font-size:17px;line-height:1.7' :
                     textLen <= 160 ? 'font-size:15px;line-height:1.82' :
                                      'font-size:14px;line-height:1.9';
    return `
    <article class="plp-story-card ${index % 2 === 1 ? 'reverse' : ''}">
      <div class="plp-story-copy">
        ${item.label ? `<span class="plp-story-label">${escHtml(item.label)}</span>` : ''}
        ${item.title ? `<h3 style="${titleSize}">${escHtml(item.title)}</h3>` : ''}
        ${item.text ? `<p style="${textSize}">${escHtml(item.text).replace(/\n/g, '<br />')}</p>` : ''}
      </div>
      <div class="plp-story-visual">
        <div class="plp-story-visual-frame">
          <img src="${escAttr(item.image || p.image || '')}" alt="${safeName}" loading="lazy" />
        </div>
      </div>
    </article>`;
  }).join('');
}

function updateVariantSelection(name, value) {
  selectedVariants[name] = value;
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
  const validation = validateLeadInputs(name, phone);
  if (!validation.ok) {
    showToast(validation.message);
    validation.field?.focus();
    return;
  }

  const btn = document.getElementById('plpOrderBtn');
  const eventId = window.metaGenerateEventId ? window.metaGenerateEventId('purchase') : `purchase_${Date.now()}`;
  const trackingData = window.metaGetTrackingData ? window.metaGetTrackingData() : {};
  btn.disabled = true;
  btn.textContent = 'Оформляем заказ...';

  try {
    const res = await (window.FrangelloCustomer ? window.FrangelloCustomer.fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name, phone,
        productId: product.id,
        productName: product.name,
        price: product.price,
        variantSelection: selectedVariants,
        variantLabel: formatVariantLabel(selectedVariants),
        orderType: 'order',
        eventId,
        trackingData
      })
    }) : fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name, phone,
        productId: product.id,
        productName: product.name,
        price: product.price,
        variantSelection: selectedVariants,
        variantLabel: formatVariantLabel(selectedVariants),
        orderType: 'order',
        eventId,
        trackingData
      })
    }));
    const data = await res.json();
    if (data.success) {
      if (window.metaTrack) {
        window.metaTrack('Purchase', {
          currency: storeConfig.currency || 'BYN',
          value: Number(product.price || 0),
          content_name: product.name,
          content_ids: [product.id],
          content_type: 'product'
        }, { eventID: eventId });
      }
      document.getElementById('plpSuccessName').textContent = name;
      document.getElementById('plpSuccessPhone').textContent = phone;
      document.getElementById('plpRewardCard').classList.remove('hidden');
      resetRewardCard();
      document.getElementById('plpOrderForm').classList.add('hidden');
      document.getElementById('plpSuccess').classList.remove('hidden');
      document.getElementById('stickyOrderNow').classList.remove('visible');
      document.getElementById('plpSuccess').scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      showToast(data.detail || data.error || 'Что-то пошло не так. Попробуйте ещё раз.');
    }
  } catch (err) {
    showToast('Ошибка соединения: ' + (err.message || 'попробуйте ещё раз'));
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M7 18c-1.1 0-1.99.9-1.99 2S5.9 22 7 22s2-.9 2-2-.9-2-2-2zm10 0c-1.1 0-1.99.9-1.99 2s.89 2 1.99 2 2-.9 2-2-.9-2-2-2zm-8.9-5h7.45c.75 0 1.41-.41 1.75-1.03L20.7 6H5.21l-.94-2H1v2h2l3.6 7.59L5.25 15c-.16.28-.25.61-.25.96C5 17.1 5.9 18 7 18h12v-2H7.42c-.13 0-.25-.11-.25-.25z"/></svg> Заказать с оплатой при получении`;
  }
}

async function submitConsultationRequest(e) {
  e.preventDefault();
  if (!product) return;

  const name = document.getElementById('plpConsultName').value.trim();
  const phone = document.getElementById('plpConsultPhone').value.trim();
  const validation = validateLeadInputs(name, phone, true);
  if (!validation.ok) {
    showToast(validation.message);
    validation.field?.focus();
    return;
  }

  const btn = document.getElementById('plpConsultBtn');
  const eventId = window.metaGenerateEventId ? window.metaGenerateEventId('lead') : `lead_${Date.now()}`;
  const trackingData = window.metaGetTrackingData ? window.metaGetTrackingData() : {};
  btn.disabled = true;
  btn.textContent = 'Отправляем заявку...';

  try {
    const res = await (window.FrangelloCustomer ? window.FrangelloCustomer.fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        phone,
        productId: product.id,
        productName: product.name,
        price: product.price,
        variantSelection: selectedVariants,
        variantLabel: formatVariantLabel(selectedVariants),
        orderType: 'consultation',
        eventId,
        trackingData
      })
    }) : fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        phone,
        productId: product.id,
        productName: product.name,
        price: product.price,
        variantSelection: selectedVariants,
        variantLabel: formatVariantLabel(selectedVariants),
        orderType: 'consultation',
        eventId,
        trackingData
      })
    }));
    const data = await res.json();
    if (data.success) {
      if (window.metaTrack) {
        window.metaTrack('Lead', {
          content_name: product.name,
          content_ids: [product.id],
          content_type: 'product'
        }, { eventID: eventId });
      }
      document.getElementById('plpSuccessName').textContent = name;
      document.getElementById('plpSuccessPhone').textContent = phone;
      document.getElementById('plpOrderForm').classList.add('hidden');
      document.getElementById('plpConsultCard').classList.add('hidden');
      document.getElementById('plpRewardCard').classList.add('hidden');
      document.getElementById('plpSuccess').classList.remove('hidden');
      document.getElementById('stickyOrderNow').classList.remove('visible');
      document.querySelector('#plpSuccess h3').textContent = 'Заявка на консультацию отправлена!';
      document.querySelector('#plpSuccess p').innerHTML = 'Спасибо, <strong id="plpSuccessName"></strong>! Мы свяжемся с вами по номеру <strong id="plpSuccessPhone"></strong> и поможем выбрать подходящий вариант.';
      document.getElementById('plpSuccessName').textContent = name;
      document.getElementById('plpSuccessPhone').textContent = phone;
      document.getElementById('plpSuccess').scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      showToast('Что-то пошло не так. Попробуйте ещё раз.');
    }
  } catch {
    showToast('Ошибка соединения. Попробуйте ещё раз.');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Получить консультацию';
  }
}

function formatVariantLabel(variants) {
  const parts = Object.entries(variants || {}).filter(([, value]) => value);
  return parts.map(([name, value]) => `${name}: ${value}`).join(' · ');
}

function validateLeadInputs(name, phone, consultation = false) {
  const cleanedName = String(name || '').replace(/\s+/g, ' ').trim();
  const digits = String(phone || '').replace(/\D/g, '');
  const nameField = consultation ? document.getElementById('plpConsultName') : document.getElementById('plpName');
  const phoneField = consultation ? document.getElementById('plpConsultPhone') : document.getElementById('plpPhone');

  if (cleanedName.length < 3) {
    return {
      ok: false,
      message: 'Введите настоящее имя: минимум 3 символа.',
      field: nameField
    };
  }

  if (!/[A-Za-zА-Яа-яЁё]/.test(cleanedName)) {
    return {
      ok: false,
      message: 'Имя должно содержать буквы, а не случайные символы.',
      field: nameField
    };
  }

  if (digits.length < 9 || digits.length > 15) {
    return {
      ok: false,
      message: 'Введите корректный номер телефона, чтобы мы могли с вами связаться.',
      field: phoneField
    };
  }

  return { ok: true };
}

async function loadApprovedReviews(productId) {
  try {
    const res = await fetch(`/api/reviews?productId=${encodeURIComponent(productId)}`);
    approvedReviews = await res.json();
    renderApprovedReviews();
  } catch {
    approvedReviews = [];
    renderApprovedReviews();
  }
}

function renderApprovedReviews() {
  const list = document.getElementById('plpReviewsList');
  const averageEl = document.getElementById('plpReviewAverage');
  const countEl = document.getElementById('plpReviewCount');
  if (!list || !averageEl || !countEl) return;

  if (!approvedReviews.length) {
    averageEl.textContent = '—';
    countEl.textContent = 'Пока нет отзывов';
    list.innerHTML = '<div class="plp-review-empty">Пока нет опубликованных отзывов по этому товару.</div>';
    return;
  }

  const average = approvedReviews.reduce((sum, review) => sum + Number(review.rating || 0), 0) / approvedReviews.length;
  averageEl.textContent = average.toFixed(1);
  countEl.textContent = `${approvedReviews.length} ${approvedReviews.length === 1 ? 'отзыв' : approvedReviews.length < 5 ? 'отзыва' : 'отзывов'}`;

  list.innerHTML = approvedReviews.map(review => `
    <article class="plp-review-card">
      <div class="plp-review-top">
        <div class="plp-review-name">${escHtml(review.name)}</div>
        <div class="plp-review-stars">${'★'.repeat(Math.max(1, Math.min(5, Number(review.rating) || 0)))}</div>
      </div>
      <div class="plp-review-text">${escHtml(review.text)}</div>
      ${review.image ? `<div class="plp-review-image"><img src="${escAttr(review.image)}" alt="Фото к отзыву ${escAttr(review.name)}" loading="lazy" /></div>` : ''}
      <span class="plp-review-date">${formatReviewDate(review.createdAt)}</span>
    </article>
  `).join('');
}

async function submitProductReview(e) {
  e.preventDefault();
  if (!product) return;

  const name = document.getElementById('plpReviewName').value.trim();
  const phone = document.getElementById('plpReviewPhone').value.trim();
  const rating = Number(document.getElementById('plpReviewRating').value);
  const text = document.getElementById('plpReviewText').value.trim();
  const validation = validateLeadInputs(name, phone, true);

  if (!validation.ok) {
    showToast(validation.message);
    validation.field?.focus();
    return;
  }

  if (text.length < 10) {
    showToast('Напишите чуть более подробный отзыв, минимум 10 символов.');
    document.getElementById('plpReviewText').focus();
    return;
  }

  const btn = document.getElementById('plpReviewBtn');
  btn.disabled = true;
  btn.textContent = 'Отправляем отзыв...';

  try {
    const res = await fetch('/api/reviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        productId: product.id,
        productName: product.name,
        name,
        phone,
        text,
        rating,
        image: reviewImageData
      })
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Request failed');
    }

    document.getElementById('plpReviewName').value = '';
    document.getElementById('plpReviewPhone').value = '';
    document.getElementById('plpReviewRating').value = '5';
    document.getElementById('plpReviewText').value = '';
    document.getElementById('plpReviewImageFile').value = '';
    reviewImageData = '';
    toggleReviewImagePreview('');
    showToast('Спасибо! Отзыв отправлен на модерацию.');
  } catch (error) {
    showToast(error.message || 'Не удалось отправить отзыв.');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Отправить отзыв на модерацию';
  }
}

function trackProductView(p, currency) {
  if (!window.metaTrack) return;
  window.metaTrack('ViewContent', {
    currency,
    value: Number(p.price || 0),
    content_name: p.name,
    content_ids: [p.id],
    content_type: 'product'
  });

  // InitiateCheckout — fires once when user touches the order form
  let checkoutTracked = false;
  ['plpName', 'plpPhone'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('focus', () => {
      if (checkoutTracked || !window.metaTrack) return;
      checkoutTracked = true;
      window.metaTrack('InitiateCheckout', {
        currency,
        value: Number(p.price || 0),
        content_name: p.name,
        content_ids: [p.id],
        content_type: 'product',
        num_items: 1
      });
    }, { once: true });
  });
}

function syncFavoriteButton() {
  const btn = document.getElementById('plpFavoriteBtn');
  if (!btn || !product) return;
  btn.textContent = productIsFavorite ? '❤ Уже в избранном' : '♡ Сохранить в избранное';
  btn.classList.toggle('active', productIsFavorite);
}

async function loadProductFavoriteState() {
  if (!product || !window.FrangelloCustomer || !window.FrangelloCustomer.getToken()) {
    productIsFavorite = false;
    syncFavoriteButton();
    return;
  }

  try {
    const res = await window.FrangelloCustomer.fetch('/api/customer/favorites');
    const favorites = res.ok ? await res.json() : [];
    productIsFavorite = favorites.some(item => item.id === product.id);
  } catch {
    productIsFavorite = false;
  }

  syncFavoriteButton();
}

async function toggleProductFavorite() {
  if (!product) return;

  if (!window.FrangelloCustomer || !window.FrangelloCustomer.getToken()) {
    showToast('Войдите в кабинет, чтобы сохранить товар в избранное.');
    setTimeout(() => { window.location.href = '/account.html'; }, 500);
    return;
  }

  try {
    const res = await window.FrangelloCustomer.fetch(`/api/customer/favorites/${product.id}`, {
      method: productIsFavorite ? 'DELETE' : 'POST'
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error || 'Request failed');
    productIsFavorite = (data.favorites || []).includes(product.id);
    syncFavoriteButton();
    showToast(productIsFavorite ? 'Товар сохранён в избранное.' : 'Товар убран из избранного.');
  } catch (error) {
    showToast(error.message || 'Не удалось изменить избранное.');
  }
}

function scrollToForm() {
  const form = document.getElementById('plpOrderForm');
  if (!form.classList.contains('hidden')) {
    form.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => document.getElementById('plpName').focus(), 400);
  }
}

function revealReward() {
  if (rewardWasClaimed) return;

  const rewardCard = document.getElementById('plpRewardCard');
  const trigger = document.getElementById('plpRewardTrigger');
  const giftbox = document.getElementById('plpGiftbox');
  const result = document.getElementById('plpRewardResult');
  const codeEl = document.getElementById('plpRewardCode');
  const reward = {
    discount: 50,
    code: 'FRANGELLO50',
    sourceProductId: product?.id || '',
    createdAt: new Date().toISOString()
  };

  rewardWasClaimed = true;
  trigger.classList.add('revealing');
  giftbox.classList.add('spin');

  setTimeout(() => {
    rewardCard.classList.add('revealed');
  }, 420);

  setTimeout(() => {
    try {
      localStorage.setItem('frangelloReward', JSON.stringify(reward));
    } catch {}

    codeEl.textContent = reward.code;
    result.classList.remove('hidden');
    trigger.classList.add('hidden');

    if (window.metaTrack) {
      window.metaTrack('Lead', {
        content_name: 'RewardClaim',
        status: 'claimed',
        reward_code: reward.code
      });
    }
  }, 980);
}

function resetRewardCard() {
  rewardWasClaimed = false;
  const rewardCard = document.getElementById('plpRewardCard');
  const trigger = document.getElementById('plpRewardTrigger');
  const giftbox = document.getElementById('plpGiftbox');
  const result = document.getElementById('plpRewardResult');
  const codeEl = document.getElementById('plpRewardCode');

  rewardCard.classList.remove('revealed');
  trigger.classList.remove('hidden', 'revealing');
  giftbox.classList.remove('spin');
  result.classList.add('hidden');
  codeEl.textContent = 'FRANGELLO50';
}

function initCutoffTimer() {
  const timerEl = document.getElementById('plpCutoffTimer');
  const textEl = document.getElementById('plpCutoffText');
  const statusEl = document.querySelector('.plp-cutoff-status');
  if (!timerEl || !textEl || !statusEl) return;

  if (cutoffIntervalId) {
    clearInterval(cutoffIntervalId);
  }

  const updateTimer = () => {
    const now = new Date();
    const cutoff = new Date(now);
    cutoff.setHours(23, 59, 59, 999);

    if (now >= cutoff) {
      const tomorrowOffer = new Date(now);
      tomorrowOffer.setDate(tomorrowOffer.getDate() + 1);
      tomorrowOffer.setHours(23, 59, 59, 999);
      const diff = tomorrowOffer - now;
      timerEl.textContent = formatDuration(diff);
      statusEl.textContent = 'Новое окно';
      textEl.textContent = 'Текущая акция обновляется вместе с новым дневным окном. Оставьте заявку раньше, чтобы не упустить выгодную цену.';
      return;
    }

    const diff = cutoff - now;
    timerEl.textContent = formatDuration(diff);
    statusEl.textContent = 'Акция дня';
    textEl.textContent = 'Если оставить заявку сегодня, вы фиксируете текущую цену и размер скидки до подтверждения заказа.';
  };

  updateTimer();
  cutoffIntervalId = setInterval(updateTimer, 1000);
}

// ─── STICKY BAR ───────────────────────────────────────────────────────────────
function initStickyBar() {
  const btn = document.getElementById('stickyOrderNow');
  const form = document.getElementById('plpOrderForm');

  const observer = new IntersectionObserver(([entry]) => {
    const success = document.getElementById('plpSuccess');
    const orderDone = success && !success.classList.contains('hidden');
    if (entry.isIntersecting || orderDone) {
      btn.classList.remove('visible');
    } else {
      btn.classList.add('visible');
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

function formatReviewDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

function toggleReviewImagePreview(src) {
  const wrap = document.getElementById('plpReviewImagePreviewWrap');
  const img = document.getElementById('plpReviewImagePreview');
  if (!wrap || !img) return;

  if (!src) {
    wrap.classList.add('hidden');
    img.src = '';
    return;
  }

  img.src = src;
  wrap.classList.remove('hidden');
}

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
  const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

function escHtml(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function escAttr(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function escJs(str) {
  return String(str || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

init();

window.addEventListener('frangello:customer-updated', () => {
  loadProductFavoriteState();
});
