/* Muvit-Dienst – Push: Überwacht gemerkte Verbindungen jede Minute (Echtzeit von Transitous) und schickt Web-Push-Mitteilungen,
   auch wenn Muvit auf dem Handy geschlossen ist:
   - Anschluss wird nicht erreicht (mit schnellster Alternative)
   - Fahrt fällt aus
   - erste Fahrt fährt 5 Minuten oder mehr später
   Einrichtung: siehe ../README.md. */
import { sendPush } from './webpush.mjs';

const API = 'https://api.transitous.org/api';
const VERSIONS = ['v5', 'v6', 'v4', 'v1'];
const clock = new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' });
const hm = (ms) => clock.format(new Date(ms));
const lineTxt = (l) => (l ? (l.mode === 'tram' ? 'Tram ' : l.mode === 'bus' ? 'Bus ' : '') + l.name : '');
const ms = (v) => (v ? Date.parse(v) : null);
const norm = (n) => String(n || '').replace(/^Magdeburg(?:\s*,\s*|\s*-\s*|\s+)/, '').replace(/\s*(?:,\s*Magdeburg|\(Magdeburg\))$/, '').replace(/^Hbf\b/, 'Hauptbahnhof').toLowerCase().replace(/[^a-z0-9äöüß]/g, '');

const json = (o, h, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json', ...h } });
const vapid = (env) => ({ publicKey: env.VAPID_PUBLIC, privateKey: env.VAPID_PRIVATE, subject: env.VAPID_SUBJECT });
const ttlOf = (exp) => Math.max(60, Math.ceil((exp - Date.now()) / 1000));
const validSub = (s) => !!(s && typeof s.endpoint === 'string' && /^https:\/\//.test(s.endpoint) && s.keys && s.keys.p256dh && s.keys.auth);

async function getIndex(env) { return JSON.parse((await env.WATCHES.get('index')) || '[]'); }
async function setIndex(env, ids) { await env.WATCHES.put('index', JSON.stringify(ids)); }

async function api(path, params) {
  const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null && v !== '')).toString();
  for (const v of VERSIONS) {
    const res = await fetch(API + '/' + v + path + '?' + q, { headers: { Accept: 'application/json', 'User-Agent': 'Muvit-Push (Magdeburg)' } });
    if (res.status === 404 && !(res.headers.get('content-type') || '').includes('json')) continue;
    if (!res.ok) throw new Error('API ' + res.status);
    return res.json();
  }
  throw new Error('API nicht erreichbar');
}

/** Halte einer Fahrt aus der Transitous-Antwort */
function tripStops(it) {
  const out = [];
  (it.legs || []).filter((l) => l.mode !== 'WALK').forEach((l) => {
    [l.from, ...(l.intermediateStops || []), l.to].forEach((p, i, all) => out.push({
      id: p.stopId || '', name: p.name,
      arr: ms(p.arrival || (i === all.length - 1 ? l.endTime : null)),
      dep: ms(p.departure || (i === 0 ? l.startTime : null)),
      cancelled: !!p.cancelled
    }));
  });
  return out;
}
const findStop = (stops, s) => stops.find((x) => (s.id && x.id === s.id)) || stops.find((x) => norm(x.name) === norm(s.name));

/** Gleiche Regeln wie in der App (js/watch.js) */
function findProblem(j, now) {
  const tr = j.legs.map((l, i) => ({ l, i })).filter((x) => !x.l.walk);
  for (let k = 0; k < tr.length; k++) {
    const A = tr[k].l;
    if ((A.from.cancelled || A.to.cancelled) && A.to.time > now) return { kind: 'cancel', leg: A, at: A.from.time > now ? A.from : A.to, key: 'c' + k };
    if (k + 1 < tr.length) {
      const B = tr[k + 1].l;
      const walk = j.legs.slice(tr[k].i + 1, tr[k + 1].i).reduce((s, w) => s + (w.walk ? (w.duration || 0) * 60000 : 0), 0);
      const slack = B.from.time - A.to.time - walk;
      if (slack < 0 && B.from.time > now - 60000) return { kind: 'miss', leg: B, prev: A, at: A.to, slack, key: 'm' + k };
    }
  }
  const A = tr[0] && tr[0].l;
  if (A && A.from.planned && A.from.time > now) {
    const d = Math.round((A.from.time - A.from.planned) / 60000);
    if (d >= 5) return { kind: 'delay', leg: A, delay: d, at: A.from, key: 'd' + Math.min(3, Math.floor(d / 5)) };
  }
  return null;
}

const placeParam = (p) => (p.id && !String(p.id).includes(',') && p.src !== 'device' ? p.id : p.lat.toFixed(6) + ',' + p.lon.toFixed(6));

async function alternatives(j, p, now) {
  if (p.kind === 'delay') return [];
  const from = p.at, time = Math.max(now, p.kind === 'miss' ? p.prev.to.time : now);
  const res = await api('/plan', { fromPlace: placeParam(from), toPlace: placeParam(j.to), time: new Date(time).toISOString().replace(/\.\d{3}Z$/, 'Z'), numItineraries: 3, language: 'de' });
  return (res.itineraries || []).map((it) => ({
    dep: ms(it.startTime), arr: ms(it.endTime),
    lines: (it.legs || []).filter((l) => l.mode !== 'WALK').map((l) => ({ name: l.displayName || l.routeShortName || '', mode: l.mode === 'TRAM' ? 'tram' : l.mode === 'BUS' ? 'bus' : 'rail' }))
  })).filter((a) => a.dep >= time - 60000).sort((a, b) => a.arr - b.arr);
}

function texts(p, alts) {
  const a = alts && alts[0];
  const alt = a ? ' Schnellste Alternative: ab ' + hm(a.dep) + ' mit ' + a.lines.map(lineTxt).join(' → ') + ', Ankunft ' + hm(a.arr) + '.' : '';
  if (p.kind === 'miss') return { title: 'Anschluss wird nicht erreicht', body: lineTxt(p.leg.line) + ' → ' + p.leg.headsign + ' ab ' + p.at.name + ' um ' + hm(p.leg.from.time) + ' ist nicht mehr zu schaffen (' + Math.max(1, Math.round(-p.slack / 60000)) + ' Min. zu knapp).' + alt };
  if (p.kind === 'cancel') return { title: 'Fahrt fällt aus', body: lineTxt(p.leg.line) + ' → ' + p.leg.headsign + ' fällt aus.' + alt };
  return { title: 'Verspätung', body: lineTxt(p.leg.line) + ' → ' + p.leg.headsign + ' fährt ' + p.delay + ' Min. später ab ' + p.at.name + ' (' + hm(p.leg.from.time) + ').' };
}

/** Eine überwachte Verbindung prüfen; false = entfernen */
async function checkWatch(env, id) {
  const raw = await env.WATCHES.get('w:' + id);
  if (!raw) return false;
  const w = JSON.parse(raw), j = w.j, now = Date.now();
  if (now > w.exp) { await env.WATCHES.delete('w:' + id); return false; }
  for (const l of j.legs) {
    if (l.walk || !l.tripId) continue;
    try {
      const stops = tripStops(await api('/trip', { tripId: l.tripId, language: 'de' }));
      const f = findStop(stops, l.from), t = findStop(stops, l.to);
      if (f) { l.from.time = f.dep || f.arr || l.from.time; l.from.cancelled = f.cancelled; }
      if (t) { l.to.time = t.arr || t.dep || l.to.time; l.to.cancelled = t.cancelled; }
    } catch (e) { /* nächster Versuch in einer Minute */ }
  }
  const p = findProblem(j, now);
  if (!p || w.notified[p.key]) return true;
  const alts = await alternatives(j, p, now).catch(() => []);
  const msg = texts(p, alts);
  const target = p.kind === 'delay' ? null : { f: { id: p.at.id, name: p.at.name, lat: p.at.lat, lon: p.at.lon }, to: j.to, t: Math.max(now, p.kind === 'miss' ? p.prev.to.time : now) };
  const url = target ? './?alt=' + encodeURIComponent(JSON.stringify(target)) : './';
  const status = await sendPush(w.sub, { title: msg.title, body: msg.body, tag: 'muvit-' + id.slice(0, 8) + '-' + p.key, url }, vapid(env)).catch(() => 0);
  if (status === 404 || status === 410) { await env.WATCHES.delete('w:' + id); return false; }
  w.notified[p.key] = true;
  await env.WATCHES.put('w:' + id, JSON.stringify(w), { expirationTtl: ttlOf(w.exp) });
  return true;
}

/** Push-Routen: GET /vapid, POST /watch, DELETE /watch/:id – null, wenn die Route nicht passt */
export async function pushRoute(req, env, url, h) {
  if (url.pathname === '/vapid') return json({ publicKey: env.VAPID_PUBLIC || null }, h);
  if (url.pathname === '/watch' && req.method === 'POST') {
    if (!env.WATCHES || !env.VAPID_PRIVATE) return json({ error: 'Push ist auf diesem Dienst nicht eingerichtet' }, h, 503);
    const b = await req.json();
    if (!validSub(b.subscription) || !b.journey || !Array.isArray(b.journey.legs) || !b.journey.to) return json({ error: 'Ungültige Anfrage' }, h, 400);
    const id = crypto.randomUUID();
    const exp = Math.max(Date.now() + 5 * 60000, Number(b.journey.arr) + 30 * 60000);
    await env.WATCHES.put('w:' + id, JSON.stringify({ sub: b.subscription, j: b.journey, notified: {}, exp }), { expirationTtl: ttlOf(exp) });
    const ids = await getIndex(env);
    ids.push(id);
    await setIndex(env, ids.slice(-200));
    await sendPush(b.subscription, { title: 'Muvit', body: 'Verbindung wird überwacht – auch wenn Muvit geschlossen ist.', tag: 'muvit-on', url: './' }, vapid(env)).catch(() => 0);
    return json({ id }, h);
  }
  const m = url.pathname.match(/^\/watch\/([0-9a-f-]{36})$/);
  if (m && req.method === 'DELETE') {
    if (!env.WATCHES) return json({ ok: true }, h);
    await env.WATCHES.delete('w:' + m[1]);
    await setIndex(env, (await getIndex(env)).filter((x) => x !== m[1]));
    return json({ ok: true }, h);
  }
  return null;
}

/** Cron: jede Minute alle überwachten Verbindungen prüfen */
export async function pushCron(env) {
  if (!env.WATCHES || !env.VAPID_PRIVATE) return;
  const ids = await getIndex(env);
  if (!ids.length) return;
  const alive = [];
  for (const id of ids) if (await checkWatch(env, id).catch(() => true)) alive.push(id);
  if (alive.length !== ids.length) await setIndex(env, alive);
}

export { findProblem, tripStops, texts };
