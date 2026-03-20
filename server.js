const express = require('express');
const path = require('path');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const {
  DEFAULT_ADMIN_PASSWORD,
  DATA_DIR,
  USE_BLOB_STORE,
  readJSON,
  writeJSON,
  readConfig,
  initSampleData
} = require('./storage');

const app = express();
const PORT = process.env.PORT || 3000;
const ready = initSampleData();
const FB_PIXEL_ID = process.env.FB_PIXEL_ID || '2310514779326152';
const FB_ACCESS_TOKEN = process.env.FB_ACCESS_TOKEN || 'EAAJHIziUZCH4BQ1WTF8L2zaZBDRNFTLE8GDaio3YvZAeUIhQnRyeeb6kacX4gMGMGra2CIpRXskHjTLZBM2naG18GxkiO718dKrqooO2FckLOdQUWaJLZAwYWDXIuNYeVluBVlGg96xVwhlJxqe4mT5cHCytsvIaBURqBz5XFEHuruhNZBButYAIFBTNrFOi8rrAZDZD';

app.disable('x-powered-by');
app.use(express.json());
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

function validateOrderContact(name, phone) {
  const cleanName = String(name || '').replace(/\s+/g, ' ').trim();
  const phoneDigits = String(phone || '').replace(/\D/g, '');

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
app.get('/product/:id', (req, res) => res.sendFile(fileUrl('product.html')));
app.get('*', (req, res) => res.sendFile(fileUrl('index.html')));

app.use((error, req, res, next) => {
  console.error('Server error:', error.message, error.stack);
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
