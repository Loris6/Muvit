/* Muvit – UI: frei ziehbares Sheet über der Karte, Navigation, Komponenten im Referenz-Stil */
(function (M) {
  'use strict';

  const $ = M.$, esc = M.esc, icon = M.icon;

  /* =====================================================================
     Komponenten
     ===================================================================== */
  const C = {};
  M.C = C;

  /** DB-Logo (Regio- und Fernverkehr der Deutschen Bahn) */
  const DB_LOGO = '<svg viewBox="0 0 34 24" aria-hidden="true"><rect x="1" y="1" width="32" height="22" rx="3.6" fill="#fff" stroke="#EC0016" stroke-width="2"/>' +
    '<text x="17" y="17.4" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="14" letter-spacing="-.3" fill="#EC0016">DB</text></svg>';
  M.DB_LOGO = DB_LOGO;
  /** Verkehrsmittel-Zeichen wie an der Haltestelle: „Tram“ (Quadrat, rot), „Bus“ (Kreis, lila),
      S-Bahn (grüner Kreis), U-Bahn (blaues Quadrat), DB-Logo für DB-Züge, sonst Zug-Piktogramm */
  C.modeBadge = function (mode, o, line) {
    o = o || {};
    const sm = o.sm ? ' sm' : '';
    switch (mode) {
      case 'tram': return '<span class="bd m tram' + sm + '" title="Straßenbahn">Tram</span>';
      case 'bus': return '<span class="bd m bus' + sm + '" title="Bus">' + (o.upper ? 'BUS' : 'Bus') + '</span>';
      case 'sbahn': return '<span class="bd m sb' + sm + '" title="S-Bahn">S</span>';
      case 'ubahn': return '<span class="bd m ub' + sm + '" title="U-Bahn">U</span>';
      case 'regio': case 'fern': {
        const label = mode === 'fern' ? 'Fernverkehr' : 'Regionalverkehr';
        if (!line || M.isDBLine(line)) return '<span class="bd m db' + sm + '" title="DB ' + label + '">' + DB_LOGO + '</span>';
        return '<span class="bd m zug' + sm + '" title="' + label + (line.agency ? ' · ' + esc(line.agency) : '') + '">' + icon('train') + '</span>';
      }
      case 'ferry': return '<span class="bd m ferry' + sm + '" title="Fähre">' + icon('ferry') + '</span>';
      default: return '';
    }
  };
  /** Liniennummer: Tram eckig in Linienfarbe, Bus rund */
  C.lineBadge = function (line, o) {
    if (!line) return '';
    o = o || {};
    const round = line.mode === 'bus' ? ' round' : '';
    return '<span class="bd' + round + (o.sm ? ' sm' : '') + '" style="background:' + line.color + ';color:' + line.text + '" title="' + esc(M.modeInfo(line.mode).label + ' ' + line.full) + '">' + esc(line.name) + '</span>';
  };
  /** Immer Verkehrsmittel-Zeichen + Linie: [Tram][3], [Bus][73], [S][S1], [DB][RE1] */
  C.badges = function (line, o) {
    if (!line) return '';
    o = o || {};
    const rt = o.rt === undefined ? '' : C.rtBadge(o.rt);
    return '<span class="bds' + (rt ? ' has-rt' : '') + '">' + C.modeBadge(line.mode, o, line) + C.lineBadge(line, o) + rt + '</span>';
  };
  /** Echtzeit-Zeichen: dunkler runder Punkt oben rechts an der Linie mit weißem Funk-Zeichen (Punkt + ein Bogen) */
  C.rtBadge = (on) => (on ? '<span class="rtb" title="Echtzeitdaten">' + icon('rt') + '</span>' : '');
  /** Mehrere Linien gruppiert: Verkehrsmittel-Zeichen einmal, dann alle Nummern – [Tram] 1 2 3 · [Bus] 48 73 */
  C.lineGroups = function (lines, o) {
    o = o || {};
    const groups = [];
    M.sortLines(lines || []).forEach((l) => {
      const k = l.mode === 'regio' || l.mode === 'fern' ? (M.isDBLine(l) ? 'db' : 'zug') : l.mode;
      let g = groups.find((x) => x.k === k);
      if (!g) { g = { k, line: l, list: [] }; groups.push(g); }
      if (!g.list.some((x) => x.name === l.name)) g.list.push(l);
    });
    const sm = o.sm !== false;
    return groups.map((g) => '<span class="bds lg">' + C.modeBadge(g.line.mode, { sm }, g.line) + g.list.map((l) => C.lineBadge(l, { sm })).join('') + '</span>').join(o.sep || '');
  };
  /** Farbe für Minuten/Countdown: grün pünktlich, blau zu früh, orange leicht verspätet, rot verspätet */
  C.delayCls = function (x) {
    if (x.cancelled) return 'c-red';
    if (!x.realtime || x.delay == null) return '';
    if (x.delay < 0) return 'c-blue';
    if (x.delay === 0) return 'c-green';
    return x.delay >= 5 ? 'c-red' : 'c-orange';
  };
  /** Linien einer Haltestelle (Bild „Abfahrten / Departure“): Linien | weitere Verkehrsmittel */
  C.stopLines = function (lines) {
    const ls = M.sortLines(lines || []);
    const main = ls.filter((l) => l.mode === 'tram' || l.mode === 'bus').slice(0, 12);
    const extra = [];
    if (ls.some((l) => l.mode === 'bus')) extra.push(C.modeBadge('bus', { sm: true }));
    ['sbahn', 'ubahn', 'regio', 'fern', 'ferry'].forEach((m) => ls.filter((l) => l.mode === m).forEach((l) => extra.push(C.modeBadge(m, { sm: true }, l))));
    const key = (b) => b.replace(/ title="[^"]*"/, '');
    const modes = extra.filter((b, i) => b && extra.findIndex((c) => key(c) === key(b)) === i);
    let h = main.map((l) => C.lineBadge(l, { sm: true })).join('');
    if (modes.length) h += (main.length ? '<span class="vsep"></span>' : '') + modes.join('');
    return h;
  };

  /** Statustext + Farbe einer Abfahrt */
  C.status = function (x) {
    if (x.cancelled) return { text: 'Fällt aus', cls: 'c-red' };
    if (!x.realtime || x.delay == null) return { text: 'Planmäßig', cls: 'c-gray' };
    if (x.delay < 0) return { text: 'Früher erwartet (' + x.delay + ' Min.)', cls: 'c-blue' };
    if (x.delay === 0) return { text: 'Pünktlich erwartet', cls: 'c-green' };
    return { text: 'Verspätet (+' + x.delay + ' Min.)', cls: x.delay >= 5 ? 'c-red' : 'c-orange' };
  };
  C.countdown = function (t, dot) {
    const m = M.minsUntil(t);
    if (m <= 0) return 'Jetzt';
    if (m < 100) return 'In ' + m + ' Min' + (dot ? '.' : '');
    return 'Um ' + M.fmtTime(t);
  };
  /** Tram/Bus: „Bstg.“ (Bahnsteig), Züge: „Gleis“ */
  C.platform = (p, mode) => (p ? (M.isRail(mode) ? 'Gleis ' : 'Bstg. ') + p : '');
  /** Gleiswechsel bei Zügen (aktuelles ≠ geplantes Gleis) */
  C.platformChanged = (p, planned, mode) => !!(p && planned && String(p) !== String(planned) && M.isRail(mode));
  C.bstg = function (p, mode, planned) {
    if (!p) return '';
    const chg = C.platformChanged(p, planned, mode);
    return '<span class="bstg' + (chg ? ' chg' : '') + '"' + (chg ? ' title="Gleiswechsel – planmäßig Gleis ' + esc(planned) + '"' : '') + '>' + (M.isRail(mode) ? 'Gl. ' : 'Bstg. ') + esc(p) + '</span>';
  };
  /** Bahnsteig/Gleis als Text in Unterzeilen, Gleiswechsel rot hinterlegt */
  C.platformText = function (p, mode, planned) {
    if (!p) return '';
    const chg = C.platformChanged(p, planned, mode);
    return '<span class="pf' + (chg ? ' chg' : '') + '"' + (chg ? ' title="Gleiswechsel – planmäßig Gleis ' + esc(planned) + '"' : '') + '>' + esc(C.platform(p, mode)) + '</span>';
  };

  /** Linien in Hinweistexten als Zeichen darstellen: „fährt weiter als Linie 3“ → fährt weiter als [Tram][3] */
  const REF_RE = /\b(Straßenbahnlinie|Straßenbahn|Tram|STR|Buslinie|Bus|Linie|S-Bahn|S|U|RE|RB|IRE|ICE|IC|EC|ECE)\s?(\d{1,5}[a-zA-Z]?)\b/g;
  const KW_MODE = { 'Straßenbahnlinie': 'tram', 'Straßenbahn': 'tram', Tram: 'tram', STR: 'tram', Buslinie: 'bus', Bus: 'bus', 'S-Bahn': 'sbahn', S: 'sbahn', U: 'ubahn', RE: 'regio', RB: 'regio', IRE: 'regio', ICE: 'fern', IC: 'fern', EC: 'fern', ECE: 'fern' };
  function guessMode(num, ctxLine, stopName) {
    const known = stopName ? M.linesForStop(stopName).find((l) => l.name === num) : null;
    if (known) return known.mode;
    if (ctxLine && (ctxLine.mode === 'tram' || ctxLine.mode === 'bus')) return M.isMvbTram(num) ? 'tram' : 'bus';
    return ctxLine ? ctxLine.mode : 'bus';
  }
  const LIST_RE = /\b(Straßenbahnlinien|Straßenbahnlinie|Straßenbahnen|Straßenbahn|Tram|STR|Buslinien|Buslinie|Busse|Bus|Linien|Linie|S-Bahn|S|U|RE|RB|IRE|ICE|IC|EC|ECE)\s?(\d{1,5}[a-zA-Z]?(?:\s*(?:,|\/|&amp;|und|u\.)\s*\d{1,5}[a-zA-Z]?)+)\b/g;
  const KW_LIST = { 'Straßenbahnlinien': 'tram', 'Straßenbahnen': 'tram', Buslinien: 'bus', Busse: 'bus' };
  C.richText = function (text, ctxLine, stopName) {
    // Ersetzungen als Platzhalter sammeln, damit spätere Durchläufe nicht in schon erzeugtes HTML greifen
    const parts = [];
    const tok = (html) => '\u0000' + (parts.push(html) - 1) + '\u0000';
    const badge = (name, mode) => C.badges(M.mkLine(name, mode), { sm: true });
    const nameOf = (kw, num, mode) => (mode === 'sbahn' || mode === 'ubahn' || mode === 'regio' ? kw.replace('S-Bahn', 'S') + num : mode === 'fern' ? kw + ' ' + num : num);
    let h = esc(text || '');
    // Listen: „Tram 1, 2 und 3“ → [Tram] 1 2 3 (Verkehrsmittel-Zeichen nur einmal)
    h = h.replace(LIST_RE, (all, kw, list) => {
      const lines = list.split(/\s*(?:,|\/|&amp;|und|u\.)\s*/).filter(Boolean)
        .map((num) => { const mode = KW_LIST[kw] || KW_MODE[kw] || guessMode(num, ctxLine, stopName); return M.mkLine(nameOf(kw, num, mode), mode); });
      return tok('<span class="ref">' + C.lineGroups(lines, { sep: ' ' }) + '</span>');
    });
    h = h.replace(REF_RE, (all, kw, num) => {
      const mode = KW_MODE[kw] || guessMode(num, ctxLine, stopName);
      return tok('<span class="ref">' + badge(nameOf(kw, num, mode), mode) + '</span>');
    });
    // „fährt weiter als 3“ / „kommt als 73“ ohne Verkehrsmittel
    h = h.replace(/(weiter als|kommt als|kommend als)\s+(\d{1,3}[a-zA-Z]?)\b/gi, (all, w, num) => w + ' ' + tok('<span class="ref">' + badge(num, guessMode(num, ctxLine, stopName)) + '</span>'));
    return h.replace(/\u0000(\d+)\u0000/g, (a, k) => parts[+k]);
  };
  const nn = (v) => M.localName(v || '').toLowerCase().replace(/[^a-z0-9äöüß]/g, '');
  /** Ist ein Text-Hinweis zum Linienwechsel sinnvoll? */
  C.throughNoteOk = function (text, x) {
    const t = String(text || '');
    if (!/(weiter\s+als|kommt\s+als|kommend\s+als|Linienwechsel)/i.test(t)) return true;
    const dest = (t.match(/\bnach\s+(.+?)[.!]?\s*$/i) || [])[1];
    const here = x && x.stop && x.stop.name;
    if (dest && (nn(dest) === nn(here) || (x && nn(dest) === nn(x.headsign)))) return false;
    const at = (t.match(/\bab\s+(.+?)\s+(?:weiter|als)\b/i) || [])[1] || (x && x.headsign) || here;
    return M.isChangeStop(at);
  };
  /** Hinweiszeilen unter einer Linie: Störungen/Umleitungen (Warnung) und Durchläufer (Info) */
  C.infoLines = function (x, i, o) {
    o = o || {};
    const at = x.stop && x.stop.name;
    let h = '';
    (x.alerts || []).slice(0, o.max || 2).forEach((a, k) => {
      h += '<button class="alert-line" data-alert="' + i + ':' + k + '">' + icon('warnFill', 'w') + '<span class="tx">' + C.richText(a.title, x.line, at) + '</span><span class="chev">' + (a.text ? icon('right') : '') + '</span></button>';
    });
    const note = (html) => '<div class="alert-line note">' + icon('infoFill', 'n') + '<span class="tx">' + html + '</span><span></span></div>';
    // Textnotizen zu Durchläufern nicht doppelt zeigen, wenn die Weiterfahrt schon erkannt ist,
    // und unsinnige weglassen (z. B. „… weiter nach City Carré“ an City Carré, Wechsel an normalen Endstellen)
    (x.notes || []).filter((n) => !(x.cont && /weiter\s+als/i.test(n.text)) && !(x.comes && /kommt\s+als/i.test(n.text)) && C.throughNoteOk(n.text, x)).slice(0, 2)
      .forEach((n) => { h += note(C.richText(n.text, x.line, at)); });
    // Durchläufer: „Kommt als [Tram][2] aus …“ / „Weiter als [Tram][13] nach …“
    if (x.comes) h += note('Kommt als <span class="ref">' + C.badges(x.comes.line, { sm: true }) + '</span>' + (x.comes.from ? ' aus ' + esc(x.comes.from) : ''));
    // „Weiter als [Tram][13] nach Sudenburg“ – Ziel ist der letzte Halt der Weiterfahrt, nie der Wechselhalt
    const cdest = x.cont && x.cont.headsign && nn(x.cont.headsign) !== nn(x.cont.at) ? x.cont.headsign : '';
    if (x.cont) h += note((x.cont.line ? 'Weiter als <span class="ref">' + C.badges(x.cont.line, { sm: true }) + '</span>' : 'Ab ' + esc(x.cont.at || x.headsign) + ' weiter') + (cdest ? ' nach ' + esc(M.localName(cdest)) : ''));
    return h;
  };

  /** Abfahrtszeile wie im Bild „Haltestelle“ */
  C.depRow = function (x, i, o) {
    o = o || {};
    const st = C.status(x);
    const clk = 'Um ' + M.fmtTime(x.planned || x.time) + (x.realtime && x.delay ? '<span class="vsl"> (vsl.: ' + M.fmtTime(x.time) + ')</span>' : '');
    const sub = [ '<span class="' + st.cls + '">' + esc(st.text) + '</span>' ];
    if (x.platform) sub.push(C.platformText(x.platform, x.line.mode, x.plannedPlatform));
    if (o.stopName && x.stop) sub.push('<span class="pf">' + esc(x.stop.name) + '</span>');
    let h = '<div class="dep-item' + (x.cancelled ? ' cancel' : '') + '"><button class="dep" data-i="' + i + '">' +
      C.badges(x.line, { upper: true, rt: !!x.realtime }) +
      '<div style="min-width:0"><div class="dep-name">' + esc(x.headsign || '–') + '</div><div class="dep-sub">' + sub.join('<i class="sep"> • </i>') + '</div></div>' +
      '<div class="dep-r"><div class="cd ' + C.delayCls(x) + '">' + C.countdown(x.time, true) + '</div><div class="clk">' + clk + '</div></div>' +
      '<span class="chev">' + icon('right') + '</span></button>';
    if (o.alerts !== false) h += C.infoLines(x, i);
    return h + '</div>';
  };

  /** Haltestellenzeile wie im Bild „Abfahrten / Departure“ */
  C.stopRow = function (s, i, o) {
    o = o || {};
    const lines = s.lines || M.linesForStop(s.name);
    const area = M.localArea(o.area != null ? o.area : (s.area || ''));
    return '<div class="stop-row" data-i="' + i + '" role="button" tabindex="0">' + icon('hOutline', 'h') +
      '<div style="min-width:0"><div class="nm">' + esc(M.localName(s.name)) + '</div>' +
      '<div class="ln" data-lines="' + i + '">' + C.stopLines(lines) + '<span class="area" data-area="' + i + '">' + (area ? '• ' + esc(area) : '') + '</span>' + '</div></div>' +
      '<div class="end">' + (o.end || '') + (o.star !== false ? '<button class="star' + (M.favs.hasStop(s) ? ' on' : '') + '" data-star="' + i + '" aria-label="Favorit">' + icon(M.favs.hasStop(s) ? 'starFill' : 'star') + '</button>' : '') + '</div></div>';
  };

  /** Verbindungszeile (Ergebnisliste) */
  C.jrow = function (j, i) {
    const transit = j.legs.filter((l) => !l.walk);
    const first = transit[0];
    const dStart = j.realtime ? M.delayMin(j.legs[0].from.time, j.legs[0].from.planned) : null;
    const dEnd = j.realtime ? M.delayMin(j.legs[j.legs.length - 1].to.time, j.legs[j.legs.length - 1].to.planned) : null;
    const dl = (d) => (d == null ? '' : '<span class="d ' + (d === 0 ? 'c-green' : d < 0 ? 'c-red' : d >= 5 ? 'c-red' : 'c-orange') + '">' + (d >= 0 ? '+' : '') + d + '</span>');
    let legs = '';
    j.legs.forEach((l, k) => {
      if (k) legs += icon('right', 'arr');
      legs += l.walk ? '<span class="wk">' + icon('walk') + Math.max(1, Math.round(l.duration)) + '</span>' : C.badges(l.line, { sm: true });
    });
    const st = first ? C.status({ realtime: first.realtime, delay: first.from.delay, cancelled: j.cancelled }) : { text: 'Fußweg', cls: 'c-gray' };
    const sub = first ? '<span class="' + st.cls + '">' + esc(st.text) + '</span> • ab ' + esc(first.from.name) + (first.from.platform ? ', ' + C.platformText(first.from.platform, first.line.mode, first.from.plannedPlatform) : '') : esc(M.fmtDist(j.legs[0].distance));
    return '<button class="jrow" data-i="' + i + '"><div style="min-width:0">' +
      '<div class="tt">' + M.fmtTime(j.legs[0].from.time) + dl(dStart) + '<span class="c-gray">–</span>' + M.fmtTime(j.legs[j.legs.length - 1].to.time) + dl(dEnd) + '</div>' +
      '<div class="legs">' + legs + '</div><div class="sub">' + sub + '</div></div>' +
      '<div class="r"><div class="a">' + M.fmtDur(j.duration).replace('Min', 'Min.') + '</div><div class="b">' + (j.transfers ? j.transfers + (j.transfers === 1 ? ' Umstieg' : ' Umstiege') : 'Direkt') + '</div></div>' +
      '<span class="chev">' + icon('right') + '</span></button>';
  };

  C.empty = (title, text, btn) => '<div class="empty"><b>' + esc(title) + '</b>' + (text || '') + (btn ? '<div>' + btn + '</div>' : '') + '</div>';
  C.skel = (n) => Array.from({ length: n || 4 }, () => '<div class="skel"></div>').join('');
  C.error = function (err, retry) {
    const net = err && (err.network || err.status === 0);
    const el = M.h('<div>' + C.empty(net ? 'Keine Verbindung' : 'Das hat nicht geklappt', esc((err && err.message) || 'Unbekannter Fehler'),
      retry ? '<button class="btn-o" data-retry>' + icon('refresh') + 'Erneut versuchen</button>' : '') + '</div>');
    if (retry) el.querySelector('[data-retry]').addEventListener('click', retry);
    return el;
  };
  C.lrow = function (o, i) {
    return '<button class="lrow' + (o.cls ? ' ' + o.cls : '') + '" data-i="' + i + '">' + (o.lead != null ? o.lead : icon(o.icon || 'right', 'ic' + (o.white ? ' w' : ''))) +
      '<div style="min-width:0"><div class="t">' + o.title + '</div>' + (o.sub ? '<div class="s' + (o.wrap ? ' wrap' : '') + '">' + o.sub + '</div>' : '') + '</div>' +
      '<div class="e">' + (o.end || '') + (o.chev === false ? '' : '<span class="chev">' + icon('right') + '</span>') + '</div></button>';
  };

  /* =====================================================================
     Sheet & Navigation
     ===================================================================== */
  const UI = { stack: [], cur: null, h: 0, kb: 0, views: {} };
  M.UI = UI;
  M.Views = UI.views;

  /** Höhe der unteren Leiste (ohne sie bei offener Tastatur) */
  UI.tabH = () => (UI.kb || !UI.tabbar ? 0 : (UI._tabH || (UI._tabH = UI.tabbar.offsetHeight)));
  UI.maxH = () => Math.max(200, window.innerHeight - (UI.kb || 0) - UI.tabH());
  UI.minH = () => 112;

  UI.init = function () {
    UI.sheet = $('#sheet'); UI.grab = $('#sheetGrab'); UI.head = $('#sheetHead'); UI.extra = $('#sheetExtra'); UI.body = $('#sheetBody');
    UI.scroller = UI.body;
    UI.tabbar = $('#tabbar');
    renderTabbar();
    initGestures();
    initKeyboard();
    window.addEventListener('resize', M.debounce(() => {
      UI._tabH = 0;
      if (UI.h > UI.maxH() || UI.sheet.classList.contains('full')) UI.setH(UI.maxH(), false);
      UI.layout(); M.Map.resize();
    }, 120));
  };

  UI.setH = function (h, animate) {
    const max = UI.maxH();
    h = Math.round(Math.max(UI.minH(), Math.min(max, h)));
    const instant = animate === false && !UI.dragging;
    if (instant) UI.sheet.classList.add('dragging');
    UI.sheet.style.height = h + 'px';
    UI.h = h;
    UI.sheet.classList.toggle('full', h >= max - 1);
    if (instant) requestAnimationFrame(() => { if (!UI.dragging) UI.sheet.classList.remove('dragging'); });
    UI.layout();
  };
  function heightFor(spec) {
    const max = UI.maxH();
    if (spec === 'full') return max;
    if (typeof spec === 'number') return spec <= 1 ? max * spec : spec;
    // 'fit': Inhaltshöhe (bis zur Markierung data-fit-end), begrenzt
    const end = UI.body.querySelector('[data-fit-end]');
    const content = end ? end.getBoundingClientRect().bottom - UI.sheet.getBoundingClientRect().top + UI.body.scrollTop + 22
      : UI.grab.offsetHeight + UI.head.offsetHeight + (UI.extra.hidden ? 0 : UI.extra.offsetHeight) + UI.body.scrollHeight;
    return Math.max(max * 0.45, Math.min(max * 0.82, content + 8));
  }

  UI.layout = function () {
    const btn = $('#locateBtn');
    document.documentElement.style.setProperty('--tabh', UI.tabH() + 'px');
    if (btn) {
      btn.style.bottom = (UI.h + 12 + (UI.kb || 0) + UI.tabH()) + 'px';
      btn.classList.toggle('hide', UI.h > UI.maxH() - 150);
    }
  };
  UI.mapPadding = function () {
    const max = UI.maxH();
    return { top: 60, bottom: Math.round(Math.min(UI.h || max * 0.5, max * 0.5)) + 24 + UI.tabH(), left: 36, right: 36 };
  };

  /* ---------- Ansichten ---------- */
  UI.open = function (id, params, opts) {
    if (!UI.views[id]) { console.error('Unbekannte Ansicht', id); return; }
    M.Map.closePopup();
    if (UI.cur) { UI.cur.entry.h = UI.h; teardown(UI.cur); }
    const entry = { id, params: params || {}, opts: opts || {}, state: {} };
    if (opts && opts.replace && UI.stack.length > 1) UI.stack[UI.stack.length - 1] = entry;
    else UI.stack.push(entry);
    show(entry, false);
  };
  UI.back = function () {
    if (UI.stack.length <= 1) return;
    if (UI.cur) teardown(UI.cur);
    UI.stack.pop();
    show(UI.stack[UI.stack.length - 1], true);
  };
  UI.home = function () {
    if (UI.cur) teardown(UI.cur);
    UI.stack = UI.stack.slice(0, 1);
    if (!UI.stack.length) UI.stack.push({ id: 'home', params: {}, opts: {}, state: {} });
    M.Map.clearRoute();
    show(UI.stack[0], true);
  };
  /* ---------- Untere Leiste: Auskunft, Tickets, D-Ticket, Mehr – jede mit eigenem Verlauf ---------- */
  const TABS = [
    { id: 'auskunft', root: 'home', label: 'Auskunft', icon: 'searchLoc', on: 'searchLocS' },
    { id: 'tickets', root: 'tickets', label: 'Tickets', icon: 'ticketR', on: 'ticketS' },
    { id: 'dticket', root: 'dticket', label: 'D-Ticket', icon: 'dt', on: 'dt' },
    { id: 'mehr', root: 'mehr', label: 'Mehr', icon: 'menu', on: 'menu' }
  ];
  UI.tab = 'auskunft';
  UI.stacks = {};
  /** D-Ticket-Zeichen: abgerundete Karte mit „D“ */
  const DT_ICON = '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><rect x="1.5" y="4" width="21" height="16" rx="3.5" fill="none" stroke="currentColor" stroke-width="2"/>' +
    '<text x="12" y="16.4" text-anchor="middle" font-family="Rubik, system-ui, sans-serif" font-weight="700" font-size="11" fill="currentColor">D</text></svg>';
  M.DT_ICON = DT_ICON;
  function renderTabbar() {
    if (!UI.tabbar) return;
    UI.tabbar.innerHTML = TABS.map((t) => {
      const on = t.id === UI.tab;
      return '<button class="tb' + (on ? ' on' : '') + '" data-tab="' + t.id + '"' + (on ? ' aria-current="page"' : '') + '>' + (t.icon === 'dt' ? DT_ICON : icon(on ? t.on : t.icon)) + '<span>' + t.label + '</span></button>';
    }).join('');
    UI.tabbar.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => UI.switchTab(b.dataset.tab)));
  }
  UI.switchTab = function (tab) {
    const t = TABS.find((x) => x.id === tab);
    if (!t) return;
    if (tab === UI.tab) { if (!UI.isRoot()) UI.home(); return; }
    M.Map.closePopup();
    if (UI.cur) { UI.cur.entry.h = UI.h; teardown(UI.cur); }
    UI.stacks[UI.tab] = UI.stack;
    UI.tab = tab;
    UI.stack = UI.stacks[tab] || [{ id: t.root, params: {}, opts: {}, state: {} }];
    M.Map.clearRoute();
    renderTabbar();
    show(UI.stack[UI.stack.length - 1], true);
  };
  /** Für Karte, Suche und Mitteilungen: immer in der Auskunft weiterarbeiten */
  UI.toAuskunft = function () { if (UI.tab !== 'auskunft') UI.switchTab('auskunft'); };
  UI.refresh = function () { if (UI.cur) { const e = UI.cur.entry; e.h = UI.h; teardown(UI.cur); show(e, true); } };
  UI.isRoot = () => UI.stack.length <= 1;

  function teardown(cur) {
    cur.alive = false;
    cur.cleanups.forEach((fn) => { try { fn(); } catch (e) { console.error(e); } });
    cur.cleanups = [];
  }

  function show(entry, restoring) {
    const v = UI.views[entry.id];
    const cur = { entry, alive: true, cleanups: [] };
    UI.cur = cur;
    UI.scroller = UI.body;
    UI.body.className = 'sheet-body';
    UI.body.innerHTML = '';
    UI.body.scrollTop = 0;
    UI.extra.hidden = true; UI.extra.innerHTML = '';
    const ctx = {
      params: entry.params, state: entry.state, body: UI.body, restoring: !!restoring,
      alive: () => cur.alive && UI.cur === cur,
      cleanup: (fn) => cur.cleanups.push(fn),
      on: (evt, fn) => cur.cleanups.push(M.on(evt, fn)),
      every: (ms, fn) => { const t = setInterval(() => { if (!document.hidden) fn(); }, ms); cur.cleanups.push(() => clearInterval(t)); },
      head: (o) => renderHead(o || {}, ctx),
      extra: (html) => { UI.extra.hidden = !html; UI.extra.innerHTML = html || ''; return UI.extra; },
      flexBody: () => { UI.body.classList.add('flex'); },
      scroller: (el) => { UI.scroller = el; },
      setH: (spec) => UI.setH(heightFor(spec)),
      open: (...a) => UI.open(...a), back: () => UI.back()
    };
    renderHead({ title: v.title || '' }, ctx);
    try { v.render(ctx); } catch (e) { console.error(e); UI.body.appendChild(C.error(e)); }
    const target = restoring && entry.h ? entry.h : null;
    if (target) UI.setH(target);
    else if (v.height === 'fit') requestAnimationFrame(() => { if (ctx.alive()) UI.setH(heightFor('fit')); });
    else UI.setH(heightFor(v.height || 0.94));
    M.emit('view', entry.id);
  }

  function renderHead(o, ctx) {
    const root = UI.isRoot();
    if (o.none) { UI.head.className = 'sheet-head none'; UI.head.innerHTML = ''; return; }
    UI.head.className = 'sheet-head' + (o.border ? ' border' : '');
    const acts = o.actions || [];
    UI.head.innerHTML = (root ? '' : '<button class="back" data-back aria-label="Zurück">' + icon('back') + '</button>') +
      '<h1' + (o.small ? ' class="sm"' : '') + '>' + esc(o.title || '') + '</h1>' +
      '<div class="acts">' + acts.map((a, i) => '<button class="act' + (a.on ? ' on' : '') + '" data-act="' + i + '" aria-label="' + esc(a.label) + '" title="' + esc(a.label) + '">' + icon(a.icon) + '</button>').join('') +
      // X: direkt zurück zum Start („Wo geht's hin?“)
      (root ? '' : '<button class="act home" data-home aria-label="Zum Start" title="Zum Start">' + icon('close') + '</button>') + '</div>';
    const b = UI.head.querySelector('[data-back]');
    if (b) b.addEventListener('click', () => UI.back());
    const x = UI.head.querySelector('[data-home]');
    if (x) x.addEventListener('click', (e) => { e.stopPropagation(); UI.home(); });
    UI.head.querySelectorAll('[data-act]').forEach((el) => el.addEventListener('click', (e) => { e.stopPropagation(); acts[+el.dataset.act].onClick(el); }));
  }

  /* =====================================================================
     Gesten: Griff/Kopf ziehen, Inhalt scrollen regelt die Kartenansicht
     ===================================================================== */
  function settle(vel, h0) {
    const max = UI.maxH(), min = UI.minH();
    if (vel < -0.7) UI.setH(max);
    else if (vel > 0.7) UI.setH(h0 >= max - 1 ? max * 0.5 : min);
    if (UI.cur) UI.cur.entry.h = UI.h;
  }
  function initGestures() {
    const sheet = UI.sheet;
    // 1) Griff, Kopfzeile und Kopfbereich: Zeiger ziehen (Maus & Touch)
    [UI.grab, UI.head, UI.extra].forEach((el) => {
      let st = null;
      el.addEventListener('pointerdown', (e) => {
        if (e.button > 0 || e.target.closest('button, input, a, select, textarea')) return;
        st = { y0: e.clientY, h0: UI.h, ly: e.clientY, lt: performance.now(), v: 0, moved: false };
        try { el.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ }
      });
      el.addEventListener('pointermove', (e) => {
        if (!st) return;
        const dy = e.clientY - st.y0;
        if (!st.moved && Math.abs(dy) < 4) return;
        if (!st.moved) { st.moved = true; UI.dragging = true; sheet.classList.add('dragging'); }
        const now = performance.now();
        st.v = (e.clientY - st.ly) / Math.max(1, now - st.lt); st.ly = e.clientY; st.lt = now;
        UI.setH(st.h0 - dy, false);
      });
      const end = () => {
        if (!st) return;
        UI.dragging = false; sheet.classList.remove('dragging');
        if (st.moved) settle(st.v, st.h0);
        else if (el === UI.grab) UI.setH(UI.h >= UI.maxH() - 1 ? UI.maxH() * 0.5 : UI.maxH());
        st = null;
      };
      el.addEventListener('pointerup', end);
      el.addEventListener('pointercancel', end);
    });

    // 2) Inhalt: nach oben wischen vergrößert erst das Sheet, ganz oben nach unten wischen verkleinert es
    let t = null;
    sheet.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 1 || !UI.body.contains(e.target)) { t = null; return; }
      const y = e.touches[0].clientY;
      t = { y0: y, ly: y, lt: performance.now(), v: 0, mode: null, sc: UI.scroller, h0: UI.h, s0: 0 };
    }, { passive: true });
    sheet.addEventListener('touchmove', (e) => {
      if (!t) return;
      const y = e.touches[0].clientY, dy = y - t.y0;
      if (!t.mode) {
        if (Math.abs(dy) < 6) return;
        const max = UI.maxH();
        const inHScroll = e.target.closest('.chips, .opts, .hist, .tabs');
        if (inHScroll && Math.abs(dy) < 14) return;
        if (dy < 0 && UI.h < max - 1) t.mode = 'sheet';
        else if (dy > 0 && t.sc.scrollTop <= 0) t.mode = 'sheet';
        else t.mode = 'scroll';
        if (t.mode === 'sheet') { t.y0 = y; t.h0 = UI.h; t.s0 = t.sc.scrollTop; UI.dragging = true; sheet.classList.add('dragging'); }
      }
      if (t.mode !== 'sheet') return;
      e.preventDefault();
      const now = performance.now();
      t.v = (y - t.ly) / Math.max(1, now - t.lt); t.ly = y; t.lt = now;
      const max = UI.maxH();
      let h = t.h0 - (y - t.y0);
      if (h > max) { t.sc.scrollTop = t.s0 + (h - max); h = max; }
      UI.setH(h, false);
    }, { passive: false });
    const tEnd = () => {
      if (t && t.mode === 'sheet') { UI.dragging = false; sheet.classList.remove('dragging'); settle(t.v, t.h0); }
      t = null;
    };
    sheet.addEventListener('touchend', tEnd);
    sheet.addEventListener('touchcancel', tEnd);

    // 3) Mausrad/Trackpad: gleiches Verhalten am Desktop
    sheet.addEventListener('wheel', (e) => {
      if (!UI.body.contains(e.target) && !UI.head.contains(e.target) && !UI.grab.contains(e.target)) return;
      if (e.ctrlKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      const max = UI.maxH(), sc = UI.scroller;
      if (e.deltaY > 0 && UI.h < max - 1) { e.preventDefault(); UI.setH(UI.h + e.deltaY, false); }
      else if (e.deltaY < 0 && sc.scrollTop <= 0 && UI.h > UI.minH()) { e.preventDefault(); UI.setH(UI.h + e.deltaY, false); }
      if (UI.cur) UI.cur.entry.h = UI.h;
    }, { passive: false });
  }

  /* iOS/Android: Bildschirmtastatur – Sheet bleibt darüber (visualViewport) */
  function initKeyboard() {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      const kb = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
      const val = kb > 80 ? kb : 0;
      if (val === (UI.kb || 0)) return;
      UI.kb = val;
      document.documentElement.style.setProperty('--kb', val + 'px');
      if (UI.tabbar) UI.tabbar.classList.toggle('kb', !!val);
      UI.setH(val ? UI.maxH() : (UI.cur && UI.cur.entry.h) || UI.h, false);
    };
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    document.addEventListener('focusout', () => setTimeout(() => { if (!UI.kb) window.scrollTo(0, 0); }, 120));
  }
})(window.Muvit = window.Muvit || {});
