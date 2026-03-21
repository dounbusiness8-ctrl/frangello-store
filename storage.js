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
  if (res.status === 404) return null; // file truly doesn't exist
  if (!res.ok) throw new Error(`GitHub read error: ${res.status}`); // real error — don't treat as missing
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

// Safe init: only writes if file is confirmed missing (404). Errors = skip, never overwrite.
async function safeInit(name, defaultData) {
  try {
    const existing = await readRaw(name); // throws on GitHub errors, null on 404
    if (existing === null) {
      await writeJSON(name, defaultData);
    }
  } catch (err) {
    console.error(`initSampleData: skipping ${name} due to read error:`, err.message);
  }
}

async function initSampleData() {
  const { v4: uuidv4 } = require('uuid');

  await safeInit('collections.json', [
    { id: '1', name: 'Все товары', slug: 'all', icon: '✨' },
    { id: '2', name: 'Кухня', slug: 'kitchen', icon: '🍳' },
    { id: '3', name: 'Гаджеты', slug: 'gadgets', icon: '⚡' },
    { id: '4', name: 'Дом', slug: 'home', icon: '🏠' },
    { id: '5', name: 'Стиль жизни', slug: 'lifestyle', icon: '💫' }
  ]);

  await safeInit('products.json', [
    {
      id: uuidv4(),
      name: 'Мультифункциональная аэрофритюрница Pro',
      description: 'Готовьте вкусно на 80% меньше масла. Цифровой экран, 8 режимов приготовления.',
      price: 149, oldPrice: 219,
      image: 'https://images.pexels.com/photos/4116714/pexels-photo-4116714.jpeg?auto=compress&w=500',
      collection: 'kitchen', badge: 'HOT', visible: true, featured: true, createdAt: new Date().toISOString()
    },
    {
      id: uuidv4(),
      name: 'Умная LED лампа для рабочего стола',
      description: 'USB зарядка, 3 режима цвета, сенсорное управление, гибкая ножка.',
      price: 58, oldPrice: 85,
      image: 'https://images.pexels.com/photos/1112598/pexels-photo-1112598.jpeg?auto=compress&w=500',
      collection: 'gadgets', badge: 'NEW', visible: true, featured: true, createdAt: new Date().toISOString()
    },
    {
      id: uuidv4(),
      name: 'Беспроводные наушники Pro X',
      description: 'Активное шумоподавление, 36 часов работы, защита IPX5 от воды.',
      price: 105, oldPrice: 159,
      image: 'https://images.pexels.com/photos/3945667/pexels-photo-3945667.jpeg?auto=compress&w=500',
      collection: 'gadgets', badge: 'HOT', visible: true, featured: true, createdAt: new Date().toISOString()
    }
  ]);

  await safeInit('orders.json', []);
  await safeInit('refund-requests.json', []);
  await safeInit('reviews.json', []);
  await safeInit('users.json', []);
  await safeInit('customer-sessions.json', []);
  await safeInit('config.json', {
    adminPassword: process.env.ADMIN_PASSWORD || DEFAULT_ADMIN_PASSWORD,
    storeName: 'Frangello By',
    tagline: 'Гаджеты и товары для кухни — с доставкой по Беларуси',
    whatsapp: '',
    currency: 'BYN',
    heroTitle: 'Товары, которые хочется заказать сразу',
    heroSubtitle: 'Гаджеты и товары для кухни с доставкой по Беларуси и оплатой только при получении'
  });
}

// Upload binary image to GitHub db/images/
async function uploadImageToGithub(filename, base64Content) {
  if (!USE_GITHUB) throw new Error('GitHub storage not configured');
  const url = `https://api.github.com/repos/${GITHUB_REPO}/contents/${GITHUB_DB_PATH}/images/${filename}`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `token ${GITHUB_TOKEN}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      'User-Agent': 'frangello-store'
    },
    body: JSON.stringify({
      message: `Upload image ${filename}`,
      content: base64Content // already base64
    })
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Image upload failed: ${res.status}`);
  }
}

// Fetch image binary from GitHub, return {buffer, size} or null
async function getImageFromGithub(filename) {
  if (!USE_GITHUB) return null;
  const url = `https://api.github.com/repos/${GITHUB_REPO}/contents/${GITHUB_DB_PATH}/images/${filename}`;
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
  return Buffer.from(data.content.replace(/\n/g, ''), 'base64');
}

// Serve image from local filesystem fallback
async function getImageFromFilesystem(filename) {
  try {
    const imgPath = path.join(DATA_DIR, 'images', filename);
    return await fs.readFile(imgPath);
  } catch { return null; }
}

// Save image locally
async function saveImageLocally(filename, base64Content) {
  const imgDir = path.join(DATA_DIR, 'images');
  await fs.mkdir(imgDir, { recursive: true });
  await fs.writeFile(path.join(imgDir, filename), Buffer.from(base64Content, 'base64'));
}

module.exports = {
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
};
