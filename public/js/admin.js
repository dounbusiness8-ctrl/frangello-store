// ─── STATE ──────────────────────────────────────────────────────────────────
let adminPassword = '';
let allOrders = [];
let allProducts = [];
let allCollections = [];
let currentEditId = null;
let currentConfig = {};

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
  await Promise.all([loadStats(), loadOrders(), loadProducts(), loadCollections(), loadSettings()]);
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
    { dashboard: 'Dashboard', products: 'Products', orders: 'Orders', collections: 'Collections', settings: 'Settings' }[name];
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
      <td class="order-name">${esc(o.name)}</td>
      <td class="order-phone">${esc(o.phone)}</td>
      <td class="order-product" title="${esc(o.productName || '')}">${esc(o.productName || '—')}</td>
      <td class="order-price">${(o.price || 0).toLocaleString()} DA</td>
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
          </select>
          <button class="btn-danger" onclick="deleteOrder('${o.id}')">Delete</button>
        </div>
      </td>
    </tr>`;
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
        <div class="recent-name">${esc(o.name)} · <span style="font-size:12px;color:#aaa">${esc(o.phone)}</span></div>
        <div class="recent-product">${esc(o.productName || '—')}</div>
      </div>
      <div class="recent-right">
        <div class="recent-price">${(o.price || 0).toLocaleString()} DA</div>
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
        </div>
        <div class="admin-product-price">${(p.price || 0).toLocaleString()} DA ${p.oldPrice ? `<span style="font-size:12px;color:#bbb;font-weight:400;text-decoration:line-through">${p.oldPrice.toLocaleString()} DA</span>` : ''}</div>
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
    if (p.image) showImagePreview(p.image);
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
  showImagePreview(this.value);
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
    image: document.getElementById('pImage').value.trim()
  };

  try {
    if (currentEditId) {
      await fetch(`/api/admin/products/${currentEditId}`, {
        method: 'PUT', headers: authHeaders(), body: JSON.stringify(data)
      });
      showToast('Product updated!', 'success');
    } else {
      await fetch('/api/admin/products', {
        method: 'POST', headers: authHeaders(), body: JSON.stringify(data)
      });
      showToast('Product added!', 'success');
    }
    closeProductModal();
    await loadProducts();
    await loadStats();
  } catch {
    showToast('Error saving product.', 'error');
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
  const currency = currentConfig.currency || 'DA';
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
  const currency = currentConfig.currency || 'DA';
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
