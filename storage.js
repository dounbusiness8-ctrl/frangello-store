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

async function ensureLocalDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('blob_timeout')), ms))
  ]);
}

async function readRaw(name) {
  if (USE_BLOB_STORE) {
    try {
      const { list } = getBlobSdk();
      const { blobs } = await withTimeout(list({ prefix: blobPath(name), limit: 10 }), 8000);
      const found = blobs.find(b => b.pathname === blobPath(name));
      if (!found) return null;
      const res = await withTimeout(fetch(found.url), 8000);
      if (!res.ok) return null;
      return await res.text();
    } catch {
      return null;
    }
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
    await withTimeout(put(blobPath(name), value, {
      access: 'public',
      allowOverwrite: true,
      contentType: 'application/json'
    }), 10000);
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
  try {
  const collections = await readRaw('collections.json');
  if (!collections) {
    await writeJSON('collections.json', [
      { id: '1', name: 'Все товары', slug: 'all', icon: '✨' },
      { id: '2', name: 'Кухня', slug: 'kitchen', icon: '🍳' },
      { id: '3', name: 'Гаджеты', slug: 'gadgets', icon: '⚡' },
      { id: '4', name: 'Дом', slug: 'home', icon: '🏠' },
      { id: '5', name: 'Стиль жизни', slug: 'lifestyle', icon: '💫' }
    ]);
  }

  const products = await readRaw('products.json');
  if (!products) {
    const { v4: uuidv4 } = require('uuid');
    await writeJSON('products.json', [
      {
        id: uuidv4(),
        name: 'Мультифункциональная аэрофритюрница Pro',
        description: 'Готовьте вкусно на 80% меньше масла. Цифровой экран, 8 режимов приготовления.',
        price: 149,
        oldPrice: 219,
        image: 'https://images.pexels.com/photos/4116714/pexels-photo-4116714.jpeg?auto=compress&w=500',
        collection: 'kitchen',
        badge: 'HOT',
        visible: true,
        featured: true,
        createdAt: new Date().toISOString()
      },
      {
        id: uuidv4(),
        name: 'Умная LED лампа для рабочего стола',
        description: 'USB зарядка, 3 режима цвета, сенсорное управление, гибкая ножка.',
        price: 58,
        oldPrice: 85,
        image: 'https://images.pexels.com/photos/1112598/pexels-photo-1112598.jpeg?auto=compress&w=500',
        collection: 'gadgets',
        badge: 'NEW',
        visible: true,
        featured: true,
        createdAt: new Date().toISOString()
      },
      {
        id: uuidv4(),
        name: 'Электрическая точилка для ножей',
        description: 'Профессиональная заточка в 3 этапа, работает со всеми типами ножей.',
        price: 72,
        oldPrice: 98,
        image: 'https://images.pexels.com/photos/4397899/pexels-photo-4397899.jpeg?auto=compress&w=500',
        collection: 'kitchen',
        badge: 'SALE',
        visible: true,
        featured: false,
        createdAt: new Date().toISOString()
      },
      {
        id: uuidv4(),
        name: 'Беспроводные наушники Pro X',
        description: 'Активное шумоподавление, 36 часов работы, защита IPX5 от воды.',
        price: 105,
        oldPrice: 159,
        image: 'https://images.pexels.com/photos/3945667/pexels-photo-3945667.jpeg?auto=compress&w=500',
        collection: 'gadgets',
        badge: 'HOT',
        visible: true,
        featured: true,
        createdAt: new Date().toISOString()
      },
      {
        id: uuidv4(),
        name: 'Портативный блендер-бутылка',
        description: 'USB зарядка, 6 лезвий, смешивает за 30 секунд — бери с собой.',
        price: 48,
        oldPrice: 72,
        image: 'https://images.pexels.com/photos/775996/pexels-photo-775996.jpeg?auto=compress&w=500',
        collection: 'kitchen',
        badge: 'NEW',
        visible: true,
        featured: false,
        createdAt: new Date().toISOString()
      },
      {
        id: uuidv4(),
        name: 'Смарт-часы с фитнес трекером',
        description: 'Пульс, SpO2, мониторинг сна, 7 дней работы, водонепроницаемые.',
        price: 92,
        oldPrice: 135,
        image: 'https://images.pexels.com/photos/437037/pexels-photo-437037.jpeg?auto=compress&w=500',
        collection: 'gadgets',
        badge: 'HOT',
        visible: true,
        featured: true,
        createdAt: new Date().toISOString()
      },
      {
        id: uuidv4(),
        name: 'Силиконовый набор для кухни (7 предметов)',
        description: 'Термостойкость до 230°C, антипригарное, пищевой силикон, можно в посудомойку.',
        price: 39,
        oldPrice: 59,
        image: 'https://images.pexels.com/photos/4397844/pexels-photo-4397844.jpeg?auto=compress&w=500',
        collection: 'kitchen',
        badge: 'SALE',
        visible: true,
        featured: false,
        createdAt: new Date().toISOString()
      },
      {
        id: uuidv4(),
        name: 'Мини-проектор HD',
        description: 'Поддержка 1080p, встроенный динамик, HDMI/USB, кино у вас дома.',
        price: 179,
        oldPrice: 259,
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
      tagline: 'Гаджеты и товары для кухни — с доставкой по Беларуси',
      whatsapp: '',
      currency: 'BYN',
      heroTitle: 'Товары, которые хочется заказать сразу',
      heroSubtitle: 'Гаджеты и товары для кухни с доставкой по Беларуси и оплатой только при получении'
    });
  }
  } catch (err) {
    console.error('initSampleData error:', err);
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
