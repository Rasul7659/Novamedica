'use strict';
// Мини-ограничитель запросов в памяти: не больше `max` обращений за `windowMs` с одного адреса.
function rateLimit({ windowMs, max, message }) {
  const hits = new Map();
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.reset <= now) hits.delete(k);
  }, windowMs).unref();
  return (req, res, next) => {
    const now = Date.now();
    const rec = hits.get(req.ip);
    if (!rec || rec.reset <= now) {
      hits.set(req.ip, { n: 1, reset: now + windowMs });
      return next();
    }
    rec.n += 1;
    if (rec.n > max) {
      res.set('Retry-After', String(Math.ceil((rec.reset - now) / 1000)));
      return res.status(429).json({ error: message || 'Слишком много запросов. Попробуйте чуть позже.' });
    }
    next();
  };
}
module.exports = { rateLimit };
