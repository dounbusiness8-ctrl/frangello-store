const fs = require('fs/promises');
const path = require('path');

const DEFAULT_ADMIN_PASSWORD = 'change-me-before-production';
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data'));

// GitHub storage config
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO = process.env.GITHUB_REPO || 'dounbusiness8-ctrl/frangello-store';
const GITHUB_DB_PATH = 'db';
const USE_GITHUB = Boolean(GITHUB_TOKEN);

// Keep old blob config for health check compatibility
const USE_BLOB_STORE = USE_GITHUB;

function filePath(name) {
  return path.join(DATA_DIR, name);
}

async function githubApiGet(repoPath) {
  const url = `https://api.github.com/repos/${GITHUB_REPO}/contents/${GITHUB_DB_PATH}/${repoPath}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `token ${GITHUB_TOKEN}`,
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'frangello-store'
    }
  });
  if (!res.ok) return null;
  const data = await res.json();
  if (!data.content) return null;
  return { content: Buffer.from(data.content, 'base64').toString('utf8'), sha: data.sha };
}

async function githubApiPut(repoPath, content, existingSha) {
  const url = `https://api.github.com/repos/${GITHUB_REPO}/contents/${GITHUB_DB_PATH}/${repoPath}`;
  const body = {
    message: `Update ${repoPath}`,
    content: Buffer.from(content).toString('base64')
  };
  if (existingSha) body.sha = existingSha;

  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `token ${GITHUB_TOKEN}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      'User-Agent': 'frangello-store'
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GitHub write failed: ${res.status} ${err}`);
  }
}

async function ensureLocalDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

async function readRaw(name) {
  if (USE_GITHUB) {
    try {
      const result = await githubApiGet(name);
      return result ? result.content : null;
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
  if (USE_GITHUB) {
    // Retry up to 3 times to handle SHA conflicts
    for (let attempt = 1; attempt <= 3; attempt++) {
      let sha;
      try {
        const existing = await githubApiGet(name);
        sha = existing ? existing.sha : undefined;
      } catch {
        sha = undefined;
      }
      try {
        await githubApiPut(name, value, sha);
        return;
      } catch (err) {
        if (attempt === 3) throw err;
        // Brief pause before retry on conflict
        await new Promise(r => setTimeout(r, 300 * attempt));
      }
    }
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
    currency: 'BYN'
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
