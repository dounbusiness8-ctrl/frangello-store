// ─── INIT ────────────────────────────────────────────────────────────────────
let product = null;
let storeConfig = {};
let selectedVariants = {};
let rewardWasClaimed = false;

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

  renderVariants(p.variants || []);
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
    const res = await fetch('/api/orders', {
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
    });
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
      document.getElementById('stickyBar').classList.remove('visible');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      showToast('Что-то пошло не так. Попробуйте ещё раз.');
    }
  } catch {
    showToast('Ошибка соединения. Попробуйте ещё раз.');
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
    const res = await fetch('/api/orders', {
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
    });
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
      document.getElementById('stickyBar').classList.remove('visible');
      document.querySelector('#plpSuccess h3').textContent = 'Заявка на консультацию отправлена!';
      document.querySelector('#plpSuccess p').innerHTML = 'Спасибо, <strong id="plpSuccessName"></strong>! Мы свяжемся с вами по номеру <strong id="plpSuccessPhone"></strong> и поможем выбрать подходящий вариант.';
      document.getElementById('plpSuccessName').textContent = name;
      document.getElementById('plpSuccessPhone').textContent = phone;
      window.scrollTo({ top: 0, behavior: 'smooth' });
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

function trackProductView(p, currency) {
  if (!window.metaTrack) return;
  window.metaTrack('ViewContent', {
    currency,
    value: Number(p.price || 0),
    content_name: p.name,
    content_ids: [p.id],
    content_type: 'product'
  });
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

function escAttr(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function escJs(str) {
  return String(str || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

init();
