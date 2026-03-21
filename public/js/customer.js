const CUSTOMER_TOKEN_KEY = 'frangelloCustomerToken';
const CUSTOMER_CACHE_KEY = 'frangelloCustomerProfile';

function getCustomerToken() {
  try {
    return localStorage.getItem(CUSTOMER_TOKEN_KEY) || '';
  } catch {
    return '';
  }
}

function getCachedCustomer() {
  try {
    const raw = localStorage.getItem(CUSTOMER_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function setCustomerSession(token, customer) {
  try {
    localStorage.setItem(CUSTOMER_TOKEN_KEY, token);
    localStorage.setItem(CUSTOMER_CACHE_KEY, JSON.stringify(customer || null));
  } catch {}
  window.dispatchEvent(new CustomEvent('frangello:customer-updated', { detail: customer || null }));
}

function clearCustomerSession() {
  try {
    localStorage.removeItem(CUSTOMER_TOKEN_KEY);
    localStorage.removeItem(CUSTOMER_CACHE_KEY);
  } catch {}
  window.dispatchEvent(new CustomEvent('frangello:customer-updated', { detail: null }));
}

async function customerFetch(url, options = {}) {
  const headers = { ...(options.headers || {}) };
  const token = getCustomerToken();
  if (token) headers['x-customer-token'] = token;

  const res = await fetch(url, { ...options, headers });
  if (res.status === 401) {
    clearCustomerSession();
  }
  return res;
}

async function fetchCustomerProfile() {
  const token = getCustomerToken();
  if (!token) return null;

  try {
    const res = await customerFetch('/api/customer/me');
    if (!res.ok) return null;
    const data = await res.json();
    if (data.customer) {
      setCustomerSession(token, data.customer);
      return data.customer;
    }
  } catch {}
  return null;
}

function escapeCustomerHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderCustomerHeader() {
  const customer = getCachedCustomer();
  const slots = document.querySelectorAll('[data-customer-slot]');
  slots.forEach(slot => {
    if (customer) {
      slot.innerHTML = `
        <a class="account-link logged-in" href="/account.html" title="Личный кабинет">
          <span class="account-link-icon">❤</span>
          <span>${escapeCustomerHtml((customer.name || '').split(' ')[0] || 'Кабинет')}</span>
        </a>
      `;
    } else {
      slot.innerHTML = `
        <a class="account-link" href="/account.html" title="Войти в кабинет">
          <span class="account-link-icon">👤</span>
          <span>Кабинет</span>
        </a>
      `;
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  renderCustomerHeader();
  fetchCustomerProfile().then(renderCustomerHeader);
});

window.addEventListener('frangello:customer-updated', renderCustomerHeader);

window.FrangelloCustomer = {
  getToken: getCustomerToken,
  getCustomer: getCachedCustomer,
  setSession: setCustomerSession,
  clearSession: clearCustomerSession,
  fetch: customerFetch,
  fetchProfile: fetchCustomerProfile
};
