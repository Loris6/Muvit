/* Muvit-Dienst – Nahverkehr Magdeburg über INSA (Nahverkehrsservice Sachsen-Anhalt). Die MVB liefert ihre
   Echtzeit dorthin: Abfahrten mit Verspätung und Ausfällen, Fahrtverläufe mit Hinweisen (z. B. „Fahrt wird als
   Linie … fortgesetzt“) und aktuelle Störungsmeldungen. Abfragen über hafas-client (Profil „insa“). */
import { createClient } from 'hafas-client';
import { profile as insa } from 'hafas-client/p/insa/index.js';
import { UA, normName, inMd } from './util.mjs';

let client = null, clientKey = null;
function nv(env) {
  const key = env.INSA_ENDPOINT || '';
  if (client && clientKey === key) return client;
  client = createClient(env.INSA_ENDPOINT ? { ...insa, endpoint: env.INSA_ENDPOINT } : insa, UA);
  clientKey = key;
  return client;
}
export const _setClient = (c) => { client = c; clientKey = ''; };

const nRemark = (r) => ({ type: r.type || 'hint', code: r.code || null, summary: r.summary || null, text: r.text || '' });
const nLine = (l) => (l ? { name: l.name || '', productName: l.productName || '', product: l.product || '', fahrtNr: l.fahrtNr || '', operator: (l.operator && l.operator.name) || '' } : null);

/** INSA-Haltestelle zu einer Muvit-Haltestelle (Name + Koordinaten) */
export async function stop(env, q) {
  const c = nv(env);
  const want = normName(q.name);
  let list = [];
  if (q.lat && q.lon) list = await c.nearby({ type: 'location', latitude: +q.lat, longitude: +q.lon }, { results: 8, distance: 400, language: 'de' }).catch(() => []);
  if (!list.length && q.name) list = await c.locations('Magdeburg ' + q.name, { results: 6, addresses: false, poi: false, language: 'de' }).catch(() => []);
  list = list.filter((s) => s && s.id && (s.type === 'stop' || s.type === 'station'));
  const best = list.find((s) => want && normName(s.name) === want) || list.find((s) => want && (normName(s.name).includes(want) || want.includes(normName(s.name)))) || list[0];
  return best ? { id: best.id, name: best.name, location: best.location || null } : null;
}

export async function departures(env, q) {
  const r = await nv(env).departures(q.stop, { when: q.when ? new Date(q.when) : new Date(), duration: Math.min(240, +(q.duration || 90)), remarks: true, language: 'de' });
  const list = Array.isArray(r) ? r : r.departures || [];
  return {
    departures: list.map((d) => ({
      tripId: d.tripId, when: d.when, plannedWhen: d.plannedWhen, delay: d.delay != null ? d.delay : null,
      platform: d.platform || null, plannedPlatform: d.plannedPlatform || null, cancelled: !!d.cancelled,
      direction: d.direction || '', line: nLine(d.line), remarks: (d.remarks || []).map(nRemark).filter((x) => x.text || x.summary)
    }))
  };
}

export async function trip(env, q) {
  const r = await nv(env).trip(q.id, { stopovers: true, remarks: true, polyline: false, language: 'de' });
  const t = r.trip || r;
  return {
    trip: {
      id: t.id, line: nLine(t.line), direction: t.direction || '', cancelled: !!t.cancelled,
      remarks: (t.remarks || []).map(nRemark).filter((x) => x.text || x.summary),
      stopovers: (t.stopovers || []).map((s) => ({
        stop: s.stop && { id: s.stop.id, name: s.stop.name, location: s.stop.location || null },
        arrival: s.arrival, plannedArrival: s.plannedArrival, arrivalDelay: s.arrivalDelay != null ? s.arrivalDelay : null,
        departure: s.departure, plannedDeparture: s.plannedDeparture, departureDelay: s.departureDelay != null ? s.departureDelay : null,
        platform: s.departurePlatform || s.arrivalPlatform || null, cancelled: !!s.cancelled,
        remarks: (s.remarks || []).map(nRemark).filter((x) => x.text || x.summary)
      }))
    }
  };
}

/** Aktuelle Störungsmeldungen (HIM) – nur MVB bzw. Magdeburg. INSA meldet für ganz Sachsen-Anhalt, deshalb:
    1. betroffene Linie der MVB → ja
    2. sonst: Orte der Meldung mit Koordinaten → ja, wenn einer im Bediengebiet liegt
    3. ohne Linien und Orte: nur, wenn der Text Magdeburg oder die MVB nennt („Magdeburger Straße“ in Halle zählt nicht) */
const MVB = /\bMVB\b|Magdeburger Verkehrsbetriebe/i;
const MD_TEXT = /\bMagdeburg(?!er\s+(?:Str|Straße|Platz|Chaussee|Allee|Weg|Tor))\b|\bMVB\b|Magdeburger Verkehrsbetriebe|\bBiederitz\b/i;
/** Koordinaten aus geparsten (location) oder rohen HAFAS-Orten (crd in Mikrograd) */
const coord = (l) => {
  if (!l) return null;
  if (l.location && l.location.latitude != null) return l.location;
  if (l.latitude != null) return l;
  if (l.crd && l.crd.x != null) return { latitude: l.crd.y / 1e6, longitude: l.crd.x / 1e6 };
  return null;
};
const opName = (l) => (l && l.operator && (l.operator.name || l.operator.id)) || '';
function places(w) {
  return [].concat(
    (w.edges || []).flatMap((e) => [e.fromLocation, e.toLocation]),
    (w.events || []).flatMap((e) => [e.fromLocation, e.toLocation]),
    w.fromStops || [], w.toStops || []
  ).filter(Boolean);
}
export function relevant(w) {
  const lines = w.affectedLines || [];
  if (lines.some((l) => MVB.test(opName(l)))) return 'mvb';
  const pts = places(w).map(coord).filter(Boolean);
  if (pts.length) return pts.some(inMd) ? 'ort' : null;
  if (lines.length && lines.some((l) => opName(l))) return null;
  return MD_TEXT.test([w.summary, w.text, w.company].join(' ')) ? 'text' : null;
}
export async function remarks(env) {
  const now = Date.now();
  const r = await nv(env).remarks({ results: 300, from: now, to: now + 3 * 86400000, language: 'de' });
  const list = Array.isArray(r) ? r : r.remarks || [];
  return {
    remarks: list.map((w) => ({ w, why: relevant(w) })).filter((x) => x.why)
      .map(({ w, why }) => ({
        id: w.id, summary: w.summary || '', text: w.text || '', priority: w.priority != null ? w.priority : null,
        validFrom: w.validFrom || null, validUntil: w.validUntil || null, modified: w.modified || null, why,
        lines: Array.from(new Map((w.affectedLines || []).filter((l) => l.name).map((l) => [l.product + '|' + l.name, { name: l.name, product: l.product || '' }])).values()),
        stops: Array.from(new Set(places(w).map((l) => l.name).filter(Boolean)))
      }))
      .sort((a, b) => (b.priority || 0) - (a.priority || 0))
  };
}
