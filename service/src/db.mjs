/* Muvit-Dienst – Deutsche Bahn für Züge: Abfahrten mit Meldungen, Fahrtverlauf, Bahnhof (EVA), Wagenreihung.
   Quellen der Reihe nach (die zuletzt erfolgreiche zuerst), damit eine gesperrte Schnittstelle nicht alles lahmlegt:
   1. bahn.de (db-vendo-client, Profil „dbweb“)
   2. DB Navigator (db-vendo-client, Profil „dbnav“)
   3. INSA (hafas-client, Profil „insa“) – enthält alle Züge mit Echtzeit der DB
   4. db.transport.rest (öffentliche REST-Schnittstelle, gleiches Datenformat)
   Gesperrte oder langsame Quellen werden 10 Minuten übersprungen. */
import { createClient } from 'db-vendo-client';
import { profile as dbweb } from 'db-vendo-client/p/dbweb/index.js';
import { profile as dbnav } from 'db-vendo-client/p/dbnav/index.js';
import { UA, num, normName, pick } from './util.mjs';
import { insaClient } from './nv.mjs';

const PROFILES = { dbweb, dbnav };
const clients = {};
let preferred = null;
/** env.DBWEB_BASE leitet bahn.de im Test auf einen lokalen Server um */
function db(env, name) {
  const key = name + '|' + (env.DBWEB_BASE || '');
  if (clients[key]) return clients[key];
  let p = PROFILES[name];
  if (name === 'dbweb' && env.DBWEB_BASE) {
    p = { ...p };
    for (const k of Object.keys(p)) if (typeof p[k] === 'string' && p[k].startsWith('https://int.bahn.de')) p[k] = p[k].replace('https://int.bahn.de', env.DBWEB_BASE);
  }
  clients[key] = createClient(p, UA, { enrichStations: false });
  return clients[key];
}
/** db.transport.rest im selben Format wie db-vendo-client */
function rest(env) {
  const base = env.DB_REST || 'https://v6.db.transport.rest';
  const get = async (path, params) => {
    const res = await fetch(base + path + '?' + new URLSearchParams(pick(params || {})), { headers: { Accept: 'application/json', 'User-Agent': UA } });
    if (!res.ok) throw new Error('db.transport.rest ' + res.status);
    return res.json();
  };
  return {
    nearby: (loc, o) => get('/locations/nearby', { latitude: loc.latitude, longitude: loc.longitude, results: o.results, distance: o.distance, language: 'de' }),
    locations: (q, o) => get('/locations', { query: q, results: o.results, addresses: false, poi: false, language: 'de' }),
    departures: (id, o) => get('/stops/' + encodeURIComponent(id) + '/departures', { when: o.when.toISOString(), duration: o.duration, remarks: true, language: 'de' }),
    trip: (id) => get('/trips/' + encodeURIComponent(id), { stopovers: true, remarks: true, polyline: false, language: 'de' })
  };
}
let testClient = null;
export const _setClient = (c) => { testClient = c; };
const errText = (e) => String((e && (e.message || e.code)) || e || 'Fehler').slice(0, 160);

const SOURCES = ['dbweb', 'dbnav', 'insa', 'rest'];
const down = {};
const SKIP = 10 * 60000, TIMEOUT = 6000;
const withTimeout = (p) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('Zeitüberschreitung')), TIMEOUT))]);
const clientFor = (env, name) => (name === 'rest' ? rest(env) : name === 'insa' ? insaClient(env) : db(env, name));

/** Abfrage über die Quellen der Reihe nach; liefert das erste brauchbare Ergebnis.
    Mit „allowNull“: Haben Quellen geantwortet, aber nichts gefunden, ist das Ergebnis null statt eines Fehlers. */
async function tryAll(env, fn, allowNull) {
  if (testClient) return fn(testClient, 'test');
  const names = String(env.DB_SOURCES || SOURCES.join(',')).split(',').map((x) => x.trim()).filter((x) => SOURCES.includes(x));
  const now = Date.now();
  const up = names.filter((n) => !(down[n] && now - down[n] < SKIP));
  const list = up.length ? up : names;
  const order = preferred && list.includes(preferred) ? [preferred].concat(list.filter((n) => n !== preferred)) : list;
  const errs = [];
  let answered = false;
  for (const name of order) {
    try {
      const r = await withTimeout(fn(clientFor(env, name), name));
      delete down[name];
      if (r != null) { preferred = name; return r; }
      answered = true;
      errs.push(name + ': nichts gefunden');
    } catch (e) { down[name] = Date.now(); errs.push(name + ': ' + errText(e)); }
  }
  if (allowNull && answered) return null;
  const err = new Error('Deutsche Bahn: ' + errs.join(' · '));
  err.code = 'DB_UNAVAILABLE';
  throw err;
}
/** Welche Quelle zuletzt geantwortet hat (für /health) */
export const source = () => preferred;

const nRemark = (r) => ({ type: r.type || 'hint', code: r.code || null, summary: r.summary || null, text: r.text || '' });
const nLine = (l) => (l ? { name: l.name || '', productName: l.productName || '', product: l.product || '', fahrtNr: l.fahrtNr || '', adminCode: l.adminCode || '', operator: (l.operator && l.operator.name) || '' } : null);

/** Bahnhof der DB (EVA-Nummer) zu einer Haltestelle: zuerst in der Nähe, sonst über den Namen. null = nicht gefunden */
export async function station(env, q) {
  const want = normName(q.name);
  const pickBest = (list) => {
    list = (list || []).filter((s) => s && s.id && (s.type === 'stop' || s.type === 'station'));
    const best = list.find((s) => want && normName(s.name) === want) || list.find((s) => want && (normName(s.name).includes(want) || want.includes(normName(s.name)))) || list[0];
    return best ? { id: best.id, name: best.name, location: best.location || null } : null;
  };
  return tryAll(env, async (c) => {
    let best = null;
    if (q.lat && q.lon) best = pickBest(await c.nearby({ type: 'location', latitude: +q.lat, longitude: +q.lon }, { results: 8, distance: 600, language: 'de' }));
    if (!best && q.name) best = pickBest(await c.locations(q.name, { results: 6, addresses: false, poi: false, language: 'de' }));
    return best;
  }, true);
}

/** Abfahrten eines Bahnhofs mit Gleis, Verspätung und Meldungen (z. B. „Verspätung aus vorheriger Fahrt“) */
export async function departures(env, q) {
  const r = await tryAll(env, (c) => c.departures(q.eva, { when: q.when ? new Date(q.when) : new Date(), duration: Math.min(240, +(q.duration || 120)), remarks: true, language: 'de' }));
  const list = Array.isArray(r) ? r : r.departures || [];
  return {
    departures: list.map((d) => ({
      tripId: d.tripId, when: d.when, plannedWhen: d.plannedWhen, delay: d.delay != null ? d.delay : null,
      platform: d.platform || null, plannedPlatform: d.plannedPlatform || null, cancelled: !!d.cancelled,
      direction: d.direction || '', line: nLine(d.line), remarks: (d.remarks || []).map(nRemark).filter((x) => x.text || x.summary)
    }))
  };
}

/** Fahrtverlauf eines Zuges mit Echtzeit und Meldungen je Halt */
export async function trip(env, q) {
  const r = await tryAll(env, (c) => c.trip(q.id, { stopovers: true, remarks: true, polyline: false, language: 'de' }));
  const t = r.trip || r;
  return {
    trip: {
      id: t.id, line: nLine(t.line), direction: t.direction || '', cancelled: !!t.cancelled,
      remarks: (t.remarks || []).map(nRemark).filter((x) => x.text || x.summary),
      stopovers: (t.stopovers || []).map((s) => ({
        stop: s.stop && { id: s.stop.id, name: s.stop.name, location: s.stop.location || null },
        arrival: s.arrival, plannedArrival: s.plannedArrival, arrivalDelay: s.arrivalDelay != null ? s.arrivalDelay : null,
        departure: s.departure, plannedDeparture: s.plannedDeparture, departureDelay: s.departureDelay != null ? s.departureDelay : null,
        platform: s.departurePlatform || s.arrivalPlatform || null, plannedPlatform: s.plannedDeparturePlatform || s.plannedArrivalPlatform || null,
        cancelled: !!s.cancelled, remarks: (s.remarks || []).map(nRemark).filter((x) => x.text || x.summary)
      }))
    }
  };
}

/* ---------------- Wagenreihung (bahn.de „vehicle-sequence“) ---------------- */
/** Antwort tolerant lesen – Felder fehlen je nach Zug und Bahnhof */
export function normalizeSequence(d) {
  if (!d || typeof d !== 'object') return { available: false };
  const pf = d.platform || {};
  const sectors = (pf.sectors || []).map((s) => ({ name: s.name || s.sectorName || '', start: num(s.start), end: num(s.end) })).filter((s) => s.name);
  const vehicles = [];
  const groups = (d.groups || []).map((g, gi) => {
    (g.vehicles || []).forEach((v) => {
      const t = v.type || {};
      const cat = String(t.category || v.category || '').toUpperCase();
      const pos = v.platformPosition || {};
      const first = !!(t.hasFirstClass || /FIRST/.test(cat)), second = !!(t.hasEconomyClass || /ECONOMY|SECOND/.test(cat));
      vehicles.push({
        number: v.wagonIdentificationNumber != null && v.wagonIdentificationNumber !== '' ? String(v.wagonIdentificationNumber) : null,
        category: cat, construction: t.constructionType || '',
        first, second,
        dining: /DINING|BISTRO|RESTAURANT/.test(cat),
        engine: /LOCOMOTIVE|POWERCAR|TRACTION/.test(cat),
        doubleDeck: /DOUBLEDECK/.test(cat),
        sleeper: /SLEEPER|COUCHETTE/.test(cat),
        start: num(pos.start), end: num(pos.end), sector: pos.sector || null,
        closed: /CLOSED|LOCKED/.test(String(v.status || '').toUpperCase()),
        amenities: (v.amenities || []).filter((a) => a && a.type).map((a) => ({ type: String(a.type).toUpperCase(), status: a.status || null, amount: a.amount != null ? a.amount : null })),
        group: gi
      });
    });
    const tr = g.transport || {};
    return { name: g.name || '', category: tr.category || '', number: tr.number != null ? String(tr.number) : '', destination: (tr.destination && tr.destination.name) || '' };
  });
  vehicles.sort((a, b) => (a.start != null ? a.start : 0) - (b.start != null ? b.start : 0));
  // Fahrtrichtung, wenn angegeben (sonst unbekannt)
  const dir = String(d.direction || d.travelDirection || '').toUpperCase();
  return {
    available: vehicles.length > 0,
    platform: { name: pf.name || d.departurePlatform || '', start: num(pf.start), end: num(pf.end), sectors },
    plannedPlatform: d.departurePlatformSchedule || null,
    direction: /LEFT|LINKS/.test(dir) ? 'left' : /RIGHT|RECHTS/.test(dir) ? 'right' : null,
    vehicles, groups
  };
}
export async function wagenreihung(env, q) {
  const base = env.BAHN_WWW || 'https://www.bahn.de';
  const params = new URLSearchParams(pick({
    administrationId: q.admin || '80', category: q.category, date: q.date, evaNumber: q.eva, number: q.number, time: q.time
  }));
  const res = await fetch(base + '/web/api/reisebegleitung/wagenreihung/vehicle-sequence?' + params, { headers: { Accept: 'application/json', 'User-Agent': UA } });
  if (res.status === 204 || res.status === 404) return { available: false };
  if (!res.ok) throw new Error('Wagenreihung von bahn.de nicht verfügbar (' + res.status + ')');
  const type = res.headers.get('content-type') || '';
  if (!/json/.test(type)) throw new Error('Wagenreihung: unerwartete Antwort von bahn.de (' + (type.split(';')[0] || 'ohne Typ') + ')');
  return normalizeSequence(await res.json());
}
