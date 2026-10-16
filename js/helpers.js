function updateBadge() {
  if (!navigator.setAppBadge || !S.me) return;
  const n = S.tasks.filter(t => mine(t) && eff(t) !== 'done').length;
  n ? navigator.setAppBadge(n).catch(() => {}) : navigator.clearAppBadge().catch(() => {});
}
function saveCache() {
  if (S.me) localStorage.setItem(CACHE_KEY, JSON.stringify({ email: S.me.email, s: { me: S.me, members: S.members, meetings: S.meetings, tasks: S.tasks, done: S.done, props: S.props, votes: S.votes } }));
}
const shrink = f => new Promise((ok, no) => { const i = new Image(); i.onload = () => { const k = Math.min(1, 1600 / Math.max(i.width, i.height)), c = document.createElement('canvas'); c.width = i.width * k; c.height = i.height * k; c.getContext('2d').drawImage(i, 0, 0, c.width, c.height); URL.revokeObjectURL(i.src); c.toBlob(b => b ? ok(b) : no(), 'image/jpeg', 0.8); }; i.onerror = no; i.src = URL.createObjectURL(f); });
async function stor(method, path, body, type) {
  return fetch(API + '/storage/v1/' + path, { method, headers: Object.assign({ apikey: KEY, Authorization: 'Bearer ' + await tok() }, type ? { 'Content-Type': type } : {}), body });
}
