/* Muvit – UI-Grundgerüst: Sheet-Navigation, Layout, wiederverwendbare Komponenten */
(function (M) {
  'use strict';

  const $ = M.$;
  const app = () => document.getElementById('app');

  /* =====================================================================
     Komponenten
     ===================================================================== */
  const C = {};
  M.C = C;

  C.lineBadge = function (line, opts) {
    if (!line) return '';
    opts = opts || {};
    const mi = M.modeInfo(line.mode);
    const withIcon = opts.icon || (line.mode === 'fern' || line.mode === 'regio') && opts.icon !== false;
    return '<span class="lb ' + line.mode + (opts.lg ? ' lg' : '') + '" style="background:' + line.color + ';color:' + line.text + '" title="' + M.esc(mi.label + ' ' + line.full) + '">' +
      (withIcon ? M.icon(mi.icon) : '') + M.esc(line.name) + '</span>';
  };
  C.modeIcon = function (mode, color) {
    const mi = M.modeInfo(mode);
    return '<span class="mode-ico" style="background:' + (color || mi.color) + '">' + M.icon(mi.icon) + '</span>';
  };
  C.delayClass = function (delay, realtime) {
    if (!realtime || delay == null) return '';
    if (delay <= 0) return 'ok';
    if (delay < 5) return 'warn';
    return 'late';
  };
  /** Zeit mit Echtzeit: grün pünktlich, orange/rot verspätet, Plan durchgestrichen */
  C.time = function (time, planned, delay, realtime, cancelled) {
    if (cancelled) return '<span class="t late">' + M.fmtTime(planned || time) + '</span>';
    const cls = C.delayClass(delay, realtime);
    let html = '<span class="t ' + cls + '">' + M.fmtTime(time || planned) + '</span>';
    if (realtime && delay && delay !== 0 && planned) html += '<span class="t-plan">' + M.fmtTime(planned) + '</span>';
    return html;
  };
  C.rtPill = function (delay, realtime, cancelled) {
    if (cancelled) return '<span class="rt-pill cancel">fällt aus</span>';
    if (!realtime || delay == null) return '<span class="rt-pill plan">Fahrplan</span>';
    if (delay <= 0) return '<span class="rt-pill ok"><span class="live"></span>pünktlich</span>';
    return '<span class="rt-pill ' + (delay < 5 ? 'warn' : 'late') + '"><span class="live"></span>+' + delay + ' Min</span>';
  };
  C.platform = function (p, planned) {
    if (!p) return '';
    const changed = planned && p !== planned;
    return '<span class="plat' + (changed ? ' changed' : '') + '" title="' + (changed ? 'Gleiswechsel, geplant ' + M.esc(planned) : '') + '">' + (/^\d+[a-z]?$/i.test(p) ? 'Gl. ' : '') + M.esc(p) + '</span>';
  };
  C.empty = function (icon, title, text, btn) {
    return '<div class="empty fade-in"><div class="empty-ico">' + M.icon(icon) + '</div><h3>' + M.esc(title) + '</h3>' +
      (text ? '<p>' + text + '</p>' : '') + (btn || '') + '</div>';
  };
  C.skeleton = function (kind, n) {
    let s = '';
    for (let i = 0; i < (n || 4); i++) s += '<div class="skel ' + (kind === 'card' ? 'skel-card' : 'skel-row') + '" style="animation-delay:' + i * 80 + 'ms"></div>';
    return s;
  };
  C.error = function (err, onRetry) {
    const net = err && (err.network || err.status === 0);
    const el = M.h(C.empty(net ? 'wifiOff' : 'alert', net ? 'Keine Verbindung' : 'Das hat nicht geklappt',
      M.esc((err && err.message) || 'Unbekannter Fehler'), onRetry ? '<button class="btn soft sm" data-retry>' + M.icon('refresh') + 'Erneut versuchen</button>' : ''));
    if (onRetry) el.querySelector('[data-retry]').addEventListener('click', onRetry);
    return el;
  };
  C.alerts = function (alerts) {
    return (alerts || []).map((a) => '<div class="note warn tl-alert">' + M.icon('alert') + '<div><b>' + M.esc(a.title) + '</b>' +
      (a.text ? '<br>' + M.esc(a.text.slice(0, 280)) + (a.text.length > 280 ? '…' : '') : '') + '</div></div>').join('');
  };

  /* ---------- Verbindungskarte (neu designt) ---------- */
  C.segmentBar = function (j) {
    const total = Math.max(1, j.legs.reduce((s, l) => s + Math.max(1, l.duration || 1), 0));
    return '<div class="jc-bar">' + j.legs.map((l) => {
      const grow = Math.max(l.walk ? 0.6 : 1.4, (Math.max(1, l.duration) / total) * 12);
      if (l.walk) {
        return '<div class="jc-seg walk" style="flex:' + grow.toFixed(2) + ' 1 0" title="' + Math.round(l.duration) + ' Min Fußweg">' +
          (l.duration >= 3 && grow > 1.3 ? '<span>' + M.icon('walk') + '</span>' : '') + '</div>';
      }
      const mi = M.modeInfo(l.line.mode);
      return '<div class="jc-seg" style="flex:' + grow.toFixed(2) + ' 1 0;background:' + l.line.color + ';color:' + l.line.text + '" title="' + M.esc(mi.label + ' ' + l.line.full + ' → ' + l.headsign) + '">' +
        (grow > 2.2 ? M.icon(mi.icon) : '') + M.esc(l.line.name) + '</div>';
    }).join('') + '</div>';
  };
  C.journeyCard = function (j, idx, opts) {
    opts = opts || {};
    const first = j.legs.find((l) => !l.walk);
    const dDep = first ? first.from.delay : null;
    const dStart = j.realtime ? M.delayMin(j.legs[0].from.time, j.legs[0].from.planned) : null;
    const dArr = j.realtime ? M.delayMin(j.legs[j.legs.length - 1].to.time, j.legs[j.legs.length - 1].to.planned) : null;
    const walkStart = j.legs[0].walk ? Math.round(j.legs[0].duration) : 0;
    const dep = j.legs[0].from;
    const last = j.legs[j.legs.length - 1].to;
    let foot = '';
    if (first) {
      foot = (walkStart ? M.icon('walk') + walkStart + ' Min, dann ' : '') +
        'ab <b>' + M.esc(first.from.name) + '</b>' + (first.from.platform ? ' · ' + (/^\d/.test(first.from.platform) ? 'Gl. ' : '') + M.esc(first.from.platform) : '');
    } else foot = M.icon('walk') + ' Komplett zu Fuß · ' + M.fmtDist(j.legs[0].distance);
    const mins = M.minsUntil(dep.time);
    return '<button class="jc fade-in' + (j.cancelled ? ' cancelled' : '') + (opts.sel ? ' sel' : '') + '" data-idx="' + idx + '">' +
      (opts.badge ? '<span class="jc-badge">' + M.esc(opts.badge) + '</span>' : '') +
      '<div class="jc-top"><div class="jc-times">' +
        '<span class="big">' + C.time(dep.time, dep.planned, dStart, j.realtime, false) + '</span>' +
        '<span class="arrow">' + M.icon('arrow') + '</span>' +
        '<span class="big">' + C.time(last.time, last.planned, dArr, j.realtime, false) + '</span>' +
      '</div><div class="jc-dur"><div class="d">' + M.fmtDur(j.duration) + '</div><div class="x">' +
        (j.transfers ? j.transfers + (j.transfers === 1 ? ' Umstieg' : ' Umstiege') : 'Direkt') + '</div></div></div>' +
      '<div class="jc-delay">' + (j.cancelled ? C.rtPill(0, true, true) : first ? C.rtPill(dDep, first.realtime, false) : '') +
        (j.price ? '<span class="rt-pill plan">ab ' + M.money(j.price.amount, j.price.currency) + '</span>' : '') +
        (j.legs.some((l) => l.alerts && l.alerts.length) ? '<span class="rt-pill warn">' + M.icon('alert') + 'Hinweise</span>' : '') + '</div>' +
      C.segmentBar(j) +
      '<div class="jc-foot"><span class="grow">' + foot + '</span>' +
        (mins >= 0 && mins <= 90 ? '<span class="countdown">' + M.fmtCountdown(dep.time) + '</span>' : '') + '</div>' +
      '</button>';
  };

  /* ---------- Abfahrtszeile ---------- */
  C.depRow = function (x, idx, opts) {
    opts = opts || {};
    const mins = M.minsUntil(x.time);
    const big = x.cancelled ? '<span class="t late">–</span>' :
      mins <= 0 ? '<span class="mins now">jetzt</span>' :
      mins < 60 ? '<span class="mins">' + mins + '<small>Min</small></span>' : '<span class="mins">' + M.fmtTime(x.time) + '</span>';
    return '<button class="dep fade-in' + (x.cancelled ? ' cancelled' : '') + '" data-idx="' + idx + '">' +
      C.lineBadge(x.line, { lg: true }) +
      '<div style="min-width:0"><div class="dep-dir">' + M.esc(x.headsign || '–') + '</div>' +
        '<div class="dep-sub">' + C.rtPill(x.delay, x.realtime, x.cancelled) + (x.platform ? C.platform(x.platform, x.plannedPlatform) : '') +
        (opts.showStop && x.stop ? '<span>' + M.esc(x.stop.name) + '</span>' : '') + '</div></div>' +
      '<div class="dep-when">' + big + '<div class="clock">' + C.time(x.time, x.planned, x.delay, x.realtime, x.cancelled) + '</div></div>' +
      '</button>';
  };

  /* =====================================================================
     Sheet-Navigation
     ===================================================================== */
  const UI = {
    stack: [], cur: null, snap: 'half', views: {},
    sheet: null, head: null, body: null
  };
  M.UI = UI;
  M.Views = UI.views;

  UI.init = function () {
    UI.sheet = $('#sheet'); UI.head = $('#sheetHead'); UI.body = $('#sheetBody');
    initDrag();
    window.addEventListener('resize', M.debounce(() => { if (UI.cur) UI.setSnap(UI.snap, true); UI.layout(); M.Map.resize(); }, 120));
    UI.layout();
  };

  function snapPx(name) {
    const H = window.innerHeight;
    const top = topReserve();
    const max = H - top;
    if (name === 'peek') return Math.min(max, Math.max(230, Math.round(H * 0.32)));
    if (name === 'full') return max;
    return Math.min(max, Math.round(H * 0.56));
  }
  function topReserve() {
    const tb = $('#topbar').getBoundingClientRect();
    let y = tb.bottom + 10;
    if (app().classList.contains('show-pill')) { const rp = $('#routePill').getBoundingClientRect(); if (rp.height) y = rp.bottom + 10; }
    return Math.max(70, y);
  }

  UI.setSnap = function (name, instant) {
    UI.snap = name;
    if (M.isDesktop()) { UI.sheet.style.height = ''; UI.layout(); return; }
    if (instant) UI.sheet.classList.add('dragging');
    UI.sheet.style.height = snapPx(name) + 'px';
    if (instant) requestAnimationFrame(() => UI.sheet.classList.remove('dragging'));
    setTimeout(UI.layout, instant ? 0 : 400);
  };

  UI.mapPadding = function () {
    const W = window.innerWidth, H = window.innerHeight;
    if (M.isDesktop()) {
      return { top: 60, bottom: 60, left: 20 + 420 + 40, right: 70 };
    }
    let top, bottom;
    if (UI.cur) {
      top = topReserve() + 6;
      bottom = (UI.sheet.getBoundingClientRect().height || snapPx(UI.snap)) + 16;
    } else {
      const col = $('#overlayCol'), sc = $('#recentRow'), card = $('#searchCard');
      top = col.offsetTop + Math.max(card.offsetTop + card.offsetHeight, sc.offsetTop + sc.offsetHeight) + 12;
      bottom = dockReserve() + 16;
    }
    if (top + bottom > H - 140) { const k = (H - 140) / (top + bottom); top *= k; bottom *= k; }
    return { top: Math.round(top), bottom: Math.round(bottom), left: 30, right: Math.min(70, W * 0.15) };
  };

  function dockReserve() {
    const col = $('#overlayCol'), d = $('#dock');
    return window.innerHeight - (col.offsetTop + d.offsetTop);
  }
  UI.layout = function () {
    const ctrls = $('#mapCtrls'), badge = $('#liveBadge');
    const attrib = document.querySelector('.maplibregl-ctrl-bottom-left');
    if (M.isDesktop()) {
      ctrls.style.bottom = ''; badge.style.bottom = ''; ctrls.classList.remove('hide');
      if (UI.cur) UI.sheet.style.top = topReserve() + 'px'; else UI.sheet.style.top = '';
      if (attrib) { attrib.style.left = '460px'; attrib.style.bottom = '0px'; }
      return;
    }
    const h = UI.cur ? UI.sheet.getBoundingClientRect().height : dockReserve();
    ctrls.style.bottom = Math.round(h + 12) + 'px';
    badge.style.bottom = Math.round(h + 14) + 'px';
    // Kartenknöpfe nur zeigen, wenn genug Karte sichtbar ist
    ctrls.classList.toggle('hide', window.innerHeight - h - topReserve() < 130);
    if (attrib) { attrib.style.left = '0px'; attrib.style.bottom = Math.round(h + 6) + 'px'; attrib.classList.toggle('hide', window.innerHeight - h - topReserve() < 60); }
  };

  /* ---------- Öffnen / Zurück / Home ---------- */
  UI.open = function (id, params, opts) {
    const v = UI.views[id];
    if (!v) { console.error('Unbekannte Ansicht', id); return; }
    M.Map.closePopup();
    if (UI.cur) { teardown(UI.cur); }
    const entry = { id, params: params || {}, opts: opts || {} };
    if (opts && opts.replace && UI.stack.length) UI.stack[UI.stack.length - 1] = entry;
    else UI.stack.push(entry);
    show(entry);
  };
  UI.back = function () {
    if (UI.cur) teardown(UI.cur);
    UI.stack.pop();
    const prev = UI.stack[UI.stack.length - 1];
    if (prev) show(prev, true); else UI.home();
  };
  UI.home = function () {
    if (UI.cur) teardown(UI.cur);
    UI.stack = []; UI.cur = null;
    UI.sheet.hidden = true;
    app().classList.add('is-home');
    UI.setPill(null);
    M.Map.clearRoute();
    M.Map.closePopup();
    M.emit('home');
    requestAnimationFrame(UI.layout);
    setTimeout(UI.layout, 450);
  };
  UI.refresh = function () { if (UI.cur) { const e = UI.cur.entry; teardown(UI.cur); show(e, true); } };

  function teardown(cur) {
    cur.alive = false;
    cur.cleanups.forEach((fn) => { try { fn(); } catch (e) { console.error(e); } });
    cur.cleanups = [];
  }

  function show(entry, restoring) {
    const v = UI.views[entry.id];
    app().classList.remove('is-home');
    UI.sheet.hidden = false;
    UI.setPill(null);
    const cur = { entry, alive: true, cleanups: [] };
    UI.cur = cur;
    const ctx = {
      params: entry.params, body: UI.body, restoring: !!restoring,
      alive: () => cur.alive && UI.cur === cur,
      cleanup: (fn) => cur.cleanups.push(fn),
      on: (evt, fn) => cur.cleanups.push(M.on(evt, fn)),
      every: (ms, fn) => { const t = setInterval(() => { if (!document.hidden) fn(); }, ms); cur.cleanups.push(() => clearInterval(t)); },
      head: (o) => renderHead(o, ctx),
      open: UI.open, back: UI.back,
      setSnap: UI.setSnap,
      state: entry.state || (entry.state = {})
    };
    UI.body.className = 'sheet-body' + (v.noPad ? ' no-pad' : '');
    UI.body.innerHTML = '';
    UI.body.scrollTop = 0;
    renderHead({ title: v.title || '', sub: '' }, ctx);
    const snap = (restoring && entry.lastSnap) || entry.opts.snap || v.snap || 'half';
    UI.setSnap(snap);
    try { v.render(ctx); } catch (e) { console.error(e); UI.body.appendChild(C.error(e)); }
    requestAnimationFrame(UI.layout);
  }

  function renderHead(o, ctx) {
    const acts = (o.actions || []);
    UI.head.innerHTML =
      '<button class="icon-btn flat" data-back aria-label="Zurück">' + M.icon(UI.stack.length > 1 ? 'back' : 'close') + '</button>' +
      '<div class="sh-titles"><h2>' + M.esc(o.title || '') + '</h2>' + (o.sub ? '<div class="sh-sub">' + o.sub + '</div>' : '') + '</div>' +
      '<div class="sh-actions">' + acts.map((a, i) => '<button class="icon-btn flat' + (a.on ? ' active' : '') + '" data-act="' + i + '" aria-label="' + M.esc(a.label) + '" title="' + M.esc(a.label) + '">' + M.icon(a.icon) + '</button>').join('') + '</div>';
    UI.head.querySelector('[data-back]').addEventListener('click', () => UI.back());
    UI.head.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); acts[+b.dataset.act].onClick(b); }));
  }

  /* ---------- Routen-Pille oben ---------- */
  UI.setPill = function (html, onClick) {
    const p = $('#routePill');
    if (!html) { app().classList.remove('show-pill'); p.innerHTML = ''; p.onclick = null; return; }
    p.innerHTML = html;
    p.onclick = onClick || null;
    app().classList.add('show-pill');
    requestAnimationFrame(() => { if (UI.cur) UI.setSnap(UI.snap, true); UI.layout(); });
  };
  UI.routePillHTML = function (from, to, sub) {
    return '<div class="rp-text"><div class="rp-line"><span class="rp-dot" style="background:var(--primary)"></span>' + M.esc(M.isMe(from) ? 'Mein Standort' : from.name) +
      '<span style="color:var(--text-3)">' + M.icon('arrow') + '</span><span class="rp-dot" style="background:var(--late)"></span>' + M.esc(to.name) + '</div>' +
      (sub ? '<div class="rp-sub">' + sub + '</div>' : '') + '</div><span class="icon-btn flat" style="width:34px;height:34px">' + M.icon('search') + '</span>';
  };

  /* ---------- Ziehen des Sheets ---------- */
  function initDrag() {
    const grip = $('#sheetGrip'), head = $('#sheetHead'), sheet = $('#sheet');
    let startY = 0, startH = 0, lastY = 0, lastT = 0, vel = 0, dragging = false;
    const down = (e) => {
      if (M.isDesktop() || e.target.closest('button, input, a, select, textarea')) return;
      dragging = true; startY = lastY = e.clientY; startH = sheet.getBoundingClientRect().height; lastT = performance.now(); vel = 0;
      sheet.classList.add('dragging');
      e.currentTarget.setPointerCapture && e.currentTarget.setPointerCapture(e.pointerId);
    };
    const move = (e) => {
      if (!dragging) return;
      const now = performance.now();
      vel = (e.clientY - lastY) / Math.max(1, now - lastT);
      lastY = e.clientY; lastT = now;
      const h = Math.max(120, Math.min(snapPx('full'), startH - (e.clientY - startY)));
      sheet.style.height = h + 'px';
      UI.layout();
    };
    const up = () => {
      if (!dragging) return;
      dragging = false; sheet.classList.remove('dragging');
      const h = sheet.getBoundingClientRect().height;
      const pts = ['peek', 'half', 'full'].map((n) => [n, snapPx(n)]);
      if (h < snapPx('peek') - 70 && vel > 0.3) { UI.back(); return; }
      let best = pts[0];
      if (Math.abs(vel) > 0.45) {
        // Wischgeste: nächster Punkt in Bewegungsrichtung
        const dir = vel > 0 ? -1 : 1;
        const sorted = pts.slice().sort((a, b) => a[1] - b[1]);
        best = dir > 0 ? (sorted.find((p) => p[1] > h + 10) || sorted[sorted.length - 1]) : (sorted.slice().reverse().find((p) => p[1] < h - 10) || sorted[0]);
      } else {
        pts.forEach((p) => { if (Math.abs(p[1] - h) < Math.abs(best[1] - h)) best = p; });
      }
      if (UI.cur) UI.cur.entry.lastSnap = best[0];
      UI.setSnap(best[0]);
    };
    [grip, head].forEach((el) => {
      el.addEventListener('pointerdown', down);
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
    });
    grip.addEventListener('click', () => {
      if (!UI.cur) return;
      const next = UI.snap === 'full' ? 'half' : UI.snap === 'half' ? 'full' : 'half';
      UI.cur.entry.lastSnap = next; UI.setSnap(next);
    });
  }
})(window.Muvit = window.Muvit || {});
