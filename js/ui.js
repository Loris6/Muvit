/* Muvit – UI: frei ziehbares Sheet über der Karte, Navigation, Komponenten im Referenz-Stil */
(function (M) {
  'use strict';

  const $ = M.$, esc = M.esc, icon = M.icon;

  /* =====================================================================
     Komponenten
     ===================================================================== */
  const C = {};
  M.C = C;

  /** Verkehrsmittel-Zeichen wie an der Haltestelle: „Tram“ (eckig, rot) / „Bus“ (rund, lila) */
  C.modeBadge = function (mode, o) {
    o = o || {};
    const sm = o.sm ? ' sm' : '';
    if (mode === 'tram') return '<span class="bd m tram' + sm + '">Tram</span>';
    if (mode === 'bus') return '<span class="bd m bus' + sm + '">' + (o.upper ? 'BUS' : 'Bus') + '</span>';
    if (mode === 'sbahn') return '<span class="bd' + sm + '" style="background:#000">s</span>';
    if (mode === 'regio') return '<span class="bd' + sm + '" style="background:#DE6459">RE</span>';
    if (mode === 'fern') return '<span class="bd' + sm + '" style="background:#fff;color:#BA2619">IC</span>';
    if (mode === 'ferry') return '<span class="bd' + sm + '" style="background:#1C7FB0">F</span>';
    return '';
  };
  /** Liniennummer: Tram eckig in Linienfarbe, Bus rund */
  C.lineBadge = function (line, o) {
    if (!line) return '';
    o = o || {};
    const round = line.mode === 'bus' ? ' round' : '';
    return '<span class="bd' + round + (o.sm ? ' sm' : '') + '" style="background:' + line.color + ';color:' + line.text + '" title="' + esc(M.modeInfo(line.mode).label + ' ' + line.full) + '">' + esc(line.name) + '</span>';
  };
  /** Immer „Tram“/„Bus“ + Linie (Züge: nur Linie, z. B. RE1, S1) */
  C.badges = function (line, o) {
    if (!line) return '';
    o = o || {};
    const withMode = line.mode === 'tram' || line.mode === 'bus';
    return '<span class="bds">' + (withMode ? C.modeBadge(line.mode, o) : '') + C.lineBadge(line, o) + '</span>';
  };
  /** Linien einer Haltestelle (Bild „Abfahrten / Departure“): Linien | weitere Verkehrsmittel */
  C.stopLines = function (lines) {
    const ls = M.sortLines(lines || []);
    const main = ls.filter((l) => l.mode === 'tram' || l.mode === 'bus').slice(0, 12);
    const modes = [];
    if (ls.some((l) => l.mode === 'bus')) modes.push('bus');
    ['regio', 'sbahn', 'fern'].forEach((m) => { if (ls.some((l) => l.mode === m)) modes.push(m); });
    let h = main.map((l) => C.lineBadge(l, { sm: true })).join('');
    if (modes.length) h += (main.length ? '<span class="vsep"></span>' : '') + modes.map((m) => C.modeBadge(m, { sm: true })).join('');
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
  C.platform = (p) => (p ? (/^\d+$/.test(p) ? 'Gleis ' + p : 'Bahnsteig ' + p) : '');
  C.bstg = (p) => (p ? '<span class="bstg">' + (/^\d+$/.test(p) ? 'Gl. ' : 'Bstg. ') + esc(p) + '</span>' : '');

  /** Abfahrtszeile wie im Bild „Haltestelle“ */
  C.depRow = function (x, i, o) {
    o = o || {};
    const st = C.status(x);
    const clk = 'Um ' + M.fmtTime(x.planned || x.time) + (x.realtime && x.delay ? '<span class="vsl"> (vsl.: ' + M.fmtTime(x.time) + ')</span>' : '');
    const sub = [ '<span class="' + st.cls + '">' + esc(st.text) + '</span>' ];
    if (x.platform) sub.push('<span class="pf">' + esc(C.platform(x.platform)) + '</span>');
    if (o.stopName && x.stop) sub.push('<span class="pf">' + esc(x.stop.name) + '</span>');
    let h = '<div class="dep-item' + (x.cancelled ? ' cancel' : '') + '"><button class="dep" data-i="' + i + '">' +
      C.badges(x.line, { upper: true }) +
      '<div style="min-width:0"><div class="dep-name">' + esc(x.headsign || '–') + '</div><div class="dep-sub">' + sub.join('<i class="sep"> • </i>') + '</div></div>' +
      '<div class="dep-r"><div class="cd ' + (x.cancelled ? 'c-red' : st.cls === 'c-gray' ? '' : st.cls) + '">' + C.countdown(x.time, true) + '</div><div class="clk">' + clk + '</div></div>' +
      '<span class="chev">' + icon('right') + '</span></button>';
    (x.alerts || []).slice(0, o.alerts === false ? 0 : 1).forEach((a, k) => {
      h += '<button class="alert-line" data-alert="' + i + ':' + k + '">' + icon('warnFill', 'w') + '<span class="tx">' + esc(a.title) + '</span><span class="chev">' + icon('right') + '</span></button>';
    });
    return h + '</div>';
  };

  /** Haltestellenzeile wie im Bild „Abfahrten / Departure“ */
  C.stopRow = function (s, i, o) {
    o = o || {};
    const lines = s.lines || M.linesForStop(s.name);
    const area = o.area != null ? o.area : (s.area || (s.lat != null && M.inMagdeburg(s.lat, s.lon) ? 'Magdeburg' : ''));
    return '<div class="stop-row" data-i="' + i + '" role="button" tabindex="0">' + icon('hOutline', 'h') +
      '<div style="min-width:0"><div class="nm">' + esc(s.name) + '</div>' +
      '<div class="ln" data-lines="' + i + '">' + C.stopLines(lines) + (area ? '<span class="area">• ' + esc(area) + '</span>' : '') + '</div></div>' +
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
    const sub = first ? '<span class="' + st.cls + '">' + esc(st.text) + '</span> • ab ' + esc(first.from.name) + (first.from.platform ? ', ' + esc(C.platform(first.from.platform)) : '') : esc(M.fmtDist(j.legs[0].distance));
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

  UI.maxH = () => Math.max(200, window.innerHeight - (UI.kb || 0));
  UI.minH = () => 112;

  UI.init = function () {
    UI.sheet = $('#sheet'); UI.grab = $('#sheetGrab'); UI.head = $('#sheetHead'); UI.extra = $('#sheetExtra'); UI.body = $('#sheetBody');
    UI.scroller = UI.body;
    initGestures();
    initKeyboard();
    window.addEventListener('resize', M.debounce(() => {
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
    if (btn) {
      btn.style.bottom = (UI.h + 12 + (UI.kb || 0)) + 'px';
      btn.classList.toggle('hide', UI.h > UI.maxH() - 150);
    }
  };
  UI.mapPadding = function () {
    const max = UI.maxH();
    return { top: 60, bottom: Math.round(Math.min(UI.h || max * 0.5, max * 0.5)) + 24, left: 36, right: 36 };
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
      '<div class="acts">' + acts.map((a, i) => '<button class="act' + (a.on ? ' on' : '') + '" data-act="' + i + '" aria-label="' + esc(a.label) + '" title="' + esc(a.label) + '">' + icon(a.icon) + '</button>').join('') + '</div>';
    const b = UI.head.querySelector('[data-back]');
    if (b) b.addEventListener('click', () => UI.back());
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
      UI.setH(val ? UI.maxH() : (UI.cur && UI.cur.entry.h) || UI.h, false);
    };
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    document.addEventListener('focusout', () => setTimeout(() => { if (!UI.kb) window.scrollTo(0, 0); }, 120));
  }
})(window.Muvit = window.Muvit || {});
