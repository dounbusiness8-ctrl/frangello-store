const express = require('express');
const path = require('path');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const {
  DEFAULT_ADMIN_PASSWORD,
  DATA_DIR,
  USE_BLOB_STORE,
  USE_GITHUB,
  readJSON,
  writeJSON,
  readConfig,
  initSampleData,
  uploadImageToGithub,
  getImageFromGithub,
  getImageFromFilesystem,
  saveImageLocally
} = require('./storage');

const app = express();
const PORT = process.env.PORT || 3000;
const ready = initSampleData();
const FB_PIXEL_ID = process.env.FB_PIXEL_ID || '2310514779326152';
const FB_ACCESS_TOKEN = process.env.FB_ACCESS_TOKEN || 'EAAJHIziUZCH4BQ1WTF8L2zaZBDRNFTLE8GDaio3YvZAeUIhQnRyeeb6kacX4gMGMGra2CIpRXskHjTLZBM2naG18GxkiO718dKrqooO2FckLOdQUWaJLZAwYWDXIuNYeVluBVlGg96xVwhlJxqe4mT5cHCytsvIaBURqBz5XFEHuruhNZBButYAIFBTNrFOi8rrAZDZD';

app.disable('x-powered-by');
app.use(express.json({ limit: '25mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(async (req, res, next) => {
  try {
    await ready;
    next();
  } catch (error) {
    next(error);
  }
});

function fileUrl(name) {
  return path.join(__dirname, 'public', name);
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value || '').trim().toLowerCase()).digest('hex');
}

function hashPassword(password) {
  return crypto.createHash('sha256').update(String(password || '')).digest('hex');
}

function normalizePhone(phone) {
  return String(phone || '').replace(/\D/g, '');
}

function sanitizeCustomer(user) {
  if (!user) return null;
  const { passwordHash, ...safeUser } = user;
  return safeUser;
}

async function getCustomerSession(token) {
  if (!token) return null;
  const sessions = await readJSON('customer-sessions.json', []);
  const session = sessions.find(item => item.token === token);
  if (!session) return null;
  const users = await readJSON('users.json', []);
  const user = users.find(item => item.id === session.userId);
  if (!user) return null;
  return { session, user, users, sessions };
}

async function customerAuth(req, res, next) {
  const token = req.headers['x-customer-token'];
  const auth = await getCustomerSession(token);
  if (!auth) return res.status(401).json({ error: 'Unauthorized' });
  req.customer = auth.user;
  req.customerSession = auth.session;
  req.customerToken = token;
  next();
}

function validateOrderContact(name, phone) {
  const cleanName = String(name || '').replace(/\s+/g, ' ').trim();
  const phoneDigits = normalizePhone(phone);

  if (cleanName.length < 3) {
    return 'Name must be at least 3 characters long';
  }

  if (!/[A-Za-zА-Яа-яЁё]/.test(cleanName)) {
    return 'Name must contain letters';
  }

  if (phoneDigits.length < 9 || phoneDigits.length > 15) {
    return 'Phone number is invalid';
  }

  return '';
}

function validateReviewInput({ name, phone, text, rating }) {
  const contactError = validateOrderContact(name, phone);
  if (contactError) return contactError;

  const cleanText = String(text || '').trim();
  const numericRating = Number(rating);

  if (cleanText.length < 10) {
    return 'Review text must be at least 10 characters long';
  }

  if (!Number.isFinite(numericRating) || numericRating < 1 || numericRating > 5) {
    return 'Rating is invalid';
  }

  return '';
}

function validateCustomerProfile({ name, phone, password }) {
  const cleanName = String(name || '').replace(/\s+/g, ' ').trim();
  const digits = normalizePhone(phone);

  if (cleanName.length < 3) {
    return 'Name must be at least 3 characters long';
  }

  if (!/[A-Za-zА-Яа-яЁё]/.test(cleanName)) {
    return 'Name must contain letters';
  }

  if (digits.length < 9 || digits.length > 15) {
    return 'Phone number is invalid';
  }

  if (String(password || '').trim().length < 6) {
    return 'Password must be at least 6 characters long';
  }

  return '';
}

async function sendMetaConversion({ req, order, eventId }) {
  if (!FB_PIXEL_ID || !FB_ACCESS_TOKEN) return;

  const eventName = order.orderType === 'consultation' ? 'Lead' : 'Purchase';
  const payload = {
    data: [{
      event_name: eventName,
      event_time: Math.floor(Date.now() / 1000),
      event_id: eventId || order.id,
      action_source: 'website',
      event_source_url: req.body?.trackingData?.eventSourceUrl || req.get('referer') || '',
      user_data: {
        ph: order.phone ? [sha256(order.phone.replace(/\D/g, ''))] : undefined,
        fn: order.name ? [sha256(order.name.split(' ')[0])] : undefined,
        client_ip_address: req.ip,
        client_user_agent: req.get('user-agent') || '',
        fbp: req.body?.trackingData?.fbp || undefined,
        fbc: req.body?.trackingData?.fbc || undefined
      },
      custom_data: {
        currency: 'BYN',
        value: Number(order.price || 0),
        content_name: order.productName,
        content_ids: [order.productId],
        content_type: 'product'
      }
    }]
  };

  try {
    await fetch(`https://graph.facebook.com/v20.0/${FB_PIXEL_ID}/events?access_token=${FB_ACCESS_TOKEN}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } catch (error) {
    console.error('Meta CAPI error:', error.message);
  }
}

async function adminAuth(req, res, next) {
  const config = await readConfig();
  const password = req.headers['x-admin-password'] || req.query.adminPassword;
  if (password === config.adminPassword) return next();
  return res.status(401).json({ error: 'Unauthorized' });
}

app.get('/health', (req, res) => {
  res.json({
    ok: true,
    uptime: process.uptime(),
    storage: USE_BLOB_STORE ? 'vercel-blob' : 'filesystem'
  });
});

app.get('/api/products', async (req, res, next) => {
  try {
    const products = await readJSON('products.json', []);
    const { collection } = req.query;
    let filtered = products.filter(product => product.visible);
    if (collection && collection !== 'all') {
      filtered = filtered.filter(product => product.collection === collection);
    }
    res.json(filtered);
  } catch (error) {
    next(error);
  }
});

app.get('/api/collections', async (req, res, next) => {
  try {
    res.json(await readJSON('collections.json', []));
  } catch (error) {
    next(error);
  }
});

app.get('/api/config/public', async (req, res, next) => {
  try {
    const config = await readConfig();
    const { adminPassword, ...publicConfig } = config;
    res.json(publicConfig);
  } catch (error) {
    next(error);
  }
});

app.post('/api/customer/register', async (req, res, next) => {
  try {
    const { name, phone, password } = req.body || {};
    const validationError = validateCustomerProfile({ name, phone, password });
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const users = await readJSON('users.json', []);
    const normalizedPhone = normalizePhone(phone);
    const existingUser = users.find(user => normalizePhone(user.phone) === normalizedPhone);
    if (existingUser) {
      return res.status(409).json({ error: 'An account with this phone already exists' });
    }

    const customer = {
      id: uuidv4(),
      name: String(name).replace(/\s+/g, ' ').trim(),
      phone: String(phone).trim(),
      phoneNormalized: normalizedPhone,
      passwordHash: hashPassword(password),
      favorites: [],
      createdAt: new Date().toISOString()
    };
    const token = crypto.randomBytes(24).toString('hex');
    const sessions = await readJSON('customer-sessions.json', []);
    const session = {
      token,
      userId: customer.id,
      createdAt: new Date().toISOString()
    };

    users.unshift(customer);
    sessions.unshift(session);
    await writeJSON('users.json', users);
    await writeJSON('customer-sessions.json', sessions);

    res.json({
      success: true,
      token,
      customer: sanitizeCustomer(customer)
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/customer/login', async (req, res, next) => {
  try {
    const { phone, password } = req.body || {};
    const normalizedPhone = normalizePhone(phone);
    const users = await readJSON('users.json', []);
    const customer = users.find(user => normalizePhone(user.phone) === normalizedPhone);

    if (!customer || customer.passwordHash !== hashPassword(password)) {
      return res.status(401).json({ error: 'Wrong phone or password' });
    }

    const sessions = await readJSON('customer-sessions.json', []);
    const token = crypto.randomBytes(24).toString('hex');
    sessions.unshift({
      token,
      userId: customer.id,
      createdAt: new Date().toISOString()
    });
    await writeJSON('customer-sessions.json', sessions);

    res.json({
      success: true,
      token,
      customer: sanitizeCustomer(customer)
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/customer/me', customerAuth, async (req, res, next) => {
  try {
    res.json({ customer: sanitizeCustomer(req.customer) });
  } catch (error) {
    next(error);
  }
});

app.post('/api/customer/logout', customerAuth, async (req, res, next) => {
  try {
    const sessions = await readJSON('customer-sessions.json', []);
    const nextSessions = sessions.filter(session => session.token !== req.customerToken);
    await writeJSON('customer-sessions.json', nextSessions);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

app.get('/api/customer/favorites', customerAuth, async (req, res, next) => {
  try {
    const products = await readJSON('products.json', []);
    const favorites = (req.customer.favorites || [])
      .map(productId => products.find(product => product.id === productId))
      .filter(Boolean);
    res.json(favorites);
  } catch (error) {
    next(error);
  }
});

app.post('/api/customer/favorites/:productId', customerAuth, async (req, res, next) => {
  try {
    const users = await readJSON('users.json', []);
    const index = users.findIndex(user => user.id === req.customer.id);
    if (index < 0) return res.status(404).json({ error: 'Customer not found' });

    const nextFavorites = Array.from(new Set([...(users[index].favorites || []), req.params.productId]));
    users[index] = { ...users[index], favorites: nextFavorites };
    await writeJSON('users.json', users);
    res.json({ success: true, favorites: nextFavorites });
  } catch (error) {
    next(error);
  }
});

app.delete('/api/customer/favorites/:productId', customerAuth, async (req, res, next) => {
  try {
    const users = await readJSON('users.json', []);
    const index = users.findIndex(user => user.id === req.customer.id);
    if (index < 0) return res.status(404).json({ error: 'Customer not found' });

    const nextFavorites = (users[index].favorites || []).filter(productId => productId !== req.params.productId);
    users[index] = { ...users[index], favorites: nextFavorites };
    await writeJSON('users.json', users);
    res.json({ success: true, favorites: nextFavorites });
  } catch (error) {
    next(error);
  }
});

app.get('/api/customer/orders', customerAuth, async (req, res, next) => {
  try {
    const orders = await readJSON('orders.json', []);
    const customerOrders = orders.filter(order => order.customerId === req.customer.id);
    res.json(customerOrders);
  } catch (error) {
    next(error);
  }
});

app.post('/api/orders', async (req, res, next) => {
  try {
    const { name, phone, productId, productName, price, variantSelection, variantLabel, orderType, eventId } = req.body;
    if (!name || !phone || !productId) {
      return res.status(400).json({ error: 'Missing fields' });
    }
    const validationError = validateOrderContact(name, phone);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const token = req.headers['x-customer-token'];
    const auth = await getCustomerSession(token);
    const orders = await readJSON('orders.json', []);
    const order = {
      id: uuidv4(),
      name: name.trim(),
      phone: phone.trim(),
      productId,
      productName,
      price,
      variantSelection: variantSelection || {},
      variantLabel: variantLabel || '',
      orderType: orderType === 'consultation' ? 'consultation' : 'order',
      customerId: auth?.user?.id || null,
      status: 'new',
      createdAt: new Date().toISOString()
    };

    orders.unshift(order);
    await writeJSON('orders.json', orders);
    sendMetaConversion({ req, order, eventId });
    res.json({ success: true, orderId: order.id });
  } catch (error) {
    next(error);
  }
});

app.post('/api/refund-requests', async (req, res, next) => {
  try {
    const {
      name,
      phone,
      productName,
      orderReference,
      deliveryService,
      requestType,
      reason,
      details
    } = req.body;

    if (!name || !phone || !productName || !reason || !details) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const validationError = validateOrderContact(name, phone);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const cleanDetails = String(details || '').trim();
    if (cleanDetails.length < 10) {
      return res.status(400).json({ error: 'Please provide more details about the refund request' });
    }

    const refundRequests = await readJSON('refund-requests.json', []);
    const refundRequest = {
      id: uuidv4(),
      name: String(name).trim(),
      phone: String(phone).trim(),
      productName: String(productName).trim(),
      orderReference: String(orderReference || '').trim(),
      deliveryService: String(deliveryService || '').trim(),
      requestType: String(requestType || 'refund').trim(),
      reason: String(reason).trim(),
      details: cleanDetails,
      status: 'new',
      createdAt: new Date().toISOString()
    };

    refundRequests.unshift(refundRequest);
    await writeJSON('refund-requests.json', refundRequests);
    res.json({ success: true, requestId: refundRequest.id });
  } catch (error) {
    next(error);
  }
});

app.get('/api/reviews', async (req, res, next) => {
  try {
    const { productId } = req.query;
    const reviews = await readJSON('reviews.json', []);
    const filtered = reviews.filter(review => {
      if (review.status !== 'approved') return false;
      if (productId && review.productId !== productId) return false;
      return true;
    });
    res.json(filtered);
  } catch (error) {
    next(error);
  }
});

app.post('/api/reviews', async (req, res, next) => {
  try {
    const { productId, productName, name, phone, text, rating, image } = req.body;

    if (!productId || !productName || !name || !phone || !text) {
      return res.status(400).json({ error: 'Missing fields' });
    }

    const validationError = validateReviewInput({ name, phone, text, rating });
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const reviews = await readJSON('reviews.json', []);
    const review = {
      id: uuidv4(),
      productId,
      productName: String(productName).trim(),
      name: String(name).trim(),
      phone: String(phone).trim(),
      text: String(text).trim(),
      rating: Number(rating),
      image: String(image || '').trim(),
      status: 'pending',
      createdAt: new Date().toISOString()
    };

    reviews.unshift(review);
    await writeJSON('reviews.json', reviews);
    res.json({ success: true, reviewId: review.id });
  } catch (error) {
    next(error);
  }
});

app.post('/api/admin/login', async (req, res, next) => {
  try {
    const config = await readConfig();
    if (req.body.password === config.adminPassword) {
      return res.json({ success: true });
    }
    return res.status(401).json({ error: 'Wrong password' });
  } catch (error) {
    next(error);
  }
});

app.get('/api/admin/products', adminAuth, async (req, res, next) => {
  try {
    res.json(await readJSON('products.json', []));
  } catch (error) {
    next(error);
  }
});

app.post('/api/admin/products', adminAuth, async (req, res, next) => {
  try {
    if (req.body.image && String(req.body.image).startsWith('data:')) {
      return res.status(400).json({ error: 'Image must be a URL. Upload your image to imgur.com or another host and paste the link.' });
    }
    const products = await readJSON('products.json', []);
    const product = {
      id: uuidv4(),
      ...req.body,
      visible: req.body.visible !== false,
      createdAt: new Date().toISOString()
    };

    products.unshift(product);
    await writeJSON('products.json', products);
    res.json(product);
  } catch (error) {
    next(error);
  }
});

app.put('/api/admin/products/:id', adminAuth, async (req, res, next) => {
  try {
    if (req.body.image && String(req.body.image).startsWith('data:')) {
      return res.status(400).json({ error: 'Image must be a URL. Upload your image to imgur.com or another host and paste the link.' });
    }
    const products = await readJSON('products.json', []);
    const index = products.findIndex(product => product.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: 'Not found' });

    products[index] = { ...products[index], ...req.body };
    await writeJSON('products.json', products);
    res.json(products[index]);
  } catch (error) {
    next(error);
  }
});

app.delete('/api/admin/products/:id', adminAuth, async (req, res, next) => {
  try {
    const products = await readJSON('products.json', []);
    const nextProducts = products.filter(product => product.id !== req.params.id);
    await writeJSON('products.json', nextProducts);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

app.get('/api/admin/orders', adminAuth, async (req, res, next) => {
  try {
    res.json(await readJSON('orders.json', []));
  } catch (error) {
    next(error);
  }
});

app.get('/api/admin/refund-requests', adminAuth, async (req, res, next) => {
  try {
    res.json(await readJSON('refund-requests.json', []));
  } catch (error) {
    next(error);
  }
});

app.get('/api/admin/reviews', adminAuth, async (req, res, next) => {
  try {
    res.json(await readJSON('reviews.json', []));
  } catch (error) {
    next(error);
  }
});

app.put('/api/admin/reviews/:id', adminAuth, async (req, res, next) => {
  try {
    const reviews = await readJSON('reviews.json', []);
    const index = reviews.findIndex(review => review.id === req.params.id);
    if (index < 0) return res.status(404).json({ error: 'Not found' });
    reviews[index] = { ...reviews[index], ...req.body };
    await writeJSON('reviews.json', reviews);
    res.json(reviews[index]);
  } catch (error) {
    next(error);
  }
});

app.delete('/api/admin/reviews/:id', adminAuth, async (req, res, next) => {
  try {
    const reviews = await readJSON('reviews.json', []);
    const nextReviews = reviews.filter(review => review.id !== req.params.id);
    await writeJSON('reviews.json', nextReviews);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

app.put('/api/admin/refund-requests/:id', adminAuth, async (req, res, next) => {
  try {
    const refundRequests = await readJSON('refund-requests.json', []);
    const index = refundRequests.findIndex(request => request.id === req.params.id);
    if (index < 0) return res.status(404).json({ error: 'Not found' });
    refundRequests[index] = { ...refundRequests[index], ...req.body };
    await writeJSON('refund-requests.json', refundRequests);
    res.json(refundRequests[index]);
  } catch (error) {
    next(error);
  }
});

app.delete('/api/admin/refund-requests/:id', adminAuth, async (req, res, next) => {
  try {
    const refundRequests = await readJSON('refund-requests.json', []);
    const nextRefunds = refundRequests.filter(request => request.id !== req.params.id);
    await writeJSON('refund-requests.json', nextRefunds);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

app.put('/api/admin/orders/:id', adminAuth, async (req, res, next) => {
  try {
    const orders = await readJSON('orders.json', []);
    const index = orders.findIndex(order => order.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: 'Not found' });

    orders[index] = { ...orders[index], ...req.body };
    await writeJSON('orders.json', orders);
    res.json(orders[index]);
  } catch (error) {
    next(error);
  }
});

app.post('/api/admin/orders/:id/refund', adminAuth, async (req, res, next) => {
  try {
    const orders = await readJSON('orders.json', []);
    const index = orders.findIndex(o => o.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: 'Order not found' });

    const order = orders[index];
    const { amount, currency } = req.body;
    const refundAmount = amount || order.price || 0;
    const refundCurrency = currency || 'BYN';

    orders[index] = { ...order, status: 'refunded', refundedAt: new Date().toISOString(), refundAmount };
    await writeJSON('orders.json', orders);

    const refundRequests = await readJSON('refund-requests.json', []);
    refundRequests.unshift({
      id: uuidv4(),
      orderId: order.id,
      orderReference: order.id.slice(0, 8).toUpperCase(),
      name: order.name,
      phone: order.phone,
      productName: order.productName || '',
      amount: refundAmount,
      currency: refundCurrency,
      requestType: 'cash_refund',
      reason: 'Cash refund issued by admin',
      details: `Refund for order #${order.id.slice(0, 8).toUpperCase()} — ${order.productName || ''} — ${refundAmount} ${refundCurrency}`,
      status: 'resolved',
      createdAt: new Date().toISOString()
    });
    await writeJSON('refund-requests.json', refundRequests);

    res.json({ success: true, order: orders[index] });
  } catch (error) {
    next(error);
  }
});

app.delete('/api/admin/orders/:id', adminAuth, async (req, res, next) => {
  try {
    const orders = await readJSON('orders.json', []);
    const nextOrders = orders.filter(order => order.id !== req.params.id);
    await writeJSON('orders.json', nextOrders);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

app.get('/api/admin/collections', adminAuth, async (req, res, next) => {
  try {
    res.json(await readJSON('collections.json', []));
  } catch (error) {
    next(error);
  }
});

app.post('/api/admin/collections', adminAuth, async (req, res, next) => {
  try {
    const collections = await readJSON('collections.json', []);
    const collection = { id: uuidv4(), ...req.body };
    collections.push(collection);
    await writeJSON('collections.json', collections);
    res.json(collection);
  } catch (error) {
    next(error);
  }
});

app.delete('/api/admin/collections/:id', adminAuth, async (req, res, next) => {
  try {
    const collections = await readJSON('collections.json', []);
    const nextCollections = collections.filter(collection => collection.id !== req.params.id);
    await writeJSON('collections.json', nextCollections);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

app.get('/api/admin/config', adminAuth, async (req, res, next) => {
  try {
    res.json(await readConfig());
  } catch (error) {
    next(error);
  }
});

app.put('/api/admin/config', adminAuth, async (req, res, next) => {
  try {
    const config = { ...(await readConfig()), ...req.body };
    await writeJSON('config.json', config);
    res.json(config);
  } catch (error) {
    next(error);
  }
});

app.get('/api/admin/stats', adminAuth, async (req, res, next) => {
  try {
    const orders = await readJSON('orders.json', []);
    const products = await readJSON('products.json', []);
    const today = new Date().toDateString();

    res.json({
      totalOrders: orders.length,
      newOrders: orders.filter(order => order.status === 'new').length,
      todayOrders: orders.filter(order => new Date(order.createdAt).toDateString() === today).length,
      totalProducts: products.length,
      revenue: orders
        .filter(order => order.status === 'delivered')
        .reduce((sum, order) => sum + (order.price || 0), 0)
    });
  } catch (error) {
    next(error);
  }
});

app.get('/admin', (req, res) => res.sendFile(fileUrl('admin.html')));
app.get('/account', (req, res) => res.sendFile(fileUrl('account.html')));
app.get('/account.html', (req, res) => res.sendFile(fileUrl('account.html')));
app.get('/product/:id', (req, res) => res.sendFile(fileUrl('product.html')));
// ─── IMAGE UPLOAD ─────────────────────────────────────────────────────────────
app.post('/api/admin/upload-image', adminAuth, async (req, res, next) => {
  try {
    const { data, filename } = req.body; // data = base64 string (no data: prefix), filename = original name
    if (!data || !filename) return res.status(400).json({ error: 'Missing data or filename' });

    // Sanitize filename, use uuid to avoid conflicts
    const ext = (filename.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 4) || 'jpg';
    const safeExt = ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext) ? (ext === 'jpeg' ? 'jpg' : ext) : 'jpg';
    const imageFilename = `${uuidv4()}.${safeExt}`;

    if (USE_GITHUB) {
      await uploadImageToGithub(imageFilename, data);
    } else {
      await saveImageLocally(imageFilename, data);
    }

    res.json({ url: `/api/images/${imageFilename}` });
  } catch (error) {
    next(error);
  }
});

// Serve images (proxy from GitHub or local filesystem)
app.get('/api/images/:filename', async (req, res, next) => {
  try {
    const filename = req.params.filename.replace(/[^a-zA-Z0-9._-]/g, '');
    if (!filename) return res.status(400).send('Invalid filename');

    const buffer = USE_GITHUB
      ? await getImageFromGithub(filename)
      : await getImageFromFilesystem(filename);

    if (!buffer) return res.status(404).send('Image not found');

    const ext = filename.split('.').pop().toLowerCase();
    const mime = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' }[ext] || 'image/jpeg';
    res.setHeader('Content-Type', mime);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.send(buffer);
  } catch (error) {
    next(error);
  }
});

// ─── AI COLLECTION SUGGEST ────────────────────────────────────────────────────
app.post('/api/admin/suggest-collection', adminAuth, async (req, res) => {
  const { name = '', description = '' } = req.body;
  const text = `${name} ${description}`.toLowerCase();

  const rules = [
    { id: 'kitchen', keywords: ['кухн', 'готов', 'блендер', 'фритюр', 'нож', 'посуд', 'миксер', 'тостер', 'кофе', 'чайник', 'плит', 'терк', 'сковород', 'варить', 'духовк', 'cook', 'kitchen', 'food', 'blender', 'chef', 'knife', 'pan', 'pot', 'bake'] },
    { id: 'gadgets', keywords: ['гаджет', 'наушник', 'bluetooth', 'usb', 'зарядк', 'беспровод', 'аккумулятор', 'led', 'проектор', 'колонк', 'смарт', 'часы', 'экран', 'gadget', 'wireless', 'earphone', 'speaker', 'projector', 'smart', 'watch', 'charger', 'cable', 'tech'] },
    { id: 'home',    keywords: ['дом', 'квартир', 'диван', 'стол', 'стул', 'органайзер', 'хранен', 'полк', 'вешалк', 'зеркал', 'ковер', 'подушк', 'одеял', 'декор', 'home', 'storage', 'organizer', 'shelf', 'rack', 'decor', 'lamp', 'pillow', 'mirror'] },
    { id: 'lifestyle', keywords: ['спорт', 'фитнес', 'йога', 'красот', 'уход', 'косметик', 'одежд', 'сумк', 'рюкзак', 'аксессуар', 'lifestyle', 'fashion', 'beauty', 'sport', 'fitness', 'yoga', 'bag', 'wallet', 'travel'] }
  ];

  let best = { id: '', score: 0 };
  for (const rule of rules) {
    const score = rule.keywords.filter(k => text.includes(k)).length;
    if (score > best.score) best = { id: rule.id, score };
  }

  if (best.score === 0) return res.json({ collection: null });

  // Find the matching collection from stored collections
  const collections = await readJSON('collections.json', []);
  const match = collections.find(c => c.slug === best.id || c.id === best.id);
  res.json({ collection: match ? match.id : null, slug: best.id, confidence: Math.min(best.score / 3, 1) });
});

app.get('*', (req, res) => res.sendFile(fileUrl('index.html')));

app.use((error, req, res, next) => {
  console.error('Server error:', error.message, error.stack);
  if (error.type === 'entity.too.large') {
    if (req.path.startsWith('/api/')) {
      return res.status(413).json({ error: 'Uploaded data is too large. Please use a smaller image.' });
    }
    return res.status(413).send('Uploaded data is too large.');
  }
  if (req.path.startsWith('/api/')) {
    return res.status(500).json({ error: 'Internal server error', detail: error.message });
  }
  return res.status(500).send('Internal server error');
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`\n🚀 Frangello By Store running at http://localhost:${PORT}`);
    console.log(`📊 Admin Dashboard: http://localhost:${PORT}/admin`);
    console.log(`💾 Storage: ${USE_BLOB_STORE ? 'Vercel Blob' : `Filesystem (${DATA_DIR})`}`);
    if ((process.env.ADMIN_PASSWORD || '').trim()) {
      console.log('🔐 Admin password loaded from environment.\n');
    } else {
      console.log(`⚠️  Using default admin password "${DEFAULT_ADMIN_PASSWORD}". Set ADMIN_PASSWORD in production.\n`);
    }
  });
}

module.exports = app;
