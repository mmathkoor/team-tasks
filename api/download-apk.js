module.exports = (req, res) => {
  res.writeHead(302, {
    Location: '/team-tasks.apk',
    'Cache-Control': 'no-cache, no-store, must-revalidate'
  });
  res.end();
};
