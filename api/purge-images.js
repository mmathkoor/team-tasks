const { supabase, member, isCron } = require('../lib/auth');
const { purgeImages } = require('../lib/purge');
module.exports = async (req, res) => {
  if (!isCron(req) && !(await member(req))) return res.status(401).json({ error: 'unauthorized' });
  try { return res.status(200).json(await purgeImages(supabase, (req.body || {}).order_id)); }
  catch (e) { return res.status(500).json({ error: e.message }); }
};
