const functions = require('firebase-functions');

// GET /api/ice (via Firebase Hosting rewrite)
// Proxies Xirsys TURN credentials server-side so the client never exposes secrets.
// Credentials are read from env vars XIRSYS_USER and XIRSYS_SECRET, or from
// functions config (firebase functions:config:set xirsys.user=... xirsys.secret=...).
exports.ice = functions.https.onRequest(async (req, res) => {
  const origin = req.headers.origin || '*';
  res.set('Access-Control-Allow-Origin', origin);
  res.set('Vary', 'Origin');
  res.set('Access-Control-Allow-Credentials', 'true');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).send('');

  const user = process.env.XIRSYS_USER || (functions.config().xirsys && functions.config().xirsys.user);
  const secret = process.env.XIRSYS_SECRET || (functions.config().xirsys && functions.config().xirsys.secret);

  try {
    if (!user || !secret) throw new Error('Missing XIRSYS_USER/XIRSYS_SECRET');

    const auth = Buffer.from(`${user}:${secret}`).toString('base64');
    const resp = await fetch('https://global.xirsys.net/_turn/TechMed', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${auth}`,
      },
      body: JSON.stringify({ format: 'urls' }),
    });

    const data = await resp.json().catch(() => ({}));
    const iceServers = Array.isArray(data)
      ? data
      : (data.v?.iceServers || data.iceServers || data.v?.urls || data.v || []);

    if (!Array.isArray(iceServers) || iceServers.length === 0) {
      return res.json({ iceServers: [{ urls: ['stun:stun.l.google.com:19302'] }] });
    }

    return res.json({ iceServers });
  } catch (err) {
    console.error('ICE proxy error', err);
    return res.json({ iceServers: [{ urls: ['stun:stun.l.google.com:19302'] }] });
  }
});
