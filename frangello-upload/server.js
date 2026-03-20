const express = require('express');
const path = require('path');
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
    const { name, phone, productId, productName, price } = req.body;
    if (!name || !phone || !productId) {
      return res.status(400).json({ error: 'Missing fields' });
    }

    const orders = await readJSON('orders.json', []);
    const order = {
      id: uuidv4(),
      name: name.trim(),
      phone: phone.trim(),
      productId,
      productName,
      price,
      status: 'new',
      createdAt: new Date().toISOString()
    };

    orders.unshift(order);
    await writeJSON('orders.json', orders);
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
  console.error(error);
  if (req.path.startsWith('/api/')) {
    return res.status(500).json({ error: 'Internal server error' });
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
