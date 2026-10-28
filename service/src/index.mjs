/* Muvit-Dienst – Cloudflare Worker
   Muvit selbst ist eine reine Web-App (GitHub Pages). Echte Daten von DB und INSA (MVB) erlauben keine Abfragen
   direkt aus dem Browser; dafür und für Push-Mitteilungen bei geschlossener App gibt es diesen kleinen Dienst.

   GET  /health                      Zustand und verfügbare Funktionen
   GET  /db/station?name&lat&lon     DB-Bahnhof (EVA-Nummer)
   GET  /db/departures?eva&when      Zug-Abfahrten mit Gleis, Verspätung, Meldungen
   GET  /db/trip?id                  Zug-Fahrtverlauf
   GET  /db/wagenreihung?category&number&eva&date&time   Wagenreihung mit Sektoren und Ausstattung
   GET  /nv/stop?name&lat&lon        INSA-Haltestelle
   GET  /nv/departures?stop&when     Tram-/Bus-Abfahrten der MVB in Echtzeit mit Hinweisen
   GET  /nv/trip?id                  Fahrtverlauf (u. a. „wird als Linie … fortgesetzt“)
   GET  /nv/remarks                  aktuelle Störungen in Magdeburg
   GET  /vapid · POST /watch · DELETE /watch/:id   Push (siehe push.mjs)
   Einrichtung: ../README.md */
import * as DB from './db.mjs';
import * as NV from './nv.mjs';
import { pushRoute, pushCron } from './push.mjs';

const VERSION = 3;

function cors(env, req) {
  const origin = req.headers.get('Origin') || '';
  const allowed = String(env.ALLOW_ORIGIN || '*').split(',').map((s) => s.trim()).filter(Boolean);
  const local = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  const ok = allowed.includes('*') || allowed.includes(origin) || local;
  return {
    'Access-Control-Allow-Origin': ok ? origin || '*' : allowed[0] || '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin'
  };
}
const json = (o, h, status = 200, ttl = 0) => new Response(JSON.stringify(o), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': ttl ? 'public, max-age=' + ttl : 'no-store', ...h }
});

/** GET-Antworten kurz zwischenspeichern (schont DB und INSA, schneller für alle Nutzer) */
async function cached(req, ttl, ctx, make) {
  const cache = typeof caches !== 'undefined' ? caches.default : null;
  const key = new Request(new URL(req.url).toString(), { method: 'GET' });
  if (cache) { const hit = await cache.match(key); if (hit) return hit; }
  const res = await make();
  if (cache && res.status === 200 && ttl) ctx.waitUntil(cache.put(key, res.clone()));
  return res;
}

const ROUTES = {
  '/db/station': [86400, (env, q) => DB.station(env, q).then((s) => ({ station: s }))],
  '/db/departures': [20, (env, q) => DB.departures(env, q)],
  '/db/trip': [20, (env, q) => DB.trip(env, q)],
  '/db/wagenreihung': [120, (env, q) => DB.wagenreihung(env, q)],
  '/nv/stop': [86400, (env, q) => NV.stop(env, q).then((s) => ({ stop: s }))],
  '/nv/departures': [20, (env, q) => NV.departures(env, q)],
  '/nv/trip': [20, (env, q) => NV.trip(env, q)],
  '/nv/remarks': [120, (env) => NV.remarks(env)]
};
const REQUIRED = { '/db/departures': ['eva'], '/db/trip': ['id'], '/db/wagenreihung': ['category', 'number', 'eva', 'date', 'time'], '/nv/departures': ['stop'], '/nv/trip': ['id'] };

export default {
  async fetch(req, env, ctx) {
    const h = cors(env, req);
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { headers: h });
    try {
      if (url.pathname === '/' || url.pathname === '/health') {
        return json({ ok: true, service: 'muvit-dienst', version: VERSION, push: !!(env.WATCHES && env.VAPID_PRIVATE && env.VAPID_PUBLIC), db: true, nv: true, dbSource: DB.source() }, h);
      }
      const route = ROUTES[url.pathname];
      if (route && req.method === 'GET') {
        const q = Object.fromEntries(url.searchParams);
        const miss = (REQUIRED[url.pathname] || []).filter((k) => !q[k]);
        if (miss.length) return json({ error: 'Es fehlt: ' + miss.join(', ') }, h, 400);
        const [ttl, fn] = route;
        // nicht gefundene Bahnhöfe/Haltestellen: 404 und nicht zwischenspeichern
        const res = await cached(req, ttl, ctx, async () => {
          const out = await fn(env, q);
          return out && (out.station === null || out.stop === null) ? json({ error: 'Nicht gefunden' }, {}, 404) : json(out, {}, 200, ttl);
        });
        const out = new Response(res.body, res);
        Object.entries(h).forEach(([k, v]) => out.headers.set(k, v));
        return out;
      }
      const p = await pushRoute(req, env, url, h);
      if (p) return p;
      return json({ error: 'Nicht gefunden' }, h, 404);
    } catch (e) {
      return json({ error: String((e && e.message) || e), code: (e && (e.code || e.hafasCode)) || null }, h, 502);
    }
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(pushCron(env));
  }
};
