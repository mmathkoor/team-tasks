// تحميل مباشر وفوري لملف APK من السيرفر مباشرة دون تحويل المتصفح لأي صفحة خارجية أو خطأ 404
const fs = require('fs');
const path = require('path');

const GITHUB_RELEASE_APK = 'https://github.com/mmathkoor/team-tasks/releases/latest/download/team-tasks.apk';
const GITHUB_RAW_PUBLIC_APK = 'https://raw.githubusercontent.com/mmathkoor/team-tasks/main/public/team-tasks.apk';
const GITHUB_RAW_ROOT_APK = 'https://raw.githubusercontent.com/mmathkoor/team-tasks/main/team-tasks.apk';

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

  // 1) الفحص في المسارات المحلية أولاً (يعمل في السيرفر المحلي أو إذا تم تضمين الملف)
  const localCandidates = [
    path.join(__dirname, '..', 'team-tasks.apk'),
    path.join(__dirname, '..', 'public', 'team-tasks.apk')
  ];

  for (const fp of localCandidates) {
    try {
      if (fs.existsSync(fp) && fs.statSync(fp).size > 10000) {
        const stat = fs.statSync(fp);
        res.setHeader('Content-Type', 'application/vnd.android.package-archive');
        res.setHeader('Content-Disposition', 'attachment; filename="team-tasks.apk"');
        res.setHeader('Content-Length', String(stat.size));
        return fs.createReadStream(fp).pipe(res);
      }
    } catch (e) {}
  }

  // 2) الجلب المباشر (Server-Side Stream) لأحدث نسخة مبنية تلقائياً دون مغادرة موقعك نهائياً
  const remoteCandidates = [
    GITHUB_RELEASE_APK,
    GITHUB_RAW_PUBLIC_APK,
    GITHUB_RAW_ROOT_APK
  ];

  for (const url of remoteCandidates) {
    try {
      const upstream = await fetch(url, {
        redirect: 'follow',
        headers: { 'User-Agent': 'Matjark-APK-Downloader/2.0' }
      });
      if (upstream.ok && upstream.body) {
        const buf = Buffer.from(await upstream.arrayBuffer());
        if (buf.length > 10000) {
          res.setHeader('Content-Type', 'application/vnd.android.package-archive');
          res.setHeader('Content-Disposition', 'attachment; filename="team-tasks.apk"');
          res.setHeader('Content-Length', String(buf.length));
          return res.status(200).send(buf);
        }
      }
    } catch (e) {}
  }

  return res.status(404).send('ملف التطبيق قيد التحديث حالياً، يرجى المحاولة بعد دقيقة.');
};
