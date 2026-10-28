/* Muvit-Dienst – IRIS, die Abfahrtstafel der DB (iris.noncd.db.de). Liefert zu jedem Zug am Bahnhof die Gründe für
   Verspätungen („Verspätung aus vorheriger Fahrt“), Qualitätshinweise („Abweichende Wagenreihung“), Gleiswechsel und
   Ausfälle. Antworten sind XML; gelesen werden nur die nötigen Attribute. */
import { UA } from './util.mjs';

const BASE = 'https://iris.noncd.db.de/iris-tts/timetable';
/** Meldungscodes der DB (Verspätungsgründe und Qualität) */
const CODES = {
  1: 'Nähere Informationen in Kürze', 2: 'Polizeiliche Ermittlung', 3: 'Feuerwehreinsatz neben der Strecke', 4: 'Kurzfristiger Personalausfall',
  5: 'Ärztliche Versorgung eines Fahrgastes', 6: 'Betätigen der Notbremse', 7: 'Unbefugte Personen auf der Strecke', 8: 'Notarzteinsatz auf der Strecke',
  9: 'Streikauswirkungen', 10: 'Tiere auf der Strecke', 11: 'Unwetter', 12: 'Warten auf ein verspätetes Schiff', 13: 'Pass- und Zollkontrolle',
  14: 'Defekt am Bahnhof', 15: 'Beeinträchtigung durch Vandalismus', 16: 'Entschärfung einer Fliegerbombe', 17: 'Beschädigung einer Brücke',
  18: 'Umgestürzter Baum auf der Strecke', 19: 'Unfall an einem Bahnübergang', 20: 'Tiere im Gleis', 21: 'Warten auf Anschlussreisende',
  22: 'Witterungsbedingte Beeinträchtigung', 23: 'Feuerwehreinsatz auf Bahngelände', 24: 'Verspätung im Ausland', 25: 'Bereitstellung weiterer Wagen',
  26: 'Abhängen von Wagen', 28: 'Gegenstände auf der Strecke', 29: 'Ersatzverkehr mit Bus ist eingerichtet', 31: 'Bauarbeiten',
  32: 'Verzögerung beim Ein-/Ausstieg', 33: 'Reparatur an der Oberleitung', 34: 'Reparatur an einem Signal', 35: 'Streckensperrung',
  36: 'Reparatur am Zug', 37: 'Reparatur an einem Wagen', 38: 'Reparatur an der Strecke', 39: 'Anhängen von zusätzlichen Wagen',
  40: 'Defektes Stellwerk', 41: 'Technische Störung an einem Bahnübergang', 42: 'Außerplanmäßige Geschwindigkeitsbeschränkung',
  43: 'Verspätung eines vorausfahrenden Zuges', 44: 'Warten auf einen entgegenkommenden Zug', 45: 'Überholung durch anderen Zug',
  46: 'Warten auf freie Einfahrt', 47: 'Verspätete Bereitstellung des Zuges', 48: 'Verspätung aus vorheriger Fahrt', 49: 'Kurzfristiger Personalausfall',
  50: 'Kurzfristige Erkrankung von Personal', 51: 'Verspätetes Personal aus vorheriger Fahrt', 52: 'Streik', 53: 'Unwetterauswirkungen',
  54: 'Verfügbarkeit der Gleise derzeit eingeschränkt', 55: 'Technische Störung an einem anderen Zug', 56: 'Warten auf Fahrgäste aus einem Bus',
  57: 'Zusätzlicher Halt zum Ein-/Ausstieg', 58: 'Umleitung des Zuges', 59: 'Schnee und Eis', 60: 'Witterungsbedingt verminderte Geschwindigkeit',
  61: 'Defekte Tür', 62: 'Behobene technische Störung am Zug', 63: 'Technische Untersuchung am Zug', 64: 'Reparatur an der Weiche', 65: 'Erdrutsch',
  66: 'Hochwasser', 67: 'Behördliche Maßnahme', 68: 'Hohes Reisendenaufkommen verlängert Ein- und Ausstieg', 69: 'Zug verkehrt mit verminderter Geschwindigkeit',
  70: 'WLAN nicht verfügbar', 71: 'WLAN in einzelnen Wagen nicht verfügbar', 72: 'Info-/Entertainment nicht verfügbar', 73: 'Heute: Mehrzweckabteil vorne',
  74: 'Heute: Mehrzweckabteil hinten', 75: 'Heute: 1. Klasse vorne', 76: 'Heute: 1. Klasse hinten', 77: 'Ohne 1. Klasse', 79: 'Ohne Mehrzweckabteil',
  80: 'Abweichende Wagenreihung', 82: 'Mehrere Wagen fehlen', 83: 'Störung der fahrzeuggebundenen Einstiegshilfe', 84: 'Zug verkehrt richtig gereiht',
  85: 'Ein Wagen fehlt', 86: 'Gesamter Zug ohne Reservierung', 87: 'Einzelne Wagen ohne Reservierung', 89: 'Reservierungen sind wieder vorhanden',
  90: 'Kein gastronomisches Angebot', 91: 'Fahrradmitnahme nicht möglich', 92: 'Eingeschränkte Fahrradbeförderung', 93: 'Behindertengerechte Einrichtung fehlt',
  94: 'Ersatzbewirtschaftung', 95: 'Universal-WC fehlt', 96: 'Der Zug ist stark ausgelastet', 97: 'Der Zug ist ausgelastet', 98: 'Sonstige Qualitätsmängel',
  99: 'Verzögerungen im Betriebsablauf'
};
// „Keine Qualitätsmängel“ (88) und „Zug verkehrt richtig gereiht“ (84) heben frühere Hinweise auf – nicht anzeigen
const SILENT = new Set([84, 88, 89]);

const attrs = (tag) => { const o = {}; tag.replace(/([\w-]+)="([^"]*)"/g, (all, k, v) => { o[k] = v; return ''; }); return o; };
const firstTag = (xml, name) => { const m = xml.match(new RegExp('<' + name + '\\b[^>]*>')); return m ? attrs(m[0]) : null; };
/** IRIS-Zeit „yymmddHHMM“ (Ortszeit Berlin) → Date */
function irisTime(s) {
  if (!s || s.length < 10) return null;
  const iso = '20' + s.slice(0, 2) + '-' + s.slice(2, 4) + '-' + s.slice(4, 6) + 'T' + s.slice(6, 8) + ':' + s.slice(8, 10) + ':00';
  const guess = new Date(iso + 'Z');
  // Versatz Berlin ↔ UTC zu diesem Zeitpunkt
  const berlin = new Date(guess.toLocaleString('en-US', { timeZone: 'Europe/Berlin' }));
  const utc = new Date(guess.toLocaleString('en-US', { timeZone: 'UTC' }));
  return new Date(guess.getTime() - (berlin - utc));
}
const ymdh = (d) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', year: '2-digit', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' })
    .formatToParts(d).map((x) => [x.type, x.value]));
  return { day: p.year + p.month + p.day, hour: p.hour };
};

async function get(path, ttl) {
  const res = await fetch(BASE + path, { headers: { Accept: 'application/xml', 'User-Agent': UA }, cf: { cacheTtl: ttl, cacheEverything: true } });
  if (res.status === 404) return '';
  if (!res.ok) throw new Error('IRIS ' + res.status);
  return res.text();
}
function blocks(xml) {
  const out = [];
  xml.replace(/<s\b([^>]*?)(\/>|>([\s\S]*?)<\/s>)/g, (all, a, end, inner) => { out.push({ a: attrs(a), inner: inner || '' }); return ''; });
  return out;
}

const STATIONS = new Map();
/** EVA-Nummer eines Bahnhofs über den Namen (z. B. „Magdeburg Hbf“) */
export async function station(name) {
  const key = String(name || '').trim();
  if (!key) return null;
  if (STATIONS.has(key)) return STATIONS.get(key);
  const xml = await get('/station/' + encodeURIComponent(key), 86400);
  const st = firstTag(xml, 'station');
  const r = st && st.eva ? { eva: st.eva, name: st.name } : null;
  STATIONS.set(key, r);
  return r;
}

/** Züge eines Bahnhofs mit Plan und Änderungen: Zugnummer, Gattung, Abfahrt laut Plan, Gleise, Ausfall, Meldungen */
export async function board(eva, from, minutes) {
  const hours = new Set();
  for (let t = from.getTime(); t <= from.getTime() + minutes * 60000; t += 3600000) { const x = ymdh(new Date(t)); hours.add(x.day + '/' + x.hour); }
  const [plans, fchg] = await Promise.all([
    Promise.all(Array.from(hours).slice(0, 4).map((h) => get('/plan/' + eva + '/' + h, 3600).catch(() => ''))),
    get('/fchg/' + eva, 30).catch(() => '')
  ]);
  const trains = new Map();
  plans.forEach((xml) => blocks(xml).forEach((b) => {
    const tl = firstTag(b.inner, 'tl') || {}, dp = firstTag(b.inner, 'dp');
    if (!dp || !dp.pt) return;
    trains.set(b.a.id, { id: b.a.id, category: tl.c || '', number: tl.n || '', line: dp.l || '', planned: irisTime(dp.pt), platform: dp.pp || '', changedPlatform: '', cancelled: false, messages: [] });
  }));
  blocks(fchg).forEach((b) => {
    const t = trains.get(b.a.id);
    if (!t) return;
    const dp = firstTag(b.inner, 'dp') || {};
    if (dp.cp) t.changedPlatform = dp.cp;
    if (dp.cs === 'c') t.cancelled = true;
    if (dp.ct) t.changed = irisTime(dp.ct);
    const seen = new Map();
    (b.inner.match(/<m\b[^>]*>/g) || []).map(attrs).forEach((m) => {
      if ((m.t !== 'd' && m.t !== 'q') || !m.c) return;
      const c = +m.c, prev = seen.get(c);
      if (!prev || (m.ts || '') > (prev.ts || '')) seen.set(c, m);
    });
    // nach Zeit sortiert, neueste zuerst; Qualitätsmeldungen nach den Verspätungsgründen
    t.messages = Array.from(seen.values()).sort((x, y) => (x.t === y.t ? (y.ts || '').localeCompare(x.ts || '') : x.t === 'd' ? -1 : 1))
      .filter((m) => !SILENT.has(+m.c) && CODES[+m.c]).map((m) => ({ type: m.t === 'd' ? 'status' : 'hint', code: 'iris-' + m.c, summary: CODES[+m.c], text: CODES[+m.c] }));
  });
  return Array.from(trains.values());
}

/** Abfahrten (beliebiger Quelle) mit IRIS ergänzen: Meldungen, Ausfall, Gleiswechsel. Zuordnung über Zugnummer und Planzeit. */
export function merge(departures, trains) {
  departures.forEach((d) => {
    const nr = d.line && (d.line.fahrtNr || (String(d.line.name).match(/\d{3,5}$/) || [])[0]);
    const pw = d.plannedWhen ? new Date(d.plannedWhen).getTime() : null;
    if (!nr || !pw) return;
    const t = trains.find((x) => x.number === String(nr) && x.planned && Math.abs(x.planned - pw) <= 120000);
    if (!t) return;
    const have = new Set((d.remarks || []).map((r) => r.summary || r.text));
    d.remarks = t.messages.filter((m) => !have.has(m.summary)).concat(d.remarks || []);
    if (t.cancelled) d.cancelled = true;
    if (t.changedPlatform && !d.platform) d.platform = t.changedPlatform;
    if (!d.plannedPlatform && t.platform) d.plannedPlatform = t.platform;
  });
  return departures;
}
export { irisTime as _irisTime };
