// ===== أولوية المهام: عاجل / مهم / عادي =====
const PRIO = { urgent: 0, important: 1, normal: 2 };
const PRIO_LABEL = { urgent: '🔴 عاجل', important: '🟠 مهم', normal: '⚪ عادي' };
const prioOf = t => (t && PRIO[t.priority] !== undefined ? t.priority : 'normal');
function taskCmp(a, b) {
  const pa = PRIO[prioOf(a)], pb = PRIO[prioOf(b)];
  if (pa !== pb) return pa - pb;
  const da = a.due_on || '9999-12-31', db = b.due_on || '9999-12-31';
  return da < db ? -1 : da > db ? 1 : 0;
}
const prioChip = t => prioOf(t) === 'normal' ? '' : '<span class="chip pr-chip ' + prioOf(t) + '">' + PRIO_LABEL[prioOf(t)] + '</span>';
const prioOptions = sel => Object.entries(PRIO_LABEL).map(([k, v]) => '<option value="' + k + '"' + (sel === k ? ' selected' : '') + '>' + v + '</option>').join('');
