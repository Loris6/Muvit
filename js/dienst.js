/* Muvit – Anbindung an den Muvit-Dienst (service/): echte Daten der Deutschen Bahn (Züge, Gleise, Wagenreihung)
   und von INSA/MVB (Straßenbahn und Bus in Echtzeit, Hinweise, Störungen) sowie Push-Mitteilungen.
   Die Adresse steht in config.json (trägt die GitHub-Action ein) oder unter Einstellungen → Muvit-Dienst.
   Ohne Dienst arbeitet Muvit wie bisher mit Transitous. */
(function (M) {
  'use strict';

  const D = M.Dienst = { base: '', health: null };
  D.url = () => String(M.settings.serviceUrl || D.base || '').trim().replace(/\/+$/, '');

  async function raw(path, params, timeout) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeout || 12000);
    try {
      const q = new URLSearchParams();
      Object.entries(params || {}).forEach(([k, v]) => { if (v != null && v !== '') q.set(k, v instanceof Date ? v.toISOString() : String(v)); });
      const res = await fetch(D.url() + path + (q.toString() ? '?' + q : ''), { signal: ctrl.signal });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw Object.assign(new Error(j.error || 'Muvit-Dienst antwortet nicht (' + res.status + ')'), { status: res.status });
      return j;
    } catch (e) {
      throw e.name === 'AbortError' ? new Error('Muvit-Dienst antwortet nicht') : e;
    } finally { clearTimeout(t); }
  }

  let readyP = null;
  /** Dienst bereit? (config.json lesen, einmal /health fragen) */
  D.ready = function () {
    if (readyP) return readyP;
    readyP = (async () => {
      if (!D.base) {
        try { const r = await fetch('config.json', { cache: 'no-cache' }); if (r.ok) D.base = ((await r.json()) || {}).service || ''; } catch (e) { /* keine config.json */ }
      }
      if (!D.url()) { D.health = false; return false; }
      try { D.health = await raw('/health', {}, 8000); } catch (e) { D.health = false; }
      M.emit('dienst', D.health);
      return !!D.health;
    })();
    return readyP;
  };
  /** nach Änderung der Adresse in den Einstellungen */
  D.reset = () => { readyP = null; D.health = null; return D.ready(); };
  D.get = async (path, params, timeout) => {
    if (!(await D.ready())) throw new Error('Muvit-Dienst ist nicht eingerichtet');
    return raw(path, params, timeout);
  };

  /* ---------------- Haltestellen zuordnen (gespeichert) ---------------- */
  const MAPKEY = 'dienstStops2', MISS = new Map();
  async function mapped(kind, stop) {
    if (!stop || !stop.name) return null;
    const key = kind + '|' + M.normStop(stop.name) + '|' + (stop.lat != null ? stop.lat.toFixed(3) + ',' + stop.lon.toFixed(3) : '');
    const all = M.store.get(MAPKEY, {});
    // gefundene dauerhaft merken, „nicht gefunden“ nur 10 Minuten (kann an einer vorübergehenden Störung liegen)
    if (all[key]) return all[key];
    if (MISS.has(key) && Date.now() - MISS.get(key) < 600000) return null;
    let r;
    try { r = await D.get(kind === 'db' ? '/db/station' : '/nv/stop', { name: stop.name, lat: stop.lat, lon: stop.lon }); }
    catch (e) { if (e.status === 404) { MISS.set(key, Date.now()); return null; } throw e; }
    const found = r.station || r.stop || {};
    if (!found.id) { MISS.set(key, Date.now()); return null; }
    // DB: Nummer der Quelle (id) und EVA-Nummer der DB (für Verspätungsgründe und Wagenreihung)
    const id = kind === 'db' ? { id: found.id, eva: found.eva || null } : found.id;
    const keys = Object.keys(all);
    if (keys.length > 300) delete all[keys[0]];
    all[key] = id;
    M.store.set(MAPKEY, all);
    return id;
  }
  D.dbStation = (stop) => mapped('db', stop);
  D.nvStop = (stop) => mapped('nv', stop);

  /* ---------------- Abfahrten abgleichen ---------------- */
  const lkey = (n) => String(n || '').toUpperCase().replace(/^(STR|TRAM|BUS|STRASSENBAHN)\s+/, '').replace(/\s+/g, '');
  const sameLine = (x, s) => {
    const a = lkey(x.line.name), b = lkey(s.line && s.line.name);
    if (a && b && a === b) return true;
    const nr = s.line && s.line.fahrtNr;
    return !!nr && M.isRail(x.line.mode) && new RegExp('(^|\\D)' + nr + '(\\D|$)').test(x.line.full || x.line.name || '');
  };
  const isLocal = (m) => m === 'tram' || m === 'bus';

  /** Hinweise der DB/MVB als Zeilen mit Warndreieck („Verspätung aus vorheriger Fahrt“, „Halt entfällt“ …) */
  const NOISE = /^(Fahrradmitnahme|Bordrestaurant|Bordbistro|Rollstuhl|Komfort Check-in|Klimaanlage|WLAN|Wi-?Fi|Platzreservierung|Ruhebereich|Familienbereich|Kleinkindabteil|Steckdose|Info-Portal|Tickets? auch|Fahrzeuggebundene|Barrierefrei|Niederflur|Behindertengerechte|Maskenpflicht|Bitte beachten Sie)/i;
  function infosOf(list) {
    const out = [];
    (list || []).forEach((r) => {
      const title = String(r.summary || r.text || '').trim(), text = String(r.text || '').trim();
      if (!title || (r.type === 'hint' && !M.WORK_RE.test(title + ' ' + text) && !/(Verspätung|verspätet|Ausfall|fällt|entfällt|Ersatz|Umleitung|Gleis|abweichend|Störung|Reparatur|Weiterfahrt|weiter als|fortgesetzt)/i.test(title + ' ' + text))) return;
      if (NOISE.test(title)) return;
      out.push({ title, text: text && text !== title ? text : '', src: 'dienst', red: /(fällt aus|Ausfall|entfällt|Teilausfall)/i.test(title) });
    });
    return out;
  }
  /** „ab City Carré weiter als Linie 5“, „Fahrt wird als Linie 5 fortgesetzt“ → Linienwechsel lernen */
  const CHANGE_RE = /(?:weiter(?:fahrt)?|fortgesetzt|wechselt|übergeht|wird)\b[^.]{0,40}?\bals\s+(?:Linie|Tram|STR|Straßenbahn(?:linie)?|Bus(?:linie)?)\s*([A-Z]?\d{1,3}[a-z]?)\b|\bals\s+(?:Linie|Tram|STR)\s*([A-Z]?\d{1,3}[a-z]?)\s+(?:weiter|fortgesetzt)/i;
  function learnChanges(x, s) {
    (s.remarks || []).forEach((r) => {
      const t = (r.summary || '') + ' ' + (r.text || '');
      const m = t.match(CHANGE_RE);
      if (!m) return;
      const to = m[1] || m[2];
      const at = (t.match(/\bab\s+(?:der\s+Haltestelle\s+)?(.+?)\s+(?:weiter|als|fährt)\b/i) || [])[1] || x.headsign || s.direction;
      if (to && at) M.LineChanges.learn(x.line.name, to, at, x.line.mode, 'insa', s.tripId);
    });
  }

  // Ergebnisse je Abfahrt merken, damit sie beim nächsten Neuladen sofort (ohne Flackern) übernommen werden
  const PATCH = new Map();
  const pkey = (x) => (x.tripId || x.line.name) + '|' + +x.planned;
  function apply(x, p) {
    if (p.time) { x.time = p.time; x.delay = p.delay; x.realtime = true; }
    if (p.cancelled) x.cancelled = true;
    if (p.platform) { x.platform = p.platform; if (p.plannedPlatform) x.plannedPlatform = p.plannedPlatform; }
    if (p.infos && p.infos.length) {
      // Linienwechsel („weiter als Linie 3“) als Info, alles andere als Warnung mit Dreieck
      const inf = M.splitInfo(p.infos, []);
      const have = new Set((x.alerts || []).map((a) => a.title));
      x.alerts = inf.alerts.filter((a) => !have.has(a.title)).concat(x.alerts || []);
      const seen = new Set((x.notes || []).map((n) => n.text));
      x.notes = (x.notes || []).concat(inf.notes.filter((n) => !seen.has(n.text)));
    }
    if (p.dbLine) x.dbLine = p.dbLine;
    x.dienst = true;
  }
  /** Bekannte Ergebnisse sofort anwenden */
  D.applyKnown = function (list) {
    (list || []).forEach((x) => { const p = PATCH.get(pkey(x)); if (p && !x.dienst) apply(x, p); });
    return list;
  };
  function patchFrom(x, s) {
    const p = {};
    if (s.delay != null && s.when) { p.time = new Date(s.when); p.delay = Math.round(s.delay / 60); }
    if (s.cancelled) p.cancelled = true;
    if (s.platform && M.isRail(x.line.mode)) { p.platform = s.platform; p.plannedPlatform = s.plannedPlatform || ''; }
    p.infos = infosOf(s.remarks);
    if (M.isRail(x.line.mode) && s.line) p.dbLine = s.line;
    return p;
  }
  function match(list, svc) {
    let n = 0;
    const used = new Set();
    list.forEach((x) => {
      if (!x.line || !x.planned) return;
      let best = null, bd = 91000;
      svc.forEach((s, i) => {
        if (used.has(i) || !s.plannedWhen || !sameLine(x, s)) return;
        const dd = Math.abs(new Date(s.plannedWhen) - x.planned);
        if (dd < bd) { bd = dd; best = i; }
      });
      if (best == null) return;
      used.add(best);
      const s = svc[best], p = patchFrom(x, s);
      PATCH.set(pkey(x), p);
      if (PATCH.size > 1500) PATCH.delete(PATCH.keys().next().value);
      if (isLocal(x.line.mode)) learnChanges(x, s);
      apply(x, p); n++;
    });
    return n;
  }
  /** Abfahrten einer Haltestelle mit Echtzeit, Gleis, Ausfällen und Hinweisen von DB und MVB ergänzen.
      Liefert true, wenn sich etwas geändert hat. */
  D.enrich = async function (stop, list) {
    if (!list || !list.length || !(await D.ready()) || !stop || stop.lat == null) return false;
    const first = list.reduce((m, x) => (x.planned && (!m || x.planned < m) ? x.planned : m), null);
    const last = list.reduce((m, x) => (x.planned && (!m || x.planned > m) ? x.planned : m), null);
    if (!first) return false;
    const when = new Date(first.getTime() - 2 * 60000);
    const duration = Math.min(240, Math.max(30, Math.ceil((last - first) / 60000) + 5));
    const jobs = [];
    const local = list.filter((x) => isLocal(x.line.mode)), rail = list.filter((x) => M.isRail(x.line.mode));
    if (local.length && M.inService(stop.lat, stop.lon)) {
      jobs.push(D.nvStop(stop).then((id) => id && D.get('/nv/departures', { stop: id, when, duration })).then((r) => (r ? match(local, r.departures || []) : 0)));
    }
    if (rail.length) {
      jobs.push(D.dbStation(stop).then((st) => st && D.get('/db/departures', { eva: st.id, iris: st.eva, when, duration })).then((r) => (r ? match(rail, r.departures || []) : 0)));
    }
    const res = await Promise.allSettled(jobs);
    return res.some((r) => r.status === 'fulfilled' && r.value > 0);
  };

  /* ---------------- Störungen (Verkehrsmelder) ---------------- */
  const PRODUCT = { tram: 'tram', bus: 'bus', suburban: 'sbahn', regional: 'regio', regionalExp: 'regio', regionalExpress: 'regio', national: 'fern', nationalExpress: 'fern', nationalExp: 'fern', subway: 'ubahn', ferry: 'ferry' };
  D.remarks = async function () {
    const r = await D.get('/nv/remarks', {}, 15000);
    return (r.remarks || []).map((w) => ({
      title: w.summary || (w.text || '').slice(0, 90), text: w.text && w.text !== w.summary ? w.text : '',
      lines: (w.lines || []).filter((l) => l.name).map((l) => M.mkLine(l.name, PRODUCT[l.product] || 'bus')),
      stops: (w.stops || []).map((n) => M.localName(n)), mvb: true,
      from: w.validFrom ? new Date(w.validFrom) : null, until: w.validUntil ? new Date(w.validUntil) : null, src: 'insa'
    }));
  };

  /* ---------------- Wagenreihung ---------------- */
  const dateBerlin = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' });
  /** Wagenreihung eines Zuges an einem Halt: Zug bei der DB suchen (Zugnummer, Gattung), dann die Reihung holen */
  D.wagenreihung = async function (line, stop, planned) {
    if (!(await D.ready())) return { available: false, reason: 'dienst' };
    const st = await D.dbStation(stop);
    if (!st || !st.eva) return { available: false, reason: 'station' };
    const eva = st.eva;
    const r = await D.get('/db/departures', { eva: st.id, iris: eva, when: new Date(planned.getTime() - 2 * 60000), duration: 30 });
    const fake = { line, planned };
    const dep = (r.departures || []).filter((s) => s.plannedWhen && sameLine(fake, s))
      .sort((a, b) => Math.abs(new Date(a.plannedWhen) - planned) - Math.abs(new Date(b.plannedWhen) - planned))[0];
    if (!dep || !dep.line || Math.abs(new Date(dep.plannedWhen) - planned) > 3 * 60000) return { available: false, reason: 'train' };
    const nr = dep.line.fahrtNr || (String(dep.line.name).match(/\d+/) || [])[0];
    const cat = dep.line.productName || String(dep.line.name).replace(/\s*\d.*$/, '');
    if (!nr || !cat) return { available: false, reason: 'train' };
    const pw = new Date(dep.plannedWhen);
    const seq = await D.get('/db/wagenreihung', { category: cat, number: nr, eva, date: dateBerlin.format(pw), time: pw.toISOString(), admin: dep.line.adminCode || '' });
    return Object.assign({ train: (cat + ' ' + nr).trim(), platformRt: dep.platform || '', platformPlan: dep.plannedPlatform || '' }, seq);
  };

  D.ready();
})(window.Muvit = window.Muvit || {});
