const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT) || 3000;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
};

const apiRoutes = new Set([
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
]);

function enhanceRes(res) {
  res.status = function (code) {
    res.statusCode = code;
    return res;
  };
  res.json = function (obj) {
    if (!res.headersSent) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
    }
    res.end(JSON.stringify(obj));
    return res;
  };
  res.send = function (body) {
    if (typeof body === 'object' && body !== null && !Buffer.isBuffer(body)) {
      return res.json(body);
    }
    res.end(body);
    return res;
  };
  return res;
}

function parseBody(req) {
  return new Promise((resolve) => {
    if (req.method === 'GET' || req.method === 'HEAD') return resolve({});
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve(raw);
      }
    });
    req.on('error', () => resolve({}));
  });
}

const server = http.createServer(async (req, res) => {
  enhanceRes(res);
  try {
    const parsedUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const pathname = decodeURIComponent(parsedUrl.pathname);
    req.query = Object.fromEntries(parsedUrl.searchParams.entries());

    // 1. /api/:name routes
    if (pathname.startsWith('/api/')) {
      const route = pathname.slice(5).replace(/\/+$/, '');
      if (apiRoutes.has(route)) {
        req.body = await parseBody(req);
        const handler = require(path.join(__dirname, 'api', `${route}.js`));
        await handler(req, res);
        return;
      }
    }

    // 2. /i/:c short image redirect
    if (pathname.startsWith('/i/')) {
      const code = pathname.slice(3).replace(/\/+$/, '');
      req.query = Object.assign({}, req.query, { c: code });
      const handler = require(path.join(__dirname, 'api', 'i.js'));
      await handler(req, res);
      return;
    }

    // 3. /manifest.json rewrite
    if (pathname === '/manifest.json') {
      const handler = require(path.join(__dirname, 'api', 'manifest.js'));
      await handler(req, res);
      return;
    }

    // 4. Static files from repository root
    const safePath = path.normalize(pathname).replace(/^(\.\.(\/|\\|$))+/, '');
    let filePath = path.join(__dirname, safePath === '/' ? 'index.html' : safePath);

    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      res.setHeader('Content-Type', MIME_TYPES[ext] || 'application/octet-stream');
      fs.createReadStream(filePath).pipe(res);
      return;
    }

    // 5. SPA fallback to index.html
    const indexFile = path.join(__dirname, 'index.html');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    fs.createReadStream(indexFile).pipe(res);
  } catch (err) {
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
    }
    res.end(JSON.stringify({ error: err.message || 'Internal Server Error' }));
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server listening on http://0.0.0.0:${PORT}`);
});
