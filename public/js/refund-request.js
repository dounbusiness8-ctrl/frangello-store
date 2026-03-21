function validateRefundForm(name, phone, productName, reason, details) {
  const cleanName = String(name || '').replace(/\s+/g, ' ').trim();
  const digits = String(phone || '').replace(/\D/g, '');

  if (cleanName.length < 3 || !/[A-Za-zА-Яа-яЁё]/.test(cleanName)) {
    return 'Введите корректное имя, минимум 3 символа.';
  }

  if (digits.length < 9 || digits.length > 15) {
    return 'Введите корректный номер телефона.';
  }

  if (String(productName || '').trim().length < 2) {
    return 'Укажите товар, по которому оформляется запрос.';
  }

  if (String(reason || '').trim().length < 4) {
    return 'Кратко укажите причину обращения.';
  }

  if (String(details || '').trim().length < 10) {
    return 'Опишите проблему чуть подробнее.';
  }

  return '';
}

async function submitRefundRequest(event) {
  event.preventDefault();

  const name = document.getElementById('refundName').value.trim();
  const phone = document.getElementById('refundPhone').value.trim();
  const productName = document.getElementById('refundProduct').value.trim();
  const orderReference = document.getElementById('refundOrderRef').value.trim();
  const requestType = document.getElementById('refundType').value;
  const reason = document.getElementById('refundReason').value.trim();
  const details = document.getElementById('refundDetails').value.trim();
  const error = validateRefundForm(name, phone, productName, reason, details);

  if (error) {
    showToast(error);
    return;
  }

  const btn = document.getElementById('refundSubmitBtn');
  btn.disabled = true;
  btn.textContent = 'Отправляем запрос...';

  try {
    const res = await fetch('/api/refund-requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        phone,
        productName,
        orderReference,
        requestType,
        reason,
        details
      })
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Request failed');
    }

    document.getElementById('refundForm').classList.add('hidden');
    document.getElementById('refundSuccessName').textContent = name;
    document.getElementById('refundSuccessPhone').textContent = phone;
    document.getElementById('refundSuccess').classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (error) {
    showToast(error.message || 'Не удалось отправить запрос.');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Отправить запрос на рассмотрение';
  }
}

function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
}
