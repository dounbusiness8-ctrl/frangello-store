const fs = require('fs/promises');
const path = require('path');

const DEFAULT_ADMIN_PASSWORD = 'change-me-before-production';
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data'));
const BLOB_PREFIX = (process.env.BLOB_PREFIX || 'frangello').replace(/^\/+|\/+$/g, '');
const USE_BLOB_STORE = Boolean(process.env.BLOB_READ_WRITE_TOKEN);

let blobSdk = null;

function getBlobSdk() {
  if (!blobSdk) blobSdk = require('@vercel/blob');
  return blobSdk;
}

function filePath(name) {
  return path.join(DATA_DIR, name);
}

function blobPath(name) {
  return `${BLOB_PREFIX}/${name}`;
}

async function streamToText(stream) {
  return new Response(stream).text();
}

async function ensureLocalDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

async function readRaw(name) {
  if (USE_BLOB_STORE) {
    const { get } = getBlobSdk();
    const result = await get(blobPath(name), { access: 'private' });
    if (!result || result.statusCode !== 200 || !result.stream) return null;
    return streamToText(result.stream);
  }

  try {
    return await fs.readFile(filePath(name), 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function writeRaw(name, value) {
  if (USE_BLOB_STORE) {
    const { put } = getBlobSdk();
    await put(blobPath(name), value, {
      access: 'private',
      allowOverwrite: true,
      contentType: 'application/json'
    });
    return;
  }

  await ensureLocalDir();
  await fs.writeFile(filePath(name), value, 'utf8');
}

async function readJSON(name, fallback = []) {
  try {
    const raw = await readRaw(name);
    return raw ? JSON.parse(raw) : fallback;
  } catch (error) {
    return fallback;
  }
}

async function writeJSON(name, data) {
  await writeRaw(name, JSON.stringify(data, null, 2));
}

async function readConfig() {
  const fallback = {
    adminPassword: process.env.ADMIN_PASSWORD || DEFAULT_ADMIN_PASSWORD,
    storeName: 'Frangello By',
    whatsapp: '',
    currency: 'DA'
  };

  const stored = await readJSON('config.json', fallback);
  return { ...fallback, ...stored };
}

async function initSampleData() {
  const collections = await readRaw('collections.json');
  if (!collections) {
    await writeJSON('collections.json', [
      { id: '1', name: 'All', slug: 'all', icon: '✨' },
      { id: '2', name: 'Kitchen', slug: 'kitchen', icon: '🍳' },
      { id: '3', name: 'Gadgets', slug: 'gadgets', icon: '⚡' },
      { id: '4', name: 'Home', slug: 'home', icon: '🏠' },
      { id: '5', name: 'Lifestyle', slug: 'lifestyle', icon: '💫' }
    ]);
  }

  const products = await readRaw('products.json');
  if (!products) {
    const { v4: uuidv4 } = require('uuid');
    await writeJSON('products.json', [
      {
        id: uuidv4(),
        name: 'Multi-Function Air Fryer Pro',
        description: 'Cook healthier meals with 80% less oil. Digital touch screen, 8 preset modes.',
        price: 4500,
        oldPrice: 6500,
        image: 'https://images.pexels.com/photos/4116714/pexels-photo-4116714.jpeg?auto=compress&w=500',
        collection: 'kitchen',
        badge: 'HOT',
        visible: true,
        featured: true,
        createdAt: new Date().toISOString()
      },
      {
        id: uuidv4(),
        name: 'Smart LED Desk Lamp',
        description: 'USB charging port, 3 color modes, touch dimmer, flexible arm.',
        price: 1800,
        oldPrice: 2500,
        image: 'https://images.pexels.com/photos/1112598/pexels-photo-1112598.jpeg?auto=compress&w=500',
        collection: 'gadgets',
        badge: 'NEW',
        visible: true,
        featured: true,
        createdAt: new Date().toISOString()
      },
      {
        id: uuidv4(),
        name: 'Electric Knife Sharpener',
        description: 'Professional 3-stage sharpening, works on all knife types, safe & easy.',
        price: 2200,
        oldPrice: 3000,
        image: 'https://images.pexels.com/photos/4397899/pexels-photo-4397899.jpeg?auto=compress&w=500',
        collection: 'kitchen',
        badge: 'SALE',
        visible: true,
        featured: false,
        createdAt: new Date().toISOString()
      },
      {
        id: uuidv4(),
        name: 'Wireless Earbuds Pro X',
        description: 'Active noise cancellation, 36hr battery, IPX5 water resistant.',
        price: 3200,
        oldPrice: 4800,
        image: 'https://images.pexels.com/photos/3945667/pexels-photo-3945667.jpeg?auto=compress&w=500',
        collection: 'gadgets',
        badge: 'HOT',
        visible: true,
        featured: true,
        createdAt: new Date().toISOString()
      },
      {
        id: uuidv4(),
        name: 'Portable Blender Bottle',
        description: 'USB rechargeable, 6 blades, blend anywhere in 30 seconds.',
        price: 1500,
        oldPrice: 2200,
        image: 'https://images.pexels.com/photos/775996/pexels-photo-775996.jpeg?auto=compress&w=500',
        collection: 'kitchen',
        badge: 'NEW',
        visible: true,
        featured: false,
        createdAt: new Date().toISOString()
      },
      {
        id: uuidv4(),
        name: 'Smart Watch Fitness Band',
        description: 'Heart rate, SpO2, sleep tracking, 7-day battery, waterproof.',
        price: 2800,
        oldPrice: 4000,
        image: 'https://images.pexels.com/photos/437037/pexels-photo-437037.jpeg?auto=compress&w=500',
        collection: 'gadgets',
        badge: 'HOT',
        visible: true,
        featured: true,
        createdAt: new Date().toISOString()
      },
      {
        id: uuidv4(),
        name: 'Silicone Cooking Set (7pcs)',
        description: 'Heat resistant to 230°C, non-stick, food-grade silicone, dishwasher safe.',
        price: 1200,
        oldPrice: 1800,
        image: 'https://images.pexels.com/photos/4397844/pexels-photo-4397844.jpeg?auto=compress&w=500',
        collection: 'kitchen',
        badge: 'SALE',
        visible: true,
        featured: false,
        createdAt: new Date().toISOString()
      },
      {
        id: uuidv4(),
        name: 'Mini Projector HD',
        description: '1080p support, built-in speaker, HDMI/USB, home cinema experience.',
        price: 5500,
        oldPrice: 8000,
        image: 'https://images.pexels.com/photos/7991168/pexels-photo-7991168.jpeg?auto=compress&w=500',
        collection: 'gadgets',
        badge: 'NEW',
        visible: true,
        featured: true,
        createdAt: new Date().toISOString()
      }
    ]);
  }

  const orders = await readRaw('orders.json');
  if (!orders) await writeJSON('orders.json', []);

  const config = await readRaw('config.json');
  if (!config) {
    await writeJSON('config.json', {
      adminPassword: process.env.ADMIN_PASSWORD || DEFAULT_ADMIN_PASSWORD,
      storeName: 'Frangello By',
      tagline: 'Premium Gadgets & Kitchen Essentials',
      whatsapp: '',
      currency: 'DA',
      heroTitle: 'Discover Premium Products',
      heroSubtitle: 'Gadgets & Kitchen Essentials delivered to your door'
    });
  }
}

module.exports = {
  DEFAULT_ADMIN_PASSWORD,
  DATA_DIR,
  USE_BLOB_STORE,
  readJSON,
  writeJSON,
  readConfig,
  initSampleData
};
