const express = require('express');
const path = require('path');
const fs = require('fs');

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

// Direct /apk and /apk/download serve local APK file
app.get(['/apk', '/apk/download'], (req, res) => {
  const fp = path.join(__dirname, 'public', 'team-tasks.apk');
  const fpRoot = path.join(__dirname, 'team-tasks.apk');
  const target = fs.existsSync(fp) ? fp : (fs.existsSync(fpRoot) ? fpRoot : null);
  if (target) {
    res.setHeader('Content-Type', 'application/vnd.android.package-archive');
    res.setHeader('Content-Disposition', 'attachment; filename="team-tasks.apk"');
    return fs.createReadStream(target).pipe(res);
  }
  res.redirect('/team-tasks.apk');
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
    if (filePath.endsWith('.apk')) {
      res.setHeader('Content-Type', 'application/vnd.android.package-archive');
      res.setHeader('Content-Disposition', 'attachment; filename="team-tasks.apk"');
      res.setHeader('Cache-Control', 'public, max-age=86400');
    } else if (filePath.endsWith('sw.js') || filePath.endsWith('index.html') || filePath.endsWith('version.js')) {
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
