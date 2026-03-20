// ─── STATE ──────────────────────────────────────────────────────────────────
let adminPassword = '';
let allOrders = [];
let allProducts = [];
let allCollections = [];
let currentEditId = null;

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
    document.getElementById('cfg-storeName').value = cfg.storeName || '';
    document.getElementById('cfg-currency').value = cfg.currency || '';
    document.getElementById('cfg-tagline').value = cfg.tagline || '';
    document.getElementById('cfg-whatsapp').value = cfg.whatsapp || '';
    document.getElementById('cfg-heroTitle').value = cfg.heroTitle || '';
    document.getElementById('cfg-heroSubtitle').value = cfg.heroSubtitle || '';
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
  if (newPw) adminPassword = newPw;
  showToast('Settings saved!', 'success');
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
