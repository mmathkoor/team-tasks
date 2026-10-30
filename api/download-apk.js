// تحميل مباشر لملف APK من السيرفر المحلي أو التوجيه للملف الثابت
const fs = require('fs');
const path = require('path');

module.exports = (req, res) => {
  const localCandidates = [
    path.join(__dirname, '..', 'team-tasks.apk'),
    path.join(__dirname, '..', 'public', 'team-tasks.apk')
  ];

  for (const fp of localCandidates) {
    if (fs.existsSync(fp)) {
      res.setHeader('Content-Type', 'application/vnd.android.package-archive');
      res.setHeader('Content-Disposition', 'attachment; filename="team-tasks.apk"');
      return fs.createReadStream(fp).pipe(res);
    }
  }

  // في حال لم يكن متاحاً كملف محلي داخل مسار الدالة، يتم التوجيه للملف الثابت في public
  res.writeHead(302, {
    Location: '/team-tasks.apk',
    'Cache-Control': 'no-cache, no-store, must-revalidate'
  });
  res.end();
};

