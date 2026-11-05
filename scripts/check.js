// فحص سريع قبل أي رفع:  node scripts/check.js
// 1) صياغة كل ملفات js/ و api/ و lib/   2) تكرار أسماء عامة بين الملفات (يكسر التطبيق)   3) سلامة index.html وملف الإعدادات
const fs = require('fs'), path = require('path'), root = path.resolve(__dirname, '..');
let bad = 0; const fail = m => { bad++; console.log('✗ ' + m); };
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
for (const dir of ['js', 'api', 'lib']) for (const f of fs.readdirSync(path.join(root, dir)).filter(x => x.endsWith('.js'))) {
  try { new Function('require', 'module', 'exports', 'process', read(dir + '/' + f)); } catch (e) { fail(`صياغة ${dir}/${f}: ${e.message}`); }
}
const html = read('index.html'), scripts = [...html.matchAll(/<script src="\/js\/([^"]+)"/g)].map(m => m[1]);
const decl = {};
for (const f of scripts) {
  if (!fs.existsSync(path.join(root, 'js', f))) { fail('index.html يشير لملف غير موجود: js/' + f); continue; }
  for (const m of read('js/' + f).matchAll(/^(?:async\s+)?(?:function\*?\s+|const\s+|let\s+|class\s+)([A-Za-z_$][\w$]*)/gm)) (decl[m[1]] = decl[m[1]] || []).push(f);
}
for (const [k, v] of Object.entries(decl)) if (v.length > 1) fail(`اسم عام مكرر «${k}» في: ${v.join(', ')}`);
const cfg = read('js/config.js');
if (!/SUPABASE_URL/.test(cfg) || !/SUPABASE_ANON_KEY/.test(cfg)) fail('js/config.js ينقصه SUPABASE_URL أو SUPABASE_ANON_KEY');
if (/service_role|SERVICE_ROLE_KEY\s*=/.test(cfg)) fail('js/config.js يحتوي مفتاحاً سرياً!');
console.log(bad ? `\n${bad} مشكلة` : `✓ كل شيء سليم (${scripts.length} ملف JS في index.html)`); process.exit(bad ? 1 : 0);
