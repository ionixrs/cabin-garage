// Shared suggestions box for Cabin Garage.
// Storage: Upstash Redis over REST (add it in Vercel: Storage -> Upstash for Redis -> connect to this project).
// The list lives under one key per week (Monday to Sunday, Europe/Zurich), so it starts empty every Monday.
const crypto = require('crypto');

const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const MAX_LEN = 240, MAX_ITEMS = 200, PER_HOUR = 8;

function weekKey(now = new Date()) {
  const p = {};
  for (const x of new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Zurich', year: 'numeric', month: 'numeric', day: 'numeric', weekday: 'short' }).formatToParts(now)) p[x.type] = x.value;
  const dow = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(p.weekday);
  const d = new Date(Date.UTC(+p.year, +p.month - 1, +p.day - Math.max(0, dow)));
  return d.getUTCFullYear() + '-' + (d.getUTCMonth() + 1) + '-' + d.getUTCDate();
}

async function redis(cmds) {
  const r = await fetch(URL_ + '/pipeline', { method: 'POST', headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' }, body: JSON.stringify(cmds) });
  if (!r.ok) throw new Error('redis ' + r.status);
  return (await r.json()).map(x => x.result);
}

function parse(list) {
  const out = [];
  for (const s of list || []) { try { const o = JSON.parse(s); if (o && typeof o.t === 'string') out.push({ t: o.t, ts: +o.ts || 0 }); } catch (e) {} }
  return out;
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!URL_ || !TOKEN) return res.status(503).json({ ok: false, error: 'not-configured' });
  const week = weekKey(), key = 'sug:' + week;
  try {
    if (req.method === 'GET') {
      const [list] = await redis([['LRANGE', key, 0, MAX_ITEMS - 1]]);
      return res.status(200).json({ ok: true, week, items: parse(list) });
    }
    if (req.method === 'POST') {
      let body = req.body;
      if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
      const t = String((body && body.t) || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_LEN);
      if (!t) return res.status(400).json({ ok: false, error: 'empty' });
      const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'x';
      const rl = 'rl:' + crypto.createHash('sha256').update(ip).digest('hex').slice(0, 24);
      const [n] = await redis([['INCR', rl], ['EXPIRE', rl, 3600, 'NX']]);
      if (n > PER_HOUR) return res.status(429).json({ ok: false, error: 'slow-down' });
      const out = await redis([['LPUSH', key, JSON.stringify({ t, ts: Date.now() })], ['LTRIM', key, 0, MAX_ITEMS - 1], ['EXPIRE', key, 9 * 86400], ['LRANGE', key, 0, MAX_ITEMS - 1]]);
      return res.status(200).json({ ok: true, week, items: parse(out[3]) });
    }
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ ok: false, error: 'method' });
  } catch (e) {
    return res.status(502).json({ ok: false, error: 'storage' });
  }
};
