/* Muvit-Dienst – Deutsche Bahn (bahn.de) für Züge: Abfahrten mit Meldungen, Fahrtverlauf, Bahnhof (EVA), Wagenreihung.
   Abfragen über db-vendo-client (Profil „dbweb“, dieselben Schnittstellen wie bahn.de). */
import { createClient } from 'db-vendo-client';
import { profile as dbweb } from 'db-vendo-client/p/dbweb/index.js';
import { UA, num, normName, pick } from './util.mjs';

let client = null, clientKey = null;
/** env.DBWEB_BASE / env.BAHN_WWW leiten die Abfragen im Test auf einen lokalen Server um */
function db(env) {
  const key = env.DBWEB_BASE || '';
  if (client && clientKey === key) return client;
  let p = dbweb;
  if (env.DBWEB_BASE) {
    p = { ...dbweb };
    for (const k of Object.keys(p)) if (typeof p[k] === 'string' && p[k].startsWith('https://int.bahn.de')) p[k] = p[k].replace('https://int.bahn.de', env.DBWEB_BASE);
  }
  client = createClient(p, UA, { enrichStations: false });
  clientKey = key;
  return client;
}
export const _setClient = (c) => { client = c; clientKey = ''; };

const nRemark = (r) => ({ type: r.type || 'hint', code: r.code || null, summary: r.summary || null, text: r.text || '' });
const nLine = (l) => (l ? { name: l.name || '', productName: l.productName || '', product: l.product || '', fahrtNr: l.fahrtNr || '', adminCode: l.adminCode || '', operator: (l.operator && l.operator.name) || '' } : null);

/** Bahnhof der DB (EVA-Nummer) zu einer Haltestelle: zuerst in der Nähe, sonst über den Namen */
export async function station(env, q) {
  const c = db(env);
  const want = normName(q.name);
  let list = [];
  if (q.lat && q.lon) {
    list = await c.nearby({ type: 'location', latitude: +q.lat, longitude: +q.lon }, { results: 8, distance: 600, language: 'de' }).catch(() => []);
  }
  if (!list.length && q.name) list = await c.locations(q.name, { results: 6, addresses: false, poi: false, language: 'de' }).catch(() => []);
  list = list.filter((s) => s && s.id && (s.type === 'stop' || s.type === 'station'));
  const best = list.find((s) => want && normName(s.name) === want) || list.find((s) => want && (normName(s.name).includes(want) || want.includes(normName(s.name)))) || list[0];
  return best ? { id: best.id, name: best.name, location: best.location || null } : null;
}

/** Abfahrten eines Bahnhofs mit Gleis, Verspätung und Meldungen (z. B. „Verspätung aus vorheriger Fahrt“) */
export async function departures(env, q) {
  const r = await db(env).departures(q.eva, { when: q.when ? new Date(q.when) : new Date(), duration: Math.min(240, +(q.duration || 120)), remarks: true, language: 'de' });
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
  const r = await db(env).trip(q.id, { stopovers: true, remarks: true, polyline: false, language: 'de' });
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
  if (!res.ok) throw new Error('Wagenreihung nicht verfügbar (' + res.status + ')');
  return normalizeSequence(await res.json());
}
