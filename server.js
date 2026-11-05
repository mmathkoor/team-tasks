const express = require('express');
const path = require('path');

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));

// API routes (originally Vercel serverless functions in /api)
const apiRoutes = [
  'config',
  'i',
  'manifest',
  'notify',
  'order-push',
  'purge-images',
  'recur',
  'remind',
  'rep-admin',
  'rep-login'
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

// Short image URL redirect for reps: /i/:c -> /api/i?c=:c
const imgShortHandler = require(path.join(__dirname, 'api', 'i.js'));
app.get('/i/:c', async (req, res, next) => {
  try {
    req.query = Object.assign({}, req.query, { c: req.params.c });
    await imgShortHandler(req, res);
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

// Serve static files from repository root
app.use(express.static(__dirname));

// SPA fallback to index.html
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server listening on http://0.0.0.0:${PORT}`);
});
