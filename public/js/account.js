let accountMode = 'login';

async function parseApiResponse(res) {
  const raw = await res.text();
  let data = {};
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    data = { error: raw || 'Request failed' };
  }
  return { ok: res.ok, status: res.status, data };
}

function showAccountToast(message) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2800);
}

function switchAccountMode(mode) {
  accountMode = mode;
  document.getElementById('loginForm').classList.toggle('hidden', mode !== 'login');
  document.getElementById('registerForm').classList.toggle('hidden', mode !== 'register');
  document.getElementById('loginTabBtn').classList.toggle('active', mode === 'login');
  document.getElementById('registerTabBtn').classList.toggle('active', mode === 'register');
}

function validateAccountInput(name, phone, password, withName = false) {
  const cleanName = String(name || '').replace(/\s+/g, ' ').trim();
  const digits = String(phone || '').replace(/\D/g, '');
  const cleanPassword = String(password || '').trim();

  if (withName && cleanName.length < 3) {
    return 'Введите имя минимум из 3 символов.';
  }

  if (withName && !/[A-Za-zА-Яа-яЁё]/.test(cleanName)) {
    return 'Имя должно содержать буквы.';
  }

  if (digits.length < 9 || digits.length > 15) {
    return 'Введите корректный номер телефона.';
  }

  if (cleanPassword.length < 6) {
    return 'Пароль должен быть минимум 6 символов.';
  }

  return '';
}

async function submitCustomerLogin(event) {
  event.preventDefault();
  const phone = document.getElementById('loginPhone').value.trim();
  const password = document.getElementById('loginPassword').value.trim();
  const error = validateAccountInput('', phone, password, false);
  if (error) return showAccountToast(error);

  const btn = document.getElementById('loginSubmitBtn');
  btn.disabled = true;
  btn.textContent = 'Входим...';

  try {
    const res = await fetch('/api/customer/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, password })
    });
    const { ok, data } = await parseApiResponse(res);
    if (!ok || !data.success) throw new Error(data.error || 'Ошибка входа');

    window.FrangelloCustomer.setSession(data.token, data.customer);
    document.getElementById('loginPassword').value = '';
    showAccountToast('Вы вошли в личный кабинет.');
    await refreshAccount();
  } catch (error) {
    showAccountToast(error.message || 'Не удалось войти.');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Войти';
  }
}

async function submitCustomerRegister(event) {
  event.preventDefault();
  const name = document.getElementById('registerName').value.trim();
  const phone = document.getElementById('registerPhone').value.trim();
  const password = document.getElementById('registerPassword').value.trim();
  const error = validateAccountInput(name, phone, password, true);
  if (error) return showAccountToast(error);

  const btn = document.getElementById('registerSubmitBtn');
  btn.disabled = true;
  btn.textContent = 'Создаём кабинет...';

  try {
    const res = await fetch('/api/customer/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, phone, password })
    });
    const { ok, data } = await parseApiResponse(res);
    if (!ok || !data.success) throw new Error(data.error || 'Ошибка регистрации');

    window.FrangelloCustomer.setSession(data.token, data.customer);
    document.getElementById('registerPassword').value = '';
    showAccountToast('Кабинет создан. Теперь можно сохранять товары и видеть заказы.');
    await refreshAccount();
  } catch (error) {
    showAccountToast(error.message || 'Не удалось создать кабинет.');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Создать кабинет';
  }
}

async function logoutCustomer() {
  try {
    await window.FrangelloCustomer.fetch('/api/customer/logout', { method: 'POST' });
  } catch {}
  window.FrangelloCustomer.clearSession();
  renderGuestState();
  showAccountToast('Вы вышли из кабинета.');
}

function formatCurrency(value) {
  return `${Number(value || 0).toLocaleString('ru-RU')} BYN`;
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('ru-RU');
}

function getStatusLabel(status) {
  const map = {
    new: 'Новый заказ',
    confirmed: 'Подтверждён',
    processing: 'В обработке',
    delivered: 'Доставлен',
    cancelled: 'Отменён'
  };
  return map[status] || 'Новый заказ';
}

function renderFavorites(favorites) {
  const wrap = document.getElementById('accountFavorites');
  const empty = document.getElementById('accountFavoritesEmpty');
  document.getElementById('accountHeroFavs').textContent = favorites.length;

  if (!favorites.length) {
    wrap.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }

  empty.classList.add('hidden');
  wrap.innerHTML = favorites.map(product => `
    <article class="account-favorite-card">
      <img src="${escapeHtml(product.image || '')}" alt="${escapeHtml(product.name)}" loading="lazy" />
      <h4>${escapeHtml(product.name)}</h4>
      <p>${escapeHtml(product.description || '')}</p>
      <div class="account-favorite-meta">
        <span class="account-price">${formatCurrency(product.price)}</span>
        <a class="account-mini-btn" href="/product/${product.id}">Открыть</a>
      </div>
    </article>
  `).join('');
}

function renderOrders(orders) {
  const wrap = document.getElementById('accountOrders');
  const empty = document.getElementById('accountOrdersEmpty');
  document.getElementById('accountHeroOrders').textContent = orders.length;

  if (!orders.length) {
    wrap.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }

  empty.classList.add('hidden');
  wrap.innerHTML = orders.map(order => `
    <article class="account-order-card">
      <div class="account-order-meta">
        <h4>${escapeHtml(order.productName || 'Товар')}</h4>
        <span>Дата: ${formatDate(order.createdAt)}</span>
        <span>Тип: ${order.orderType === 'consultation' ? 'Консультация' : 'Заказ'}</span>
        <span>${escapeHtml(order.variantLabel || 'Стандартный вариант')}</span>
      </div>
      <div class="account-order-side">
        <span class="account-status-badge account-status-${escapeHtml(order.status || 'new')}">${getStatusLabel(order.status)}</span>
        <strong>${formatCurrency(order.price)}</strong>
      </div>
    </article>
  `).join('');
}

function renderGuestState() {
  document.getElementById('authCard').classList.remove('hidden');
  document.getElementById('accountDashboard').classList.add('hidden');
  document.getElementById('accountHeroStatus').textContent = 'Гость';
  document.getElementById('accountHeroFavs').textContent = '0';
  document.getElementById('accountHeroOrders').textContent = '0';
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function refreshAccount() {
  const customer = await window.FrangelloCustomer.fetchProfile();
  if (!customer) {
    renderGuestState();
    return;
  }

  document.getElementById('authCard').classList.add('hidden');
  document.getElementById('accountDashboard').classList.remove('hidden');
  document.getElementById('accountCustomerName').textContent = customer.name || 'Клиент';
  document.getElementById('accountCustomerPhone').textContent = customer.phone || '';
  document.getElementById('accountHeroStatus').textContent = 'В кабинете';

  try {
    const [favoritesRes, ordersRes] = await Promise.all([
      window.FrangelloCustomer.fetch('/api/customer/favorites'),
      window.FrangelloCustomer.fetch('/api/customer/orders')
    ]);
    const favorites = favoritesRes.ok ? await favoritesRes.json() : [];
    const orders = ordersRes.ok ? await ordersRes.json() : [];
    renderFavorites(favorites);
    renderOrders(orders);
  } catch {
    renderFavorites([]);
    renderOrders([]);
    showAccountToast('Не удалось загрузить данные кабинета.');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  switchAccountMode(accountMode);
  refreshAccount();
});
