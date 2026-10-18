// manifest يحمل اسم هذا النشاط (APP_NAME) عند تثبيته على الجوال
module.exports = (req, res) => {
  const name = process.env.APP_NAME || 'مهام الفريق', short = process.env.APP_SHORT_NAME || name.slice(0, 14);
  res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.status(200).send(JSON.stringify({ name, short_name: short, start_url: '/', display: 'standalone', dir: 'rtl', lang: 'ar', background_color: '#0e2144', theme_color: '#0e2144',
    icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' }, { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' }, { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }] }));
};
