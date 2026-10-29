const express = require('express');
const path = require('path');

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));

// API routes (originally Vercel serverless functions in /api)
const apiRoutes = [
  'config',
  'manifest',
  'notify',
  'order-push',
  'purge-images',
  'recur',
  'remind',
  'rep-admin',
  'rep-login',
  'download-apk'
];

for (const route of apiRoutes) {
  const handler = require(path.join(__dirname, 'api', `${route}.js`));
  app.all(`/api/${route}`, async (req, res, next) => {
    try {
      await handler(req, res);
    } catch (err) {
      next(err);
    }
  });
}

// Direct /apk and /apk/download redirect to GitHub latest APK
const apkHandler = require(path.join(__dirname, 'api', 'download-apk.js'));
app.get(['/apk', '/apk/download'], async (req, res, next) => {
  try {
    await apkHandler(req, res);
  } catch (err) {
    next(err);
  }
});

// Vercel rewrite compatibility: /manifest.json -> /api/manifest
const manifestHandler = require(path.join(__dirname, 'api', 'manifest.js'));
app.get('/manifest.json', async (req, res, next) => {
  try {
    await manifestHandler(req, res);
  } catch (err) {
    next(err);
  }
});

// Serve static files from repository root with cache-control headers
app.use(express.static(__dirname, {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('sw.js') || filePath.endsWith('index.html') || filePath.endsWith('version.js')) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    } else {
      res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
    }
  }
}));

// SPA fallback to index.html with no-cache headers
app.use((req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server listening on http://0.0.0.0:${PORT}`);
});
