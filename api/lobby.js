// Multiplayer lobbies for Cabin Garage.
// The game connects players straight to each other (WebRTC). This function only helps them find each other:
// it hands out a short lobby code and passes the few "how to reach me" messages between players while they connect.
// Storage: the same Upstash Redis as the suggestions box.
const crypto = require('crypto');

const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const LOBBY_TTL = 4 * 3600;     // a lobby code stays valid for 4 hours after the last activity
const MSG_TTL = 300;            // connection messages are only needed for a few seconds
const MAX_MSG = 24000;          // a connection message is a few KB
const CREATE_PER_HOUR = 20, SEND_PER_MIN = 60;
const ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O or 1/I so codes are easy to read out

async function redis(cmds) {
  const r = await fetch(URL_ + '/pipeline', { method: 'POST', headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' }, body: JSON.stringify(cmds) });
  if (!r.ok) throw new Error('redis ' + r.status);
  return (await r.json()).map(x => x.result);
}
const rand = (n, abc) => { const b = crypto.randomBytes(n); let s = ''; for (let i = 0; i < n; i++) s += abc[b[i] % abc.length]; return s; };
const cleanCode = c => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
const cleanId = c => String(c || '').replace(/[^a-z0-9]/gi, '').slice(0, 16);
function ipKey(req, p) {
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'x';
  return p + crypto.createHash('sha256').update(ip).digest('hex').slice(0, 24);
}
async function limited(req, p, max, ttl) {
  const k = ipKey(req, p);
  const [n] = await redis([['INCR', k], ['EXPIRE', k, ttl, 'NX']]);
  return n > max;
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (!URL_ || !TOKEN) return res.status(503).json({ ok: false, error: 'not-configured' });
  try {
    // poll for messages addressed to me
    if (req.method === 'GET') {
      const q = req.query || {};
      const code = cleanCode(q.code), me = cleanId(q.me);
      if (!code || !me) return res.status(400).json({ ok: false, error: 'bad-request' });
      const [list, alive] = await redis([['LPOP', 'lm:' + code + ':' + me, 20], ['EXISTS', 'lob:' + code]]);
      const msgs = [];
      for (const s of list || []) { try { msgs.push(JSON.parse(s)); } catch (e) {} }
      return res.status(200).json({ ok: true, alive: !!alive, msgs });
    }
    if (req.method !== 'POST') { res.setHeader('Allow', 'GET, POST'); return res.status(405).json({ ok: false }); }
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
    body = body || {};
    const op = String(body.op || '');

    if (op === 'create') {
      if (await limited(req, 'lc:', CREATE_PER_HOUR, 3600)) return res.status(429).json({ ok: false, error: 'slow-down' });
      for (let i = 0; i < 6; i++) {
        const code = rand(5, ABC), host = 'h' + rand(10, 'abcdefghijklmnopqrstuvwxyz0123456789');
        const [ok] = await redis([['SET', 'lob:' + code, JSON.stringify({ host, ts: Date.now() }), 'EX', LOBBY_TTL, 'NX']]);
        if (ok === 'OK') return res.status(200).json({ ok: true, code, me: host });
      }
      return res.status(500).json({ ok: false, error: 'busy' });
    }

    if (op === 'join') {
      const code = cleanCode(body.code);
      if (code.length < 4) return res.status(400).json({ ok: false, error: 'bad-code' });
      const [raw] = await redis([['GET', 'lob:' + code]]);
      if (!raw) return res.status(404).json({ ok: false, error: 'no-lobby' });
      let lob = {}; try { lob = JSON.parse(raw); } catch (e) {}
      const me = 'g' + rand(10, 'abcdefghijklmnopqrstuvwxyz0123456789');
      return res.status(200).json({ ok: true, code, me, host: lob.host });
    }

    if (op === 'send') {
      const code = cleanCode(body.code), to = cleanId(body.to), from = cleanId(body.from);
      const data = body.data;
      const s = JSON.stringify({ from, data });
      if (!code || !to || !from || s.length > MAX_MSG) return res.status(400).json({ ok: false, error: 'bad-request' });
      if (await limited(req, 'ls:', SEND_PER_MIN, 60)) return res.status(429).json({ ok: false, error: 'slow-down' });
      const k = 'lm:' + code + ':' + to;
      const [, , , alive] = await redis([['RPUSH', k, s], ['LTRIM', k, -40, -1], ['EXPIRE', k, MSG_TTL], ['EXPIRE', 'lob:' + code, LOBBY_TTL]]);
      if (!alive) return res.status(404).json({ ok: false, error: 'no-lobby' });
      return res.status(200).json({ ok: true });
    }

    if (op === 'close') {
      const code = cleanCode(body.code), me = cleanId(body.me);
      const [raw] = await redis([['GET', 'lob:' + code]]);
      let lob = {}; try { lob = JSON.parse(raw || '{}'); } catch (e) {}
      if (raw && lob.host === me) await redis([['DEL', 'lob:' + code]]);
      return res.status(200).json({ ok: true });
    }
    return res.status(400).json({ ok: false, error: 'bad-op' });
  } catch (e) {
    return res.status(502).json({ ok: false, error: 'store' });
  }
};
