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

/** Aktuelle Störungsmeldungen (HIM) – nur Magdeburg / MVB */
const MDRE = /magdeburg|\bmvb\b|magdeburger verkehrsbetriebe|biederitz/i;
export async function remarks(env) {
  const now = Date.now();
  const r = await nv(env).remarks({ results: 300, from: now, to: now + 3 * 86400000, language: 'de' });
  const list = Array.isArray(r) ? r : r.remarks || [];
  const near = (w) => [].concat((w.edges || []).map((e) => e.fromLocation), (w.edges || []).map((e) => e.toLocation), (w.events || []).map((e) => e.fromLocation))
    .some((l) => l && inMd(l.location || l));
  return {
    remarks: list.filter((w) => MDRE.test([w.summary, w.text, w.company].join(' ')) || (w.affectedLines || []).some((l) => MDRE.test((l.operator && l.operator.name) || '')) || near(w))
      .map((w) => ({
        id: w.id, summary: w.summary || '', text: w.text || '', priority: w.priority != null ? w.priority : null,
        validFrom: w.validFrom || null, validUntil: w.validUntil || null, modified: w.modified || null,
        lines: (w.affectedLines || []).map((l) => ({ name: l.name || '', product: l.product || '' })),
        stops: Array.from(new Set([].concat((w.edges || []).map((e) => e.fromLocation && e.fromLocation.name), (w.events || []).map((e) => e.fromLocation && e.fromLocation.name)).filter(Boolean)))
      }))
      .sort((a, b) => (b.priority || 0) - (a.priority || 0))
  };
}
