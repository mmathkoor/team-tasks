// توجيه تلقائي مباشر لتحميل أحدث ملف APK مبني من GitHub Actions
module.exports = (req, res) => {
  const targetUrl = 'https://github.com/mmathkoor/team-tasks/releases/latest/download/team-tasks.apk';
  res.writeHead(302, {
    Location: targetUrl,
    'Cache-Control': 'no-cache, no-store, must-revalidate'
  });
  res.end();
};
