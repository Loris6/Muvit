/* Muvit – Kern: Konfiguration, Hilfsfunktionen, Speicher, Events, Standort */
(function (M) {
  'use strict';

  M.CONFIG = {
    appName: 'Muvit',
    tz: 'Europe/Berlin',
    // Magdeburg (Alter Markt)
    center: { lat: 52.1316, lon: 11.6392 },
    zoom: 13.4,
    // Linienwechsel der MVB: Die Bahn kommt als eine Linie an und fährt als andere weiter (beide Richtungen).
    // Muvit lernt Wechsel selbst aus den Echtzeitdaten und den Hinweisen der MVB (M.LineChanges). Das hier sind nur
    // Vorgaben; unter Mehr → Einstellungen → Linienwechsel lassen sie sich abschalten und eigene ergänzen.
    lineChanges: [
      { a: '1', b: '5', at: 'City Carré' },
      { a: '2', b: '13', at: 'City Carré' }
    ],
    // Muvit-Dienst (echte DB- und MVB-Daten, Wagenreihung, Push): Adresse steht in config.json (GitHub-Action),
    // alternativ unter Einstellungen. Siehe service/README.md
    // Stadtgebiet Magdeburg (grob) – für Tarifhinweise
    mdBBox: { minLat: 52.03, maxLat: 52.235, minLon: 11.50, maxLon: 11.78 },
    /** Bediengebiet der MVB: Magdeburg mit Randgebieten und Biederitz (Heyrothsberge, Gerwisch) */
    serviceBBox: { minLat: 52.02, maxLat: 52.235, minLon: 11.47, maxLon: 11.80 },
    motisBase: 'https://api.transitous.org',
    dbBase: 'https://v6.db.transport.rest',
    styles: {
      light: 'https://tiles.openfreemap.org/styles/positron',
      dark: 'https://tiles.openfreemap.org/styles/dark'
    },
    glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
    sdkPath: 'js/vendor/anthropic-sdk.min.js',
    aiModels: [
      { id: 'claude-opus-5-5', label: 'Claude Opus 5.5 – beste Qualität' },
      { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5 – schnell & stark' },
      { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5 – am schnellsten' }
    ]
  };

  /** Muvit ist eine Magdeburg-App: „Magdeburg, Sudenburg“ → „Sudenburg“, „Magdeburg Hbf“ → „Hauptbahnhof“.
      Orte außerhalb (z. B. „Köln Hbf“) bleiben unverändert. */
  M.localName = function (name) {
    let n = String(name == null ? '' : name).trim();
    if (!n || /^magdeburg$/i.test(n)) return n;
    let m = n.match(/^Magdeburg(?:\s*,\s*|\s*-\s*|\s+)(.+)$/);
    if (m) n = m[1];
    else if ((m = n.match(/^(.+?)\s*(?:,\s*Magdeburg|\(Magdeburg\))$/))) n = m[1];
    else return n;
    return n.replace(/^Hbf\b/, 'Hauptbahnhof');
  };
  M.isMagdeburgName = (v) => /^magdeburg$/i.test(String(v || '').trim());
  // Akzente weg („Carré“ = „Carre“), nur Buchstaben und Ziffern
  const normName = (n) => M.localName(n || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9äöüß]/g, '');
  M.normStop = normName;

  /* ---------------- Linienwechsel ----------------
     Quellen (in dieser Reihenfolge maßgeblich):
     - own:     selbst eingetragen (Einstellungen → Linienwechsel)
     - insa:    Hinweis der MVB/INSA, z. B. „ab City Carré weiter als Linie 5“ (über den Muvit-Dienst)
     - data:    Echtzeitdaten: dasselbe Fahrzeug steht gleichzeitig als alte und neue Linie in der Abfahrtstafel
     - default: Vorgaben aus CONFIG.lineChanges
     Erkannte Wechsel gelten 14 Tage ab dem letzten Nachweis. Jeder Wechsel lässt sich abschalten. */
  const LC_KEY = 'lineChanges', LC_KEEP = 14 * 86400000, LC_RANK = { own: 0, insa: 1, data: 2, default: 3 };
  const lcLoad = () => Object.assign({ learned: [], own: [], off: [] }, M.store.get(LC_KEY, {}));
  const lcId = (r) => (r.mode || 'tram') + '|' + [String(r.a), String(r.b)].sort().join('-') + '@' + normName(r.at);
  let lcCache = null;
  M.LineChanges = {
    id: lcId,
    /** alle bekannten Wechsel (auch abgeschaltete), beste Quelle zuerst */
    all() {
      if (lcCache) return lcCache;
      const d = lcLoad(), now = Date.now(), seen = new Map();
      const add = (r, src) => { const k = lcId(r); if (!seen.has(k)) seen.set(k, Object.assign({ mode: 'tram' }, r, { id: k, src, off: d.off.includes(k) })); };
      d.own.forEach((r) => add(r, 'own'));
      d.learned.filter((r) => now - (r.seen || 0) < LC_KEEP && (r.src !== 'data' || (r.refs || []).length >= 2)).sort((a, b) => LC_RANK[a.src] - LC_RANK[b.src]).forEach((r) => add(r, r.src || 'data'));
      (M.CONFIG.lineChanges || []).forEach((r) => add(r, 'default'));
      lcCache = Array.from(seen.values());
      // Vorgaben treten zurück, sobald für eine ihrer Linien am selben Halt ein erkannter oder eigener Wechsel gilt
      lcCache.forEach((r) => {
        if (r.src !== 'default') return;
        const by = lcCache.find((x) => x.src !== 'default' && !x.off && (x.mode || 'tram') === (r.mode || 'tram') && normName(x.at) === normName(r.at) &&
          [x.a, x.b].some((n) => n === r.a || n === r.b));
        if (by) r.replaced = by.a + '↔' + by.b;
      });
      return lcCache;
    },
    active() { return this.all().filter((r) => !r.off && !r.replaced); },
    /** Wechsel aus den Daten merken. „ref“ = Fahrt, die ihn belegt: Aus den Echtzeitdaten erkannte Wechsel gelten erst,
        wenn zwei verschiedene Fahrten ihn zeigen (Hinweise der MVB sofort). */
    learn(a, b, at, mode, src, ref) {
      a = String(a || '').trim(); b = String(b || '').trim(); at = M.localName(String(at || '').trim());
      mode = mode || 'tram'; src = src || 'data';
      if (!a || !b || a === b || !at || (mode !== 'tram' && mode !== 'bus') || a.length > 4 || b.length > 4) return false;
      const d = lcLoad(), k = lcId({ a, b, at, mode }), now = Date.now();
      const hit = d.learned.find((x) => lcId(x) === k);
      const refs = ((hit && hit.refs) || []).slice();
      const newRef = !!ref && !refs.includes(String(ref));
      if (newRef) refs.unshift(String(ref));
      const better = !hit || LC_RANK[src] < LC_RANK[hit.src];
      if (hit && !newRef && !better && now - hit.seen < 30 * 60000) return false;
      d.learned = d.learned.filter((x) => lcId(x) !== k && now - (x.seen || 0) < LC_KEEP);
      d.learned.unshift({ a, b, at, mode, src: better ? src : hit.src, seen: now, first: (hit && hit.first) || now, refs: refs.slice(0, 5) });
      d.learned = d.learned.slice(0, 40);
      M.store.set(LC_KEY, d); lcCache = null;
      M.emit('linechanges');
      return true;
    },
    add(a, b, at, mode) {
      const d = lcLoad(), r = { a: String(a).trim(), b: String(b).trim(), at: M.localName(String(at).trim()), mode: mode || 'tram' };
      if (!r.a || !r.b || r.a === r.b || !r.at) return false;
      d.own = d.own.filter((x) => lcId(x) !== lcId(r)).concat(r);
      d.off = d.off.filter((x) => x !== lcId(r));
      M.store.set(LC_KEY, d); lcCache = null; M.emit('linechanges');
      return true;
    },
    remove(id) {
      const d = lcLoad();
      d.own = d.own.filter((x) => lcId(x) !== id);
      d.learned = d.learned.filter((x) => lcId(x) !== id);
      M.store.set(LC_KEY, d); lcCache = null; M.emit('linechanges');
    },
    setOn(id, on) {
      const d = lcLoad();
      d.off = d.off.filter((x) => x !== id).concat(on ? [] : [id]);
      M.store.set(LC_KEY, d); lcCache = null; M.emit('linechanges');
    }
  };
  const atMatch = (r, name) => { const n = normName(name), a = normName(r.at); return !!n && !!a && (n === a || n.includes(a)); };
  /** Wechsel-Haltestelle (z. B. City Carré, auch „City Carré/Hbf“)? Mit Linie: nur Wechsel dieser Linie */
  M.isChangeStop = (name, line) => M.LineChanges.active().some((r) => atMatch(r, name) && (!line || ((r.mode || 'tram') === line.mode && (r.a === line.name || r.b === line.name))));
  /** Gibt es für diese Linie überhaupt einen Wechsel? */
  M.hasLineChange = (line) => !!line && M.LineChanges.active().some((r) => (r.mode || 'tram') === line.mode && (r.a === line.name || r.b === line.name));
  /** Partnerlinie am Wechselhalt (z. B. 1 ↔ 5). Mit „at“ nur, wenn dort ein Wechsel für diese Linie bekannt ist. */
  M.partnerLine = (line, at) => {
    if (!line || !M.mkLine) return null;
    const r = M.LineChanges.active().find((x) => (x.mode || 'tram') === line.mode && (x.a === line.name || x.b === line.name) && (at == null || atMatch(x, at)));
    return r ? Object.assign(M.mkLine(r.a === line.name ? r.b : r.a, line.mode), { changeAt: r.at }) : null;
  };
  /** Erster Halt einer Fahrt (ab Index „from“), an dem diese Linie wechselt */
  M.changeIdx = (t, from, to) => {
    const n = t.stops.length, end = to == null ? n : to;
    for (let i = from == null ? 1 : from; i < end; i++) if (M.partnerLine(t.line, t.stops[i].name)) return i;
    return -1;
  };
  /** „Magdeburg, Sudenburg“ → „Sudenburg“ */
  M.localArea = (a) => String(a || '').split(',').map((x) => x.trim()).filter((x) => x && !M.isMagdeburgName(x)).join(', ');

  /** Stadtgebiet für Live-Fahrzeuge und Linienliste: Magdeburg, sonst ca. 18 × 18 km um den Punkt */
  M.cityBox = function (lat, lon) {
    const B = M.CONFIG.mdBBox;
    if (lat > B.minLat - 0.15 && lat < B.maxLat + 0.15 && lon > B.minLon - 0.22 && lon < B.maxLon + 0.22) return Object.assign({ name: 'Magdeburg' }, B);
    return { name: '', minLat: lat - 0.08, maxLat: lat + 0.08, minLon: lon - 0.13, maxLon: lon + 0.13 };
  };

  /* ---------------- Events ---------------- */
  const listeners = {};
  M.on = function (evt, fn) { (listeners[evt] = listeners[evt] || []).push(fn); return () => M.off(evt, fn); };
  M.off = function (evt, fn) { listeners[evt] = (listeners[evt] || []).filter((f) => f !== fn); };
  M.emit = function (evt, data) { (listeners[evt] || []).slice().forEach((fn) => { try { fn(data); } catch (e) { console.error(e); } }); };

  /* ---------------- Speicher ---------------- */
  const PREFIX = 'muvit:';
  M.store = {
    get(key, fallback) {
      try { const v = localStorage.getItem(PREFIX + key); return v == null ? fallback : JSON.parse(v); } catch (e) { return fallback; }
    },
    set(key, val) { try { localStorage.setItem(PREFIX + key, JSON.stringify(val)); } catch (e) { /* privat / voll */ } },
    del(key) { try { localStorage.removeItem(PREFIX + key); } catch (e) { /* ignore */ } }
  };

  const DEFAULT_SETTINGS = {
    theme: 'system', apiKey: '', model: 'claude-opus-5-5', effort: 'low',
    provider: 'motis', showStops: true, showVehicles: true, radius: 900, mapDark: true
  };
  M.settings = Object.assign({}, DEFAULT_SETTINGS, M.store.get('settings', {}));
  M.saveSettings = function (patch) {
    Object.assign(M.settings, patch || {});
    M.store.set('settings', M.settings);
    M.emit('settings', M.settings);
  };

  /* ---------------- DOM ---------------- */
  M.$ = (sel, root) => (root || document).querySelector(sel);
  M.$$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  M.h = function (html) {
    const t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.childElementCount === 1 ? t.content.firstElementChild : t.content;
  };
  M.esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  };
  M.debounce = function (fn, ms) {
    let t; return function () { const a = arguments, self = this; clearTimeout(t); t = setTimeout(() => fn.apply(self, a), ms); };
  };
  M.sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  M.isDesktop = () => window.matchMedia('(min-width: 900px)').matches;

  /* ---------------- Zeit (Europe/Berlin) ---------------- */
  const TZ = M.CONFIG.tz;
  const fmtHM = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: TZ });
  const fmtDay = new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', timeZone: TZ });
  const partsFmt = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short'
  });

  M.toDate = (v) => (v instanceof Date ? v : v ? new Date(v) : null);
  M.berlinParts = function (date) {
    const p = {};
    partsFmt.formatToParts(M.toDate(date) || new Date()).forEach((x) => { p[x.type] = x.value; });
    return { y: +p.year, mo: +p.month, d: +p.day, h: +p.hour % 24, mi: +p.minute, s: +p.second, wd: p.weekday };
  };
  function tzOffsetMin(date) {
    const p = M.berlinParts(date);
    return (Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) - Math.floor(date.getTime() / 1000) * 1000) / 60000;
  }
  /** Lokale Berliner Uhrzeit → Date */
  M.fromBerlin = function (y, mo, d, h, mi) {
    const guess = Date.UTC(y, mo - 1, d, h || 0, mi || 0);
    let ts = guess - tzOffsetMin(new Date(guess)) * 60000;
    const off2 = tzOffsetMin(new Date(ts));
    ts = guess - off2 * 60000;
    return new Date(ts);
  };
  /** "YYYY-MM-DDTHH:MM" (Berlin) für datetime-Eingaben */
  M.toLocalInput = function (date) {
    const p = M.berlinParts(date);
    const z = (n) => String(n).padStart(2, '0');
    return p.y + '-' + z(p.mo) + '-' + z(p.d) + 'T' + z(p.h) + ':' + z(p.mi);
  };
  /** Flexible Zeitangabe → Date (ISO mit/ohne Zone, "HH:MM", "jetzt") */
  M.parseWhen = function (v) {
    if (!v) return null;
    if (v instanceof Date) return v;
    const s = String(v).trim().toLowerCase();
    if (!s || s === 'jetzt' || s === 'now' || s === 'sofort') return null;
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})[t ](\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/);
    if (m) return M.fromBerlin(+m[1], +m[2], +m[3], +m[4], +m[5]);
    m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return M.fromBerlin(+m[1], +m[2], +m[3], 8, 0);
    m = s.match(/^(\d{1,2})[:.](\d{2})(?:\s*uhr)?$/) || s.match(/^(\d{1,2})\s*uhr$/);
    if (m) {
      const p = M.berlinParts(new Date());
      return M.fromBerlin(p.y, p.mo, p.d, +m[1], m[2] ? +m[2] : 0);
    }
    const d = new Date(v);
    return isNaN(d) ? null : d;
  };

  M.fmtTime = (d) => (d ? fmtHM.format(M.toDate(d)) : '–');
  M.fmtDay = (d) => fmtDay.format(M.toDate(d));
  M.fmtDayTime = function (d) {
    d = M.toDate(d);
    if (!d) return 'Jetzt';
    const a = M.berlinParts(d), n = M.berlinParts(new Date());
    const dayA = Date.UTC(a.y, a.mo - 1, a.d), dayN = Date.UTC(n.y, n.mo - 1, n.d);
    const diff = Math.round((dayA - dayN) / 864e5);
    const label = diff === 0 ? 'Heute' : diff === 1 ? 'Morgen' : diff === -1 ? 'Gestern' : M.fmtDay(d);
    return label + ', ' + M.fmtTime(d);
  };
  /** „Heute“, „Morgen“ oder „Do, 16.10.“ */
  M.dayLabel = function (d) {
    d = M.toDate(d);
    const a = M.berlinParts(d), n = M.berlinParts(new Date());
    const diff = Math.round((Date.UTC(a.y, a.mo - 1, a.d) - Date.UTC(n.y, n.mo - 1, n.d)) / 864e5);
    return diff === 0 ? 'Heute' : diff === 1 ? 'Morgen' : diff === -1 ? 'Gestern' : M.fmtDay(d);
  };
  M.dayKey = (d) => { const a = M.berlinParts(M.toDate(d)); return a.y + '-' + a.mo + '-' + a.d; };
  M.fmtDur = function (min) {
    min = Math.max(0, Math.round(min));
    if (min < 60) return min + ' Min';
    const h = Math.floor(min / 60), m = min % 60;
    return h + ' Std' + (m ? ' ' + m + ' Min' : '');
  };
  M.minsUntil = (d) => Math.round((M.toDate(d).getTime() - Date.now()) / 60000);
  M.fmtCountdown = function (d) {
    const m = M.minsUntil(d);
    if (m <= 0) return 'jetzt';
    if (m < 60) return 'in ' + m + ' Min';
    return 'um ' + M.fmtTime(d);
  };
  M.fmtDist = function (m) {
    if (m == null || isNaN(m)) return '';
    if (m < 1000) return Math.round(m / 10) * 10 + ' m';
    return (m / 1000).toLocaleString('de-DE', { maximumFractionDigits: m < 10000 ? 1 : 0 }) + ' km';
  };
  M.money = (v, cur) => (v == null ? '–' : Number(v).toLocaleString('de-DE', { style: 'currency', currency: cur || 'EUR' }));
  M.delayMin = function (rt, planned) {
    if (!rt || !planned) return null;
    return Math.round((M.toDate(rt).getTime() - M.toDate(planned).getTime()) / 60000);
  };

  /* ---------------- Geometrie ---------------- */
  const R = 6371008.8, rad = (x) => (x * Math.PI) / 180;
  M.dist = function (lat1, lon1, lat2, lon2) {
    const dLat = rad(lat2 - lat1), dLon = rad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
  };
  M.bearing = function (lat1, lon1, lat2, lon2) {
    const y = Math.sin(rad(lon2 - lon1)) * Math.cos(rad(lat2));
    const x = Math.cos(rad(lat1)) * Math.sin(rad(lat2)) - Math.sin(rad(lat1)) * Math.cos(rad(lat2)) * Math.cos(rad(lon2 - lon1));
    return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
  };
  M.compass = function (deg) {
    return ['N', 'NO', 'O', 'SO', 'S', 'SW', 'W', 'NW'][Math.round(deg / 45) % 8];
  };
  M.walkMin = (m) => Math.max(1, Math.round((m * 1.25) / 75)); // Umweg-Faktor, 4,5 km/h

  /** Google-Polyline → [[lon, lat], …] */
  M.decodePolyline = function (str, precision) {
    if (!str) return [];
    const f = Math.pow(10, precision == null ? 5 : precision);
    const out = [];
    let i = 0, lat = 0, lon = 0;
    while (i < str.length) {
      let b, shift = 0, res = 0;
      do { b = str.charCodeAt(i++) - 63; res |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
      lat += res & 1 ? ~(res >> 1) : res >> 1;
      shift = 0; res = 0;
      do { b = str.charCodeAt(i++) - 63; res |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
      lon += res & 1 ? ~(res >> 1) : res >> 1;
      out.push([lon / f, lat / f]);
    }
    return out;
  };
  /** Liegt der Punkt im Bediengebiet der MVB? (Suche, Haltestellen auf der Karte) */
  M.inService = function (lat, lon) {
    const b = M.CONFIG.serviceBBox;
    return lat != null && lon != null && lat >= b.minLat && lat <= b.maxLat && lon >= b.minLon && lon <= b.maxLon;
  };
  M.inMagdeburg = function (lat, lon) {
    const b = M.CONFIG.mdBBox;
    return lat >= b.minLat && lat <= b.maxLat && lon >= b.minLon && lon <= b.maxLon;
  };

  /* ---------------- Verkehrsmittel & Farben ---------------- */
  M.MODES = {
    tram: { label: 'Straßenbahn', short: 'Tram', badge: 'Tram', icon: 'tram', color: '#BA2619' },
    bus: { label: 'Bus', short: 'Bus', badge: 'Bus', icon: 'bus', color: '#4B1C76' },
    sbahn: { label: 'S-Bahn', short: 'S-Bahn', badge: 'S', icon: 'train', color: '#408335' },
    regio: { label: 'Regionalzug', short: 'Zug', badge: 'RE', icon: 'train', color: '#878C96' },
    fern: { label: 'Fernverkehr', short: 'Fernzug', badge: 'IC', icon: 'train', color: '#282D37' },
    ubahn: { label: 'U-Bahn', short: 'U-Bahn', badge: 'U', icon: 'subway', color: '#1455C0' },
    ferry: { label: 'Fähre', short: 'Fähre', badge: 'Fähre', icon: 'ferry', color: '#309FD1' },
    walk: { label: 'Fußweg', short: 'zu Fuß', badge: '', icon: 'walk', color: '#7A7A7E' },
    bike: { label: 'Fahrrad', short: 'Rad', badge: '', icon: 'bike', color: '#7A7A7E' },
    other: { label: 'Verkehrsmittel', short: 'Linie', badge: '', icon: 'route', color: '#59639F' }
  };
  M.modeInfo = (k) => M.MODES[k] || M.MODES.other;
  /** Schienenverkehr hält an Gleisen, Tram und Bus an Bahnsteigen (Bstg.) */
  M.isRail = (mode) => mode === 'sbahn' || mode === 'regio' || mode === 'fern' || mode === 'ubahn';
  /** Zug der Deutschen Bahn? (ohne Betreiberangabe: Fernverkehr und Regio meist DB) */
  M.isDBLine = function (line) {
    if (!line || (line.mode !== 'regio' && line.mode !== 'fern')) return false;
    const a = String(line.agency || '');
    // ohne Betreiberangabe: Fernverkehr ist fast immer DB, im Regionalverkehr gibt es viele Betreiber
    if (!a) return line.mode === 'fern';
    return /\bDB\b|Deutsche Bahn/i.test(a);
  };

  // Linienfarben der MVB Magdeburg (aus den Referenzbildern gemessen)
  const MVB_TRAM = { '1': '#A42D51', '2': '#59639F', '3': '#EAD248', '4': '#8EC33B', '5': '#AF843F', '6': '#663C88', '8': '#D9762F', '9': '#2C6352', '10': '#2C93B8', '13': '#191919' };
  const NIGHT = '#1E3264';
  /** Straßenbahnlinie der MVB? (für „Linie 13“ in Hinweistexten) */
  M.isMvbTram = (n) => Object.prototype.hasOwnProperty.call(MVB_TRAM, String(n));
  /** Nachtlinie (N1, N2 …) */
  M.isNight = (line) => !!line && /^N\s?\d/i.test(String(line.name || ''));
  const BUS_LINE = '#3A3F37', BUS_REPLACEMENT = '#BA2715';
  /** Produktfarben der Deutschen Bahn (DB UX Design System, @db-ui/base) – für alle Züge, egal welcher Betreiber */
  M.DB_COLORS = { ice: '#282D37', ic: '#646973', regio: '#878C96', sbahn: '#408335', ubahn: '#1455C0', ship: '#309FD1' };
  const PALETTE = ['#A42D51', '#59639F', '#8EC33B', '#AF843F', '#663C88', '#2C6352', '#D9762F', '#2C93B8', '#B8456E', '#4E7A3A'];
  function hash(s) { let x = 7; for (let i = 0; i < s.length; i++) x = (x * 31 + s.charCodeAt(i)) | 0; return Math.abs(x); }
  function validHex(c) {
    if (!c) return null;
    c = String(c).trim().replace(/^#/, '');
    if (!/^[0-9a-f]{6}$/i.test(c)) return null;
    c = '#' + c.toUpperCase();
    return c === '#FFFFFF' || c === '#000000' ? null : c;
  }
  M.luminance = function (hex) {
    const n = parseInt(hex.slice(1), 16);
    const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  };
  M.textOn = (hex) => (M.luminance(hex) > 0.6 ? '#131418' : '#FFFFFF');
  /** Farbe der Haltestellenpunkte auf einer Linie: weiß, auf hellen Linien (z. B. Tram 3, gelb) schwarz */
  M.stopDotColor = (hex) => (/^#[0-9a-f]{6}$/i.test(hex || '') && M.luminance(hex) > 0.55 ? '#000000' : '#FFFFFF');
  /** Linienfarbe im MVB-Stil: Trams farbig (eckig), Busse dunkel (rund), Züge nach Produkt */
  M.lineColor = function (name, mode, feedColor) {
    const n = String(name || '').trim();
    if ((mode === 'tram' || mode === 'bus') && /^N\s?\d/i.test(n)) return { bg: validHex(feedColor) || NIGHT, fg: '#FFFFFF' };
    if (mode === 'tram' && MVB_TRAM[n]) return { bg: MVB_TRAM[n], fg: '#FFFFFF' };
    if (mode === 'bus') return { bg: /^(SEV|EV)/i.test(n) || n === '48' ? BUS_REPLACEMENT : BUS_LINE, fg: '#FFFFFF' };
    // Züge in den Farben der Deutschen Bahn: ICE dunkel, IC/EC grau, RE/RB hellgrau, S-Bahn grün, U-Bahn blau
    if (mode === 'fern') return { bg: /^(ICE|ECE)/i.test(n) ? M.DB_COLORS.ice : M.DB_COLORS.ic, fg: '#FFFFFF' };
    if (mode === 'regio') return { bg: M.DB_COLORS.regio, fg: '#FFFFFF' };
    if (mode === 'sbahn') return { bg: M.DB_COLORS.sbahn, fg: '#FFFFFF' };
    if (mode === 'ubahn') return { bg: M.DB_COLORS.ubahn, fg: '#FFFFFF' };
    if (mode === 'ferry') return { bg: M.DB_COLORS.ship, fg: '#FFFFFF' };
    const c = validHex(feedColor);
    if (c) return { bg: c, fg: M.textOn(c) };
    const num = parseInt(n.replace(/\D+/g, ''), 10);
    const bg = PALETTE[(isNaN(num) ? hash(n + mode) : num) % PALETTE.length];
    return { bg, fg: '#FFFFFF' };
  };
  /** Farbe für Linienverläufe auf der (hellen) Karte */
  M.routeColor = function (line) {
    if (!line) return '#7A7A7E';
    if (line.mode === 'bus' && line.color === BUS_LINE) return '#4B1C76';
    return line.color;
  };

  /* ---------------- Toasts ---------------- */
  M.toast = function (msg, opts) {
    opts = opts || {};
    const wrap = document.getElementById('toasts');
    if (!wrap) return;
    const ico = opts.type === 'err' ? 'alert' : opts.type === 'ok' ? 'check' : 'info';
    const el = M.h('<div class="toast ' + (opts.type || '') + '">' + M.icon(ico) + '<div>' + M.esc(msg) + '</div></div>');
    wrap.appendChild(el);
    setTimeout(() => { el.classList.add('hide'); setTimeout(() => el.remove(), 320); }, opts.ms || 3600);
  };

  /* ---------------- Standort ---------------- */
  M.Geo = {
    pos: null, status: 'idle', _watch: null, _waiters: [],
    start() {
      if (!('geolocation' in navigator)) { this.status = 'unavailable'; M.emit('geo:status', this.status); return; }
      if (this._watch != null) return;
      this.status = 'pending'; M.emit('geo:status', this.status);
      this._watch = navigator.geolocation.watchPosition((p) => {
        const first = !this.pos;
        this.pos = { lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy, heading: p.coords.heading, ts: p.timestamp };
        this.status = 'ok';
        this._waiters.splice(0).forEach((w) => w.res(this.pos));
        M.emit('geo:update', { pos: this.pos, first });
      }, (err) => {
        this.status = err.code === 1 ? 'denied' : 'unavailable';
        this._waiters.splice(0).forEach((w) => w.rej(err));
        if (err.code === 1) { navigator.geolocation.clearWatch(this._watch); this._watch = null; }
        M.emit('geo:status', this.status);
      }, { enableHighAccuracy: true, maximumAge: 15000, timeout: 25000 });
    },
    /** Liefert die aktuelle Position oder wartet auf den ersten Fix */
    get(timeout) {
      if (this.pos && Date.now() - this.pos.ts < 120000) return Promise.resolve(this.pos);
      if (this.status === 'denied' || this.status === 'unavailable') {
        // erneut versuchen (Nutzer hat ggf. freigegeben)
        this._watch = null; this.start();
      } else if (this._watch == null) this.start();
      return new Promise((res, rej) => {
        const w = { res, rej };
        this._waiters.push(w);
        setTimeout(() => {
          const i = this._waiters.indexOf(w);
          if (i >= 0) { this._waiters.splice(i, 1); this.pos ? res(this.pos) : rej(new Error('Standort nicht verfügbar')); }
        }, timeout || 10000);
      });
    }
  };

  /** Spezielle Orte */
  M.MY_LOCATION = { id: '@me', name: 'Mein Standort', type: 'me' };
  M.isMe = (p) => p && (p.type === 'me' || p.id === '@me');

  /* ---------------- App-Zustand ---------------- */
  M.state = {
    from: null,      // leer = Platzhalter; bei der Suche wird „Mein Standort“ genutzt
    to: null,
    via: [],          // [{ place, stay }]
    time: null,       // null = jetzt
    arriveBy: false
  };

  /** Verlauf / Favoriten */
  M.recents = {
    places() { return M.store.get('recentPlaces', []); },
    addPlace(p) {
      if (!p || M.isMe(p) || p.type === 'coord') return;
      const list = this.places().filter((x) => x.id !== p.id && x.name !== p.name);
      list.unshift({ id: p.id, name: p.name, lat: p.lat, lon: p.lon, type: p.type, area: p.area || '', src: p.src });
      M.store.set('recentPlaces', list.slice(0, 12));
    },
    routes() { return M.store.get('recentRoutes', []); },
    addRoute(from, to) {
      if (!from || !to) return;
      const key = (M.isMe(from) ? '@me' : from.name) + '→' + to.name;
      const list = this.routes().filter((r) => r.key !== key);
      list.unshift({ key, from: M.isMe(from) ? M.MY_LOCATION : from, to });
      M.store.set('recentRoutes', list.slice(0, 8));
    }
  };
  M.favs = {
    stops() { return M.store.get('favStops', []); },
    hasStop(s) { return this.stops().some((x) => x.name === s.name); },
    toggleStop(s) {
      let list = this.stops();
      if (list.some((x) => x.name === s.name)) list = list.filter((x) => x.name !== s.name);
      else list.unshift({ id: s.id, name: s.name, lat: s.lat, lon: s.lon, src: s.src, type: 'stop' });
      M.store.set('favStops', list.slice(0, 20));
      return list.some((x) => x.name === s.name);
    },
    routes() { return M.store.get('favRoutes', []); },
    hasRoute(f, t) { return this.routes().some((r) => r.key === routeKey(f, t)); },
    toggleRoute(f, t) {
      const key = routeKey(f, t);
      let list = this.routes();
      const has = list.some((r) => r.key === key);
      list = has ? list.filter((r) => r.key !== key) : [{ key, from: M.isMe(f) ? M.MY_LOCATION : f, to: t }].concat(list);
      M.store.set('favRoutes', list.slice(0, 20));
      return !has;
    }
  };
  function routeKey(f, t) { return (M.isMe(f) ? '@me' : f && f.name) + '→' + (t && t.name); }
})(window.Muvit = window.Muvit || {});
