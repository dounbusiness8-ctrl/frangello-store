// ─── STATE ──────────────────────────────────────────────────────────────────
let adminPassword = '';
let allOrders = [];
let allRefundRequests = [];
let allReviews = [];
let allProducts = [];
let allCollections = [];
let currentEditId = null;
let currentConfig = {};
let uploadedImageData = '';
let currentVariantDraft = [];
let currentStoryImages = [];

// ─── LOGIN ───────────────────────────────────────────────────────────────────
async function doLogin(e) {
  e.preventDefault();
  const pw = document.getElementById('loginPw').value;
  try {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pw })
    });
    if (res.ok) {
      adminPassword = pw;
      document.getElementById('loginOverlay').style.display = 'none';
      document.getElementById('adminLayout').style.display = 'flex';
      initAdmin();
    } else {
      showToast('Wrong password. Try again.', 'error');
    }
  } catch {
    showToast('Connection error.', 'error');
  }
}

function logout() {
  adminPassword = '';
  document.getElementById('loginOverlay').style.display = 'flex';
  document.getElementById('adminLayout').style.display = 'none';
}

// ─── INIT ────────────────────────────────────────────────────────────────────
async function initAdmin() {
  await Promise.all([loadStats(), loadOrders(), loadRefundRequests(), loadReviews(), loadProducts(), loadCollections(), loadSettings()]);
}

function authHeaders() {
  return { 'Content-Type': 'application/json', 'x-admin-password': adminPassword };
}

// ─── TABS ─────────────────────────────────────────────────────────────────────
function switchTab(name) {
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('tab-' + name).classList.add('active');
  document.querySelector(`[data-tab="${name}"]`).classList.add('active');
  document.getElementById('pageTitle').textContent =
    { dashboard: 'Dashboard', products: 'Products', orders: 'Orders', refunds: 'Refunds', reviews: 'Reviews', collections: 'Collections', settings: 'Settings' }[name];
  if (window.innerWidth <= 768) closeSidebar();
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
}

// ─── STATS ───────────────────────────────────────────────────────────────────
async function loadStats() {
  try {
    const res = await fetch('/api/admin/stats', { headers: authHeaders() });
    const s = await res.json();
    document.getElementById('s-total').textContent = s.totalOrders;
    document.getElementById('s-new').textContent = s.newOrders;
    document.getElementById('s-today').textContent = s.todayOrders;
    document.getElementById('s-products').textContent = s.totalProducts;
    document.getElementById('heroOrdersBadge').textContent = s.totalOrders;
    document.getElementById('heroRevenueBadge').textContent = formatMoney(s.revenue || 0, currentConfig.currency || 'BYN');
    if (s.newOrders > 0) {
      const badge = document.getElementById('newOrderBadge');
      badge.textContent = s.newOrders;
      badge.style.display = 'flex';
    } else {
      document.getElementById('newOrderBadge').style.display = 'none';
    }
  } catch {}
}

// ─── ORDERS ──────────────────────────────────────────────────────────────────
async function loadOrders() {
  try {
    const res = await fetch('/api/admin/orders', { headers: authHeaders() });
    allOrders = await res.json();
    renderOrders(allOrders);
    renderRecentOrders(allOrders.slice(0, 5));
    renderAnalytics();
  } catch {}
}

async function loadRefundRequests() {
  try {
    const res = await fetch('/api/admin/refund-requests', { headers: authHeaders() });
    allRefundRequests = await res.json();
    renderRefundRequests(allRefundRequests);
    const newRefunds = allRefundRequests.filter(request => request.status === 'new').length;
    const badge = document.getElementById('newRefundBadge');
    if (newRefunds > 0) {
      badge.textContent = newRefunds;
      badge.style.display = 'flex';
    } else {
      badge.style.display = 'none';
    }
  } catch {}
}

async function loadReviews() {
  try {
    const res = await fetch('/api/admin/reviews', { headers: authHeaders() });
    allReviews = await res.json();
    renderReviews(allReviews);
    const pendingReviews = allReviews.filter(review => review.status === 'pending').length;
    const badge = document.getElementById('pendingReviewBadge');
    if (pendingReviews > 0) {
      badge.textContent = pendingReviews;
      badge.style.display = 'flex';
    } else {
      badge.style.display = 'none';
    }
  } catch {}
}

function filterOrders() {
  const f = document.getElementById('orderFilter').value;
  const filtered = f === 'all' ? allOrders : allOrders.filter(o => o.status === f);
  renderOrders(filtered);
}

function renderOrders(orders) {
  const tbody = document.getElementById('ordersBody');
  if (!orders.length) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:40px;color:#bbb">No orders found</td></tr>`;
    return;
  }
  tbody.innerHTML = orders.map(o => {
    const d = new Date(o.createdAt);
    const dateStr = d.toLocaleDateString('en-GB') + ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    return `
    <tr>
      <td class="order-name">${esc(o.name)}${o.orderType === 'consultation' ? ' <span class="visibility-badge" style="background:#e0f2fe;color:#075985;margin-left:6px">Consultation</span>' : ''}</td>
      <td class="order-phone">${esc(o.phone)}</td>
      <td class="order-product" title="${esc(buildOrderProductLabel(o))}">${esc(buildOrderProductLabel(o) || '—')}</td>
      <td class="order-price">${(o.price || 0).toLocaleString()} ${currentConfig.currency || 'BYN'}</td>
      <td class="order-date">${dateStr}</td>
      <td><span class="status-badge status-${o.status}">${o.status}</span></td>
      <td>
        <div class="order-actions">
          <select onchange="updateOrderStatus('${o.id}', this.value)" title="Change status">
            <option value="">Change…</option>
            <option value="new" ${o.status==='new'?'selected':''}>New</option>
            <option value="confirmed" ${o.status==='confirmed'?'selected':''}>Confirmed</option>
            <option value="delivered" ${o.status==='delivered'?'selected':''}>Delivered</option>
            <option value="cancelled" ${o.status==='cancelled'?'selected':''}>Cancelled</option>
            <option value="refunded" ${o.status==='refunded'?'selected':''}>Refunded</option>
          </select>
          ${o.status !== 'refunded' && o.status !== 'cancelled' && o.orderType !== 'consultation' ? `<button class="btn-refund" onclick="issueRefund('${o.id}')">Refund</button>` : ''}
          <button class="btn-danger" onclick="deleteOrder('${o.id}')">Delete</button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

function filterRefundRequests() {
  const filter = document.getElementById('refundFilter').value;
  const filtered = filter === 'all'
    ? allRefundRequests
    : allRefundRequests.filter(request => request.status === filter);
  renderRefundRequests(filtered);
}

function renderRefundRequests(requests) {
  const tbody = document.getElementById('refundsBody');
  if (!tbody) return;

  if (!requests.length) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:40px;color:#bbb">No refund requests found</td></tr>`;
    return;
  }

  tbody.innerHTML = requests.map(request => {
    const d = new Date(request.createdAt);
    const dateStr = d.toLocaleDateString('en-GB') + ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    const requestLabel = [
      request.requestType || 'refund',
      request.reason,
      request.orderReference ? `Order: ${request.orderReference}` : '',
      request.deliveryService ? `Delivery: ${request.deliveryService}` : ''
    ].filter(Boolean).join(' · ');

    return `
      <tr>
        <td class="order-name">${esc(request.name)}</td>
        <td class="order-phone">${esc(request.phone)}</td>
        <td class="order-product" title="${esc(request.details)}">${esc(request.productName)}</td>
        <td class="order-product" title="${esc(request.details)}">${esc(requestLabel)}</td>
        <td class="order-date">${dateStr}</td>
        <td><span class="status-badge status-${request.status}">${request.status}</span></td>
        <td>
          <div class="order-actions">
            <select onchange="updateRefundStatus('${request.id}', this.value)" title="Change status">
              <option value="">Change…</option>
              <option value="new" ${request.status === 'new' ? 'selected' : ''}>New</option>
              <option value="in_review" ${request.status === 'in_review' ? 'selected' : ''}>In Review</option>
              <option value="resolved" ${request.status === 'resolved' ? 'selected' : ''}>Resolved</option>
              <option value="rejected" ${request.status === 'rejected' ? 'selected' : ''}>Rejected</option>
            </select>
            <button class="btn-danger" onclick="deleteRefundRequest('${request.id}')">Delete</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function filterReviews() {
  const filter = document.getElementById('reviewFilter').value;
  const filtered = filter === 'all'
    ? allReviews
    : allReviews.filter(review => review.status === filter);
  renderReviews(filtered);
}

function renderReviews(reviews) {
  const tbody = document.getElementById('reviewsBody');
  if (!tbody) return;

  if (!reviews.length) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:40px;color:#bbb">No reviews found</td></tr>`;
    return;
  }

  tbody.innerHTML = reviews.map(review => {
    const d = new Date(review.createdAt);
    const dateStr = d.toLocaleDateString('en-GB') + ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    const stars = '★'.repeat(Math.max(1, Math.min(5, Number(review.rating) || 0)));
    const reviewText = review.image
      ? `${stars} · ${review.text} · photo attached`
      : `${stars} · ${review.text}`;

    return `
      <tr>
        <td class="order-name">${esc(review.name)}</td>
        <td class="order-phone">${esc(review.phone)}</td>
        <td class="order-product">${esc(review.productName)}</td>
        <td class="order-product" title="${esc(review.text)}">
          ${esc(reviewText)}
          ${review.image ? `<div style="margin-top:8px"><img src="${escAttr(review.image)}" alt="Review photo" style="width:52px;height:52px;border-radius:10px;object-fit:cover;border:1px solid #e5e7eb" /></div>` : ''}
        </td>
        <td class="order-date">${dateStr}</td>
        <td><span class="status-badge status-${review.status}">${review.status}</span></td>
        <td>
          <div class="order-actions">
            <select onchange="updateReviewStatus('${review.id}', this.value)" title="Change status">
              <option value="">Change…</option>
              <option value="pending" ${review.status === 'pending' ? 'selected' : ''}>Pending</option>
              <option value="approved" ${review.status === 'approved' ? 'selected' : ''}>Approved</option>
              <option value="rejected" ${review.status === 'rejected' ? 'selected' : ''}>Rejected</option>
            </select>
            <button class="btn-danger" onclick="deleteReview('${review.id}')">Delete</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

async function updateOrderStatus(id, status) {
  if (!status) return;
  await fetch(`/api/admin/orders/${id}`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify({ status })
  });
  await loadOrders();
  await loadStats();
  showToast('Order updated!', 'success');
}

async function deleteOrder(id) {
  if (!confirm('Delete this order?')) return;
  await fetch(`/api/admin/orders/${id}`, { method: 'DELETE', headers: authHeaders() });
  await loadOrders();
  await loadStats();
  showToast('Order deleted.', 'success');
}

async function issueRefund(orderId) {
  const order = allOrders.find(o => o.id === orderId);
  if (!order) return;
  const amount = order.price || 0;
  const currency = currentConfig.currency || 'BYN';
  if (!confirm(`Issue cash refund for "${order.productName || 'order'}"?\nAmount: ${amount} ${currency}\nClient: ${order.name} · ${order.phone}`)) return;

  try {
    const res = await fetch(`/api/admin/orders/${orderId}/refund`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ amount, currency })
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      throw new Error(d.error || 'Refund failed');
    }
    await loadOrders();
    await loadRefundRequests();
    await loadStats();
    showToast(`Refund of ${amount} ${currency} issued for ${order.name}`, 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function updateRefundStatus(id, status) {
  if (!status) return;
  await fetch(`/api/admin/refund-requests/${id}`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify({ status })
  });
  await loadRefundRequests();
  showToast('Refund request updated!', 'success');
}

async function deleteRefundRequest(id) {
  if (!confirm('Delete this refund request?')) return;
  await fetch(`/api/admin/refund-requests/${id}`, { method: 'DELETE', headers: authHeaders() });
  await loadRefundRequests();
  showToast('Refund request deleted.', 'success');
}

async function updateReviewStatus(id, status) {
  if (!status) return;
  await fetch(`/api/admin/reviews/${id}`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify({ status })
  });
  await loadReviews();
  showToast('Review updated!', 'success');
}

async function deleteReview(id) {
  if (!confirm('Delete this review?')) return;
  await fetch(`/api/admin/reviews/${id}`, { method: 'DELETE', headers: authHeaders() });
  await loadReviews();
  showToast('Review deleted.', 'success');
}

function renderRecentOrders(orders) {
  const el = document.getElementById('recentOrdersList');
  if (!orders.length) {
    el.innerHTML = '<p style="padding:24px;text-align:center;color:#bbb">No orders yet.</p>';
    return;
  }
  el.innerHTML = orders.map(o => {
    const mins = Math.round((Date.now() - new Date(o.createdAt)) / 60000);
    const timeAgo = mins < 60 ? `${mins}m ago` : mins < 1440 ? `${Math.round(mins/60)}h ago` : `${Math.round(mins/1440)}d ago`;
    return `
    <div class="recent-order-row">
      <div class="recent-avatar">${o.name.charAt(0).toUpperCase()}</div>
      <div class="recent-info">
        <div class="recent-name">${esc(o.name)}${o.orderType === 'consultation' ? ' · <span style="font-size:12px;color:#1a9fe0;font-weight:700">consultation</span>' : ''} · <span style="font-size:12px;color:#aaa">${esc(o.phone)}</span></div>
        <div class="recent-product">${esc(buildOrderProductLabel(o) || '—')}</div>
      </div>
      <div class="recent-right">
        <div class="recent-price">${(o.price || 0).toLocaleString()} ${currentConfig.currency || 'BYN'}</div>
        <div class="recent-time">${timeAgo}</div>
      </div>
      <span class="status-badge status-${o.status}">${o.status}</span>
    </div>`;
  }).join('');
}

// ─── PRODUCTS ─────────────────────────────────────────────────────────────────
async function loadProducts() {
  try {
    const res = await fetch('/api/admin/products', { headers: authHeaders() });
    allProducts = await res.json();
    renderAdminProducts(allProducts);
    renderAnalytics();
  } catch {}
}

function renderAdminProducts(products) {
  const grid = document.getElementById('adminProductsGrid');
  if (!products.length) {
    grid.innerHTML = `<div class="empty-state"><span>📦</span><p>No products yet. Add your first!</p></div>`;
    return;
  }
  grid.innerHTML = products.map(p => `
    <div class="admin-product-card">
      <img class="prod-img" src="${p.image || ''}" alt="${esc(p.name)}"
        onerror="this.src='https://via.placeholder.com/400x250?text=No+Image'" />
      <div class="admin-product-body">
        <div class="admin-product-name">${esc(p.name)}</div>
        <div class="admin-product-meta">
          ${p.collection || 'No collection'} ·
          <span class="visibility-badge ${p.visible ? 'visible-yes' : 'visible-no'}">${p.visible ? 'Visible' : 'Hidden'}</span>
          ${p.badge ? `<span class="visibility-badge" style="background:#fef3c7;color:#92400e">${p.badge}</span>` : ''}
          ${Array.isArray(p.variants) && p.variants.length ? `<span class="visibility-badge" style="background:#ede9fe;color:#6d28d9">${p.variants.length} variant${p.variants.length > 1 ? 's' : ''}</span>` : ''}
          ${Array.isArray(p.storyBlocks) && p.storyBlocks.length ? `<span class="visibility-badge" style="background:#e0f2fe;color:#075985">${p.storyBlocks.length} LP block${p.storyBlocks.length > 1 ? 's' : ''}</span>` : ''}
        </div>
        <div class="admin-product-price">${(p.price || 0).toLocaleString()} ${currentConfig.currency || 'BYN'} ${p.oldPrice ? `<span style="font-size:12px;color:#bbb;font-weight:400;text-decoration:line-through">${p.oldPrice.toLocaleString()} ${currentConfig.currency || 'BYN'}</span>` : ''}</div>
        <div class="admin-product-actions">
          <button class="btn-primary" style="font-size:12px;padding:7px 14px" onclick="openProductModal('${p.id}')">Edit</button>
          <button class="btn-danger" onclick="deleteProduct('${p.id}')">Delete</button>
          <button class="btn-secondary" style="font-size:12px;padding:7px 10px" onclick="toggleVisible('${p.id}', ${!p.visible})">${p.visible ? 'Hide' : 'Show'}</button>
        </div>
      </div>
    </div>
  `).join('');
}

function openProductModal(editId = null) {
  currentEditId = editId;
  const modal = document.getElementById('productModalOverlay');
  const form = document.getElementById('productForm');
  form.reset();
  document.getElementById('imagePreviewWrap').style.display = 'none';
  uploadedImageData = '';
  currentVariantDraft = [];
  currentStoryImages = [];
  renderVariantBuilder();
  resetStoryEditor();

  // Populate collection dropdown
  const sel = document.getElementById('pCollection');
  sel.innerHTML = '<option value="">Select collection</option>' +
    allCollections.filter(c => c.slug !== 'all').map(c => `<option value="${c.slug}">${c.name}</option>`).join('');

  if (editId) {
    const p = allProducts.find(x => x.id === editId);
    if (!p) return;
    document.getElementById('productModalTitle').textContent = 'Edit Product';
    document.getElementById('pName').value = p.name || '';
    document.getElementById('pDesc').value = p.description || '';
    document.getElementById('pPrice').value = p.price || '';
    document.getElementById('pOldPrice').value = p.oldPrice || '';
    document.getElementById('pCollection').value = p.collection || '';
    document.getElementById('pBadge').value = p.badge || '';
    document.getElementById('pVisible').value = String(p.visible !== false);
    document.getElementById('pImage').value = p.image || '';
    if (p.image) {
      uploadedImageData = p.image;
      showImagePreview(p.image);
    }
    currentVariantDraft = normalizeVariants(p.variants);
    hydrateStoryEditor(p.storyBlocks);
    renderVariantBuilder();
  } else {
    document.getElementById('productModalTitle').textContent = 'Add Product';
  }

  modal.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeProductModal() {
  document.getElementById('productModalOverlay').classList.remove('open');
  document.body.style.overflow = '';
  currentEditId = null;
}

document.getElementById('pImage').addEventListener('input', function() {
  uploadedImageData = this.value.trim();
  showImagePreview(this.value);
});

document.getElementById('pImageFile').addEventListener('change', async function() {
  this.value = '';
  showToast('File upload not supported. Upload your image to imgur.com and paste the URL in the Image URL field.', 'error');
});

document.getElementById('storyImageFiles').addEventListener('change', async function() {
  const files = Array.from(this.files || []);
  if (!files.length) return;

  try {
    for (const file of files) {
      if (!file.type.startsWith('image/')) {
        showToast('Please choose image files only.', 'error');
        continue;
      }
      const image = await readFileAsDataURL(file);
      currentStoryImages.push(image);
    }
    this.value = '';
    syncStoryImageUrlsField();
    renderStoryImagesPreview();
    showToast('Landing images added.', 'success');
  } catch {
    showToast('Could not read one of the landing images.', 'error');
  }
});

document.getElementById('storyImageUrls').addEventListener('input', function() {
  currentStoryImages = this.value
    .split('\n')
    .map(item => item.trim())
    .filter(Boolean);
  renderStoryImagesPreview();
});

function showImagePreview(url) {
  const wrap = document.getElementById('imagePreviewWrap');
  const img = document.getElementById('imagePreview');
  if (url) { img.src = url; wrap.style.display = 'block'; }
  else { wrap.style.display = 'none'; }
}

async function saveProduct(e) {
  e.preventDefault();
  const btn = document.getElementById('saveProductBtn');
  btn.disabled = true;

  const data = {
    name: document.getElementById('pName').value.trim(),
    description: document.getElementById('pDesc').value.trim(),
    price: Number(document.getElementById('pPrice').value),
    oldPrice: Number(document.getElementById('pOldPrice').value) || null,
    collection: document.getElementById('pCollection').value,
    badge: document.getElementById('pBadge').value,
    visible: document.getElementById('pVisible').value === 'true',
    image: uploadedImageData || document.getElementById('pImage').value.trim(),
    variants: collectVariantsFromBuilder(),
    storyBlocks: collectStoryBlocksFromEditor()
  };

  try {
    const url = currentEditId ? `/api/admin/products/${currentEditId}` : '/api/admin/products';
    const method = currentEditId ? 'PUT' : 'POST';
    const res = await fetch(url, {
      method,
      headers: authHeaders(),
      body: JSON.stringify(data)
    });
    const payload = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(payload.error || 'Error saving product.');
    }

    if (currentEditId) {
      showToast('Product updated!', 'success');
    } else {
      showToast('Product added!', 'success');
    }
    closeProductModal();
    await loadProducts();
    await loadStats();
  } catch (error) {
    showToast(error.message || 'Error saving product.', 'error');
  } finally {
    btn.disabled = false;
  }
}

async function deleteProduct(id) {
  if (!confirm('Delete this product? This cannot be undone.')) return;
  await fetch(`/api/admin/products/${id}`, { method: 'DELETE', headers: authHeaders() });
  await loadProducts();
  await loadStats();
  showToast('Product deleted.', 'success');
}

async function toggleVisible(id, visible) {
  await fetch(`/api/admin/products/${id}`, {
    method: 'PUT', headers: authHeaders(), body: JSON.stringify({ visible })
  });
  await loadProducts();
  showToast(visible ? 'Product is now visible.' : 'Product hidden.', 'success');
}

// ─── COLLECTIONS ─────────────────────────────────────────────────────────────
async function loadCollections() {
  try {
    const res = await fetch('/api/admin/collections', { headers: authHeaders() });
    allCollections = await res.json();
    renderAdminCollections(allCollections);
  } catch {}
}

function renderAdminCollections(cols) {
  const grid = document.getElementById('collectionsAdminGrid');
  grid.innerHTML = cols.map(c => `
    <div class="collection-card">
      <div class="collection-icon">${c.icon || '📁'}</div>
      <div class="collection-name">${esc(c.name)}</div>
      <div class="collection-slug">#${c.slug}</div>
      ${c.slug !== 'all' ? `<button class="collection-del" onclick="deleteCollection('${c.id}')" title="Delete">✕</button>` : ''}
    </div>
  `).join('');
}

function openCollectionModal() {
  document.getElementById('collectionModalOverlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeCollectionModal() {
  document.getElementById('collectionModalOverlay').classList.remove('open');
  document.body.style.overflow = '';
}

async function saveCollection(e) {
  e.preventDefault();
  const data = {
    name: document.getElementById('cName').value.trim(),
    slug: document.getElementById('cSlug').value.trim().toLowerCase().replace(/\s+/g, '-'),
    icon: document.getElementById('cIcon').value.trim()
  };
  await fetch('/api/admin/collections', {
    method: 'POST', headers: authHeaders(), body: JSON.stringify(data)
  });
  closeCollectionModal();
  await loadCollections();
  showToast('Collection added!', 'success');
}

async function deleteCollection(id) {
  if (!confirm('Delete this collection?')) return;
  await fetch(`/api/admin/collections/${id}`, { method: 'DELETE', headers: authHeaders() });
  await loadCollections();
  showToast('Collection deleted.', 'success');
}

// ─── SETTINGS ─────────────────────────────────────────────────────────────────
async function loadSettings() {
  try {
    const res = await fetch('/api/admin/config', { headers: authHeaders() });
    const cfg = await res.json();
    currentConfig = cfg || {};
    document.getElementById('cfg-storeName').value = cfg.storeName || '';
    document.getElementById('cfg-currency').value = cfg.currency || '';
    document.getElementById('cfg-tagline').value = cfg.tagline || '';
    document.getElementById('cfg-whatsapp').value = cfg.whatsapp || '';
    document.getElementById('cfg-heroTitle').value = cfg.heroTitle || '';
    document.getElementById('cfg-heroSubtitle').value = cfg.heroSubtitle || '';
    renderAnalytics();
  } catch {}
}

async function saveSettings() {
  const data = {
    storeName: document.getElementById('cfg-storeName').value.trim(),
    currency: document.getElementById('cfg-currency').value.trim(),
    tagline: document.getElementById('cfg-tagline').value.trim(),
    whatsapp: document.getElementById('cfg-whatsapp').value.trim(),
    heroTitle: document.getElementById('cfg-heroTitle').value.trim(),
    heroSubtitle: document.getElementById('cfg-heroSubtitle').value.trim()
  };
  const newPw = document.getElementById('cfg-adminPassword').value;
  if (newPw) data.adminPassword = newPw;

  await fetch('/api/admin/config', {
    method: 'PUT', headers: authHeaders(), body: JSON.stringify(data)
  });
  currentConfig = { ...currentConfig, ...data };
  if (newPw) adminPassword = newPw;
  renderAnalytics();
  showToast('Settings saved!', 'success');
}

// ─── ANALYTICS ───────────────────────────────────────────────────────────────
function renderAnalytics() {
  renderOverviewAnalytics();
  renderTrendChart();
  renderTopProducts();
  renderMomentumCards();
}

function renderOverviewAnalytics() {
  const currency = currentConfig.currency || 'BYN';
  const totalOrders = allOrders.length;
  const deliveredOrders = allOrders.filter(order => order.status === 'delivered');
  const confirmedOrders = allOrders.filter(order => order.status === 'confirmed');
  const cancelledOrders = allOrders.filter(order => order.status === 'cancelled');
  const totalRevenue = deliveredOrders.reduce((sum, order) => sum + Number(order.price || 0), 0);
  const totalOrderValue = allOrders.reduce((sum, order) => sum + Number(order.price || 0), 0);
  const averageOrderValue = totalOrders ? Math.round(totalOrderValue / totalOrders) : 0;
  const topProduct = getTopProducts(1)[0];

  document.getElementById('a-revenue').textContent = formatMoney(totalRevenue, currency);
  document.getElementById('a-revenue-note').textContent = deliveredOrders.length
    ? `${deliveredOrders.length} delivered ${deliveredOrders.length === 1 ? 'order' : 'orders'}`
    : 'No delivered orders yet';

  document.getElementById('a-average').textContent = formatMoney(averageOrderValue, currency);
  document.getElementById('a-average-note').textContent = totalOrders
    ? `Based on ${totalOrders} total ${totalOrders === 1 ? 'order' : 'orders'}`
    : 'Calculated from all orders';

  document.getElementById('a-top-product').textContent = topProduct ? topProduct.name : 'No data yet';
  document.getElementById('a-top-product-note').textContent = topProduct
    ? `${topProduct.count} ${topProduct.count === 1 ? 'order' : 'orders'} • ${formatMoney(topProduct.revenue, currency)} potential`
    : 'Will update as orders come in';

  const deliveredPct = totalOrders ? Math.round((deliveredOrders.length / totalOrders) * 100) : 0;
  const confirmedPct = totalOrders ? Math.round((confirmedOrders.length / totalOrders) * 100) : 0;
  const cancelledPct = totalOrders ? Math.round((cancelledOrders.length / totalOrders) * 100) : 0;

  setProgressValue('a-delivered', deliveredPct);
  setProgressValue('a-confirmed', confirmedPct);
  setProgressValue('a-cancelled', cancelledPct);

  const qualitySummary = totalOrders
    ? cancelledPct <= 15
      ? 'Healthy order quality with low cancellation pressure'
      : 'Watch cancellations and follow up faster on new leads'
    : 'Waiting for more sales data';
  document.getElementById('a-quality-summary').textContent = qualitySummary;
}

function renderTrendChart() {
  const chart = document.getElementById('trendChart');
  const days = getLast7DaysData();
  const maxValue = Math.max(...days.map(day => day.count), 1);

  chart.innerHTML = days.map(day => {
    const height = Math.max(10, Math.round((day.count / maxValue) * 100));
    return `
      <div class="trend-bar-wrap">
        <div class="trend-bar-value">${day.count}</div>
        <div class="trend-bar-track">
          <div class="trend-bar-fill" style="height:${height}%"></div>
        </div>
        <div class="trend-bar-label">${day.label}</div>
      </div>
    `;
  }).join('');
}

function renderTopProducts() {
  const list = document.getElementById('topProductsList');
  const currency = currentConfig.currency || 'BYN';
  const topProducts = getTopProducts(5);

  if (!topProducts.length) {
    list.innerHTML = '<div class="empty-state" style="box-shadow:none;border-radius:0;padding:40px 0"><span>📈</span><p>Your best sellers will appear after the first orders.</p></div>';
    return;
  }

  list.innerHTML = topProducts.map(item => `
    <div class="analytics-list-row">
      <div>
        <div class="analytics-list-name">${esc(item.name)}</div>
        <div class="analytics-list-meta">${item.delivered} delivered • ${item.pending} still in progress</div>
      </div>
      <div class="analytics-list-value">
        <strong>${item.count} ${item.count === 1 ? 'order' : 'orders'}</strong>
        <span>${formatMoney(item.revenue, currency)} total value</span>
      </div>
    </div>
  `).join('');
}

function renderMomentumCards() {
  const now = new Date();
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(now.getDate() - 6);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const visibleProducts = allProducts.filter(product => product.visible !== false).length;
  const last7 = allOrders.filter(order => new Date(order.createdAt) >= startOfDay(sevenDaysAgo)).length;
  const thisMonth = allOrders.filter(order => new Date(order.createdAt) >= monthStart).length;
  const newShare = allOrders.length
    ? Math.round((allOrders.filter(order => order.status === 'new').length / allOrders.length) * 100)
    : 0;

  document.getElementById('a-last7').textContent = `${last7} ${last7 === 1 ? 'order' : 'orders'}`;
  document.getElementById('a-this-month').textContent = `${thisMonth} ${thisMonth === 1 ? 'order' : 'orders'}`;
  document.getElementById('a-visible-products').textContent = `${visibleProducts} ${visibleProducts === 1 ? 'item' : 'items'}`;
  document.getElementById('a-new-share').textContent = `${newShare}%`;
}

function getTopProducts(limit = 5) {
  const byProduct = new Map();

  for (const order of allOrders) {
    const key = order.productId || order.productName || 'unknown';
    const existing = byProduct.get(key) || {
      name: order.productName || 'Unknown product',
      count: 0,
      revenue: 0,
      delivered: 0,
      pending: 0
    };

    existing.count += 1;
    existing.revenue += Number(order.price || 0);
    if (order.status === 'delivered') existing.delivered += 1;
    if (order.status === 'new' || order.status === 'confirmed') existing.pending += 1;
    byProduct.set(key, existing);
  }

  return Array.from(byProduct.values())
    .sort((a, b) => (b.count - a.count) || (b.revenue - a.revenue))
    .slice(0, limit);
}

function getLast7DaysData() {
  const formatter = new Intl.DateTimeFormat('en-US', { weekday: 'short' });
  const today = new Date();
  const days = [];

  for (let offset = 6; offset >= 0; offset -= 1) {
    const date = new Date(today);
    date.setDate(today.getDate() - offset);
    const dayStart = startOfDay(date);
    const nextDay = new Date(dayStart);
    nextDay.setDate(dayStart.getDate() + 1);

    const count = allOrders.filter(order => {
      const createdAt = new Date(order.createdAt);
      return createdAt >= dayStart && createdAt < nextDay;
    }).length;

    days.push({ label: formatter.format(date), count });
  }

  return days;
}

function setProgressValue(prefix, value) {
  document.getElementById(`${prefix}-pct`).textContent = `${value}%`;
  document.getElementById(`${prefix}-bar`).style.width = `${value}%`;
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function formatMoney(value, currency) {
  return `${Number(value || 0).toLocaleString()} ${currency}`;
}

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function addVariantGroup() {
  currentVariantDraft.push({ name: '', values: '' });
  renderVariantBuilder();
}

function removeVariantGroup(index) {
  currentVariantDraft.splice(index, 1);
  renderVariantBuilder();
}

function updateVariantField(index, field, value) {
  if (!currentVariantDraft[index]) return;
  currentVariantDraft[index][field] = value;
}

function renderVariantBuilder() {
  const wrap = document.getElementById('variantsBuilder');
  if (!wrap) return;

  if (!currentVariantDraft.length) {
    wrap.innerHTML = '<p class="field-hint" style="margin-top:0">No variants added yet. Leave this empty for simple products.</p>';
    return;
  }

  wrap.innerHTML = currentVariantDraft.map((variant, index) => `
    <div class="variant-group">
      <div class="variant-group-head">
        <span class="variant-group-title">Variant ${index + 1}</span>
        <button type="button" class="btn-danger" onclick="removeVariantGroup(${index})">Remove</button>
      </div>
      <div class="form-row">
        <div class="form-group" style="margin-bottom:0">
          <label>Option Name</label>
          <input type="text" value="${escAttr(variant.name || '')}" placeholder="Color, Size, Model"
            oninput="updateVariantField(${index}, 'name', this.value)" />
        </div>
        <div class="form-group" style="margin-bottom:0">
          <label>Choices</label>
          <input type="text" value="${escAttr(variant.values || '')}" placeholder="Black, White, XL"
            oninput="updateVariantField(${index}, 'values', this.value)" />
        </div>
      </div>
    </div>
  `).join('');
}

function collectVariantsFromBuilder() {
  return currentVariantDraft
    .map(variant => ({
      name: String(variant.name || '').trim(),
      values: String(variant.values || '')
        .split(',')
        .map(value => value.trim())
        .filter(Boolean)
    }))
    .filter(variant => variant.name && variant.values.length);
}

function normalizeVariants(variants) {
  if (!Array.isArray(variants)) return [];
  return variants.map(variant => ({
    name: variant.name || '',
    values: Array.isArray(variant.values) ? variant.values.join(', ') : ''
  }));
}

function resetStoryEditor() {
  document.getElementById('storyContentText').value = '';
  document.getElementById('storyImageUrls').value = '';
  document.getElementById('storyImageFiles').value = '';
  renderStoryImagesPreview();
}

function hydrateStoryEditor(blocks) {
  const normalized = Array.isArray(blocks) ? blocks : [];
  document.getElementById('storyContentText').value = normalized.map(block => {
    const parts = [];
    if (block.label) parts.push(`Label: ${block.label}`);
    if (block.title) parts.push(`Title: ${block.title}`);
    if (block.text) parts.push(`Text: ${block.text}`);
    return parts.join('\n');
  }).filter(Boolean).join('\n\n');

  currentStoryImages = normalized.map(block => String(block.image || '').trim()).filter(Boolean);
  syncStoryImageUrlsField();
  renderStoryImagesPreview();
}

function syncStoryImageUrlsField() {
  const field = document.getElementById('storyImageUrls');
  field.value = currentStoryImages.join('\n');
}

function renderStoryImagesPreview() {
  const wrap = document.getElementById('storyImagesPreview');
  if (!wrap) return;
  if (!currentStoryImages.length) {
    wrap.innerHTML = '';
    return;
  }

  wrap.innerHTML = currentStoryImages.map((image, index) => `
    <div style="position:relative">
      <img src="${escAttr(image)}" alt="Landing ${index + 1}" style="width:100%;height:96px;object-fit:cover;border-radius:10px;border:1px solid #e5e7eb" />
      <button type="button" class="btn-danger" style="position:absolute;top:6px;right:6px;padding:4px 8px;font-size:11px" onclick="removeStoryImage(${index})">Remove</button>
    </div>
  `).join('');
}

function removeStoryImage(index) {
  currentStoryImages.splice(index, 1);
  syncStoryImageUrlsField();
  renderStoryImagesPreview();
}

function collectStoryBlocksFromEditor() {
  const raw = document.getElementById('storyContentText').value.trim();
  if (!raw && !currentStoryImages.length) return [];

  const sections = raw
    .split(/\n\s*\n+/)
    .map(section => section.trim())
    .filter(Boolean)
    .map((section, index) => {
      const lines = section.split('\n').map(line => line.trim()).filter(Boolean);
      let label = '';
      let title = '';
      const textParts = [];

      for (const line of lines) {
        if (/^label\s*:/i.test(line)) {
          label = line.replace(/^label\s*:/i, '').trim();
        } else if (/^title\s*:/i.test(line)) {
          title = line.replace(/^title\s*:/i, '').trim();
        } else if (/^text\s*:/i.test(line)) {
          textParts.push(line.replace(/^text\s*:/i, '').trim());
        } else {
          textParts.push(line);
        }
      }

      return {
        label,
        title,
        text: textParts.join('\n').trim(),
        image: currentStoryImages[index] || ''
      };
    });

  const imageOnlyBlocks = currentStoryImages.slice(sections.length).map(image => ({
    label: '',
    title: '',
    text: '',
    image
  }));

  return [...sections, ...imageOnlyBlocks].filter(block => block.title || block.text || block.image);
}

function escAttr(str) {
  return esc(str).replace(/'/g, '&#39;');
}

function buildOrderProductLabel(order) {
  const base = order.productName || '—';
  return order.variantLabel ? `${base} (${order.variantLabel})` : base;
}

// ─── TOAST ────────────────────────────────────────────────────────────────────
function showToast(msg, type = '') {
  const toast = document.getElementById('adminToast');
  toast.textContent = msg;
  toast.className = 'toast show' + (type ? ' ' + type : '');
  setTimeout(() => { toast.classList.remove('show'); }, 2800);
}

// ─── UTILS ────────────────────────────────────────────────────────────────────
function esc(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// Keyboard shortcuts
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeProductModal();
    closeCollectionModal();
  }
});
