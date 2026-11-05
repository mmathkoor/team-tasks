// أرقام الجوال والإيميل الداخلي للمندوب (المندوب لا يحتاج إيميلاً حقيقياً)
const CC = process.env.PHONE_COUNTRY || '967';
const REP_DOMAIN = process.env.REP_EMAIL_DOMAIN || 'rep.invalid';   // نطاق وهمي لا يمكن لأحد امتلاكه
function normPhone(p) {
  let d = String(p || '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.length === 9 && d[0] === '7') d = CC + d; else if (d.length === 10 && d[0] === '0') d = CC + d.slice(1);
  return d;
}
const repEmail = d => d + '@' + REP_DOMAIN;
module.exports = { normPhone, repEmail };
