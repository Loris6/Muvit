/* Muvit – Ansichten im Sheet (Stil nach Referenzbildern) */
(function (M) {
  'use strict';

  const V = M.Views, C = M.C, UI = M.UI;
  const esc = M.esc, icon = M.icon;

  /* ---------------- Helfer ---------------- */
  const recentStops = {
    list: () => M.store.get('recentStops', []),
    add(s) {
      if (!s || !s.name) return;
      const l = recentStops.list().filter((x) => x.name !== s.name);
      l.unshift({ id: s.id, name: s.name, lat: s.lat, lon: s.lon, src: s.src, type: 'stop', area: s.area || '' });
      M.store.set('recentStops', l.slice(0, 20));
    }
  };
  M.recentStops = recentStops;
  const placeName = M.placeName = (p) => (!p ? '' : M.isMe(p) ? 'Mein Standort' : p.name);
  const bindAll = (root, sel, fn) => root.querySelectorAll(sel).forEach((el) => el.addEventListener('click', (e) => fn(el, e)));
  async function nearestStop(place) {
    const list = await M.Transit.nearby(place.lat, place.lon, 600);
    return list[0] || null;
  }
  function timeLabel(q) {
    return q.time ? (q.arriveBy ? 'Ankunft ' : 'Abfahrt ') + M.fmtDayTime(q.time) : 'Abfahrt · Jetzt';
  }
  /** Linien einer Haltestelle nachladen und in die Zeile schreiben */
  async function fillLines(ctx, stops) {
    fillAreas(ctx, stops);
    for (let i = 0; i < stops.length && i < 8; i++) {
      const s = stops[i];
      if (M.linesForStop(s.name).length) continue;
      try { await M.Transit.departures(s, { n: 30 }); } catch (e) { continue; }
      if (!ctx.alive()) return;
      const box = ctx.body.querySelector('[data-lines="' + i + '"]');
      if (box) {
        const area = box.querySelector('.area');
        box.innerHTML = C.stopLines(M.linesForStop(s.name)) + (area ? area.outerHTML : '');
      }
    }
  }

  /** Stadtteil statt „Magdeburg“ (z. B. „Sudenburg“) – wird bei Bedarf nachgeschlagen */
  async function fillAreas(ctx, stops) {
    for (let i = 0; i < stops.length && i < 12; i++) {
      const s = stops[i];
      if (s.area || s.lat == null) continue;
      const d = await M.Transit.district(s).catch(() => '');
      if (!ctx.alive()) return;
      if (!d) continue;
      s.area = d;
      const el = ctx.body.querySelector('[data-area="' + i + '"]');
      if (el) el.textContent = '• ' + d;
    }
  }

  /* =====================================================================
     Start – „Wo geht's hin?“
     ===================================================================== */
  const TILES = [
    ['departures', 'busFront', 'Abfahrten'], ['verkehr', 'megaphone', 'Verkehrsmelder'],
    ['abos', 'idCard', 'Abonnements'], ['netz', 'netz', 'Netzplan'],
    ['tickets', 'ticketV', 'Ticket kaufen'], ['assistant', 'headset', 'Assistance']
  ];
  V.home = {
    height: 'fit',
    render(ctx) {
      ctx.head({ none: true });
      const s = M.state;
      const from = placeName(s.from), to = placeName(s.to);
      const routes = M.favs.routes().map((r) => Object.assign({ fav: true }, r)).concat(M.recents.routes())
        .filter((r, i, a) => a.findIndex((x) => x.key === r.key) === i).slice(0, 8);
      ctx.body.innerHTML =
        '<h2 class="home-title">Wo geht\'s hin?</h2>' +
        '<div class="od">' +
          '<button class="od-row" data-f><span class="radio on"></span><span class="v' + (from ? '' : ' ph') + '">' + esc(from || 'Start eingeben (z.B. Alter Markt)') + '</span></button>' +
          '<div class="od-div"></div>' +
          '<button class="od-row" data-t><span class="radio off"></span><span class="v' + (to ? '' : ' ph') + '">' + esc(to || 'Ziel eingeben (z.B. Hauptbahnhof)') + '</span></button>' +
          '<button class="swap" data-swap aria-label="Start und Ziel tauschen">' + icon('swap') + '</button>' +
        '</div>' +
        '<div class="sec">Aktuelles</div>' +
        '<div class="grid6">' + TILES.map((t) => '<button class="gbtn" data-v="' + t[0] + '">' + icon(t[1]) + '<span>' + t[2] + '</span></button>').join('') + '</div>' +
        '<div class="sec">Verlauf<button class="all" data-allhist>Alle' + icon('right') + '</button></div>' +
        (routes.length ? '<div class="hist" data-fit-end>' + routes.map((r, i) => '<button class="hcard" data-r="' + i + '"><span class="rt"><i></i><b></b><i></i></span><span style="min-width:0"><div class="a">' + esc(placeName(r.from) || 'Mein Standort') + '</div><div class="b">' + esc(r.to.name) + '</div></span></button>').join('') + '</div>'
          : '<div class="empty-hint" data-fit-end>Deine gesuchten Verbindungen erscheinen hier.</div>');
      bindAll(ctx.body, '[data-f]', () => App().pickFrom());
      bindAll(ctx.body, '[data-t]', () => App().pickTo());
      bindAll(ctx.body, '[data-swap]', (el) => { const f = s.from; s.from = s.to; s.to = f; el.classList.toggle('spin'); setTimeout(() => UI.refresh(), 250); });
      bindAll(ctx.body, '.gbtn', (el) => (el.dataset.v === 'tickets' ? UI.switchTab('tickets') : UI.open(el.dataset.v, {})));
      bindAll(ctx.body, '[data-allhist]', () => UI.open('history', {}));
      bindAll(ctx.body, '[data-r]', (el) => { const r = routes[+el.dataset.r]; s.from = r.from; s.to = r.to; s.via = []; App().search(); });
      ctx.on('state', () => { if (ctx.alive()) UI.refresh(); });
    }
  };
  const App = () => M.App;

  /* =====================================================================
     Ortssuche (Start / Ziel / Zwischenhalt)
     ===================================================================== */
  V.places = {
    height: 'full',
    render(ctx) {
      const p = ctx.params;
      ctx.head({ title: p.title || 'Ort suchen' });
      ctx.body.innerHTML =
        '<div class="search">' + icon('search', 'si') + '<input id="plq" placeholder="' + esc(p.placeholder || 'Haltestelle in Magdeburg suchen') + '" autocomplete="off" enterkeyhint="search"><button class="clr" id="plx" hidden aria-label="Leeren">' + icon('close') + '</button></div>' +
        '<div id="plres" style="margin-top:12px"></div>';
      const input = M.$('#plq', ctx.body), res = M.$('#plres', ctx.body), clr = M.$('#plx', ctx.body);
      let results = [], token = 0;
      const pick = (place) => { M.recents.addPlace(place); ctx.back(); if (p.onPick) p.onPick(place); };

      function rows(list, startIdx, sub) {
        return list.map((x, k) => {
          const i = startIdx + k;
          if (x.type === 'stop') return C.stopRow(x, i, { star: false, end: x.distance != null ? M.fmtDist(x.distance) : (M.Geo.pos ? M.fmtDist(M.dist(M.Geo.pos.lat, M.Geo.pos.lon, x.lat, x.lon)) : '') });
          return C.lrow({ icon: x.type === 'address' ? 'pin' : 'flag', white: true, title: esc(M.localName(x.name)), sub: esc(sub ? sub(x) : M.localArea(x.area || '')), chev: false, end: M.Geo.pos ? M.fmtDist(M.dist(M.Geo.pos.lat, M.Geo.pos.lon, x.lat, x.lon)) : '' }, i);
        }).join('');
      }
      function bind(all) {
        res.querySelectorAll('[data-i]').forEach((el) => el.addEventListener('click', () => {
          const k = el.dataset.i;
          if (k === 'me') pick(M.MY_LOCATION);
          else if (k === 'map') pickOnMap();
          else if (all[+k]) pick(all[+k]);
        }));
      }
      async function pickOnMap() {
        UI.setH(UI.minH());
        ctx.cleanup(() => { M.Map._pick = null; });
        const pt = await M.Map.pickPoint();
        if (!ctx.alive()) return;
        const place = { id: pt.lat.toFixed(6) + ',' + pt.lon.toFixed(6), name: 'Markierter Ort', lat: pt.lat, lon: pt.lon, type: 'coord', src: 'device' };
        try { const r = await M.Transit.reverse(pt.lat, pt.lon); if (r[0]) place.name = r[0].name; } catch (e) { /* Koordinaten genügen */ }
        pick(place);
      }
      function renderDefault() {
        const all = [];
        let h = '';
        if (p.allowMe !== false) h += C.lrow({ icon: 'locate', title: 'Mein Standort', sub: M.Geo.pos ? 'GPS · ±' + Math.round(M.Geo.pos.acc || 0) + ' m' : 'Gerätestandort verwenden', chev: false }, 'me');
        h += C.lrow({ icon: 'map', title: 'Auf der Karte wählen', sub: 'Tippe auf einen Punkt der Karte', chev: false }, 'map');
        const rec = M.recents.places().slice(0, 6), fav = M.favs.stops().slice(0, 6);
        if (fav.length) { h += '<div class="lbl">Favoriten</div>' + rows(fav, all.length); all.push(...fav); }
        if (rec.length) { h += '<div class="lbl">Verlauf</div>' + rows(rec, all.length); all.push(...rec); }
        h += '<div data-near></div>';
        res.innerHTML = h; bind(all);
        if (M.Geo.pos) {
          M.Transit.nearby(M.Geo.pos.lat, M.Geo.pos.lon, 700).then((near) => {
            if (!ctx.alive() || input.value.trim()) return;
            const box = M.$('[data-near]', res); if (!box || !near.length) return;
            const nl = near.slice(0, 6), base = all.length;
            all.push(...nl);
            box.innerHTML = '<div class="lbl">In der Nähe</div>' + rows(nl, base);
            box.querySelectorAll('[data-i]').forEach((el) => el.addEventListener('click', () => pick(all[+el.dataset.i])));
          }).catch(() => {});
        }
      }
      const search = M.debounce(async () => {
        const q = input.value.trim();
        clr.hidden = !q;
        if (q.length < 2) { renderDefault(); return; }
        const my = ++token;
        res.innerHTML = C.skel(5);
        try {
          let r = await M.Transit.search(q, M.Geo.pos || M.Map.center());
          if (my !== token || !ctx.alive()) return;
          if (p.stopsFirst) r = r.slice().sort((a, b) => (b.type === 'stop') - (a.type === 'stop'));
          results = r;
          res.innerHTML = r.length ? rows(r, 0) : C.empty('Nichts gefunden', 'Versuche es mit einem anderen Namen oder einer Adresse.');
          bind(r);
        } catch (e) { if (my === token) { res.innerHTML = ''; res.appendChild(C.error(e, search)); } }
      }, 220);
      input.addEventListener('input', search);
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && results[0]) pick(results[0]); });
      clr.addEventListener('click', () => { input.value = ''; search(); input.focus(); });
      renderDefault();
      setTimeout(() => { if (ctx.alive()) input.focus({ preventScroll: true }); }, 350);
    }
  };

  /* =====================================================================
     Zeit & Zwischenhalte
     ===================================================================== */
  V.time = {
    height: 'fit',
    render(ctx) {
      let arriveBy = M.state.arriveBy;
      const iso = M.toLocalInput(M.state.time || new Date());
      ctx.head({ title: 'Wann möchtest du fahren?' });
      ctx.body.innerHTML =
        '<div class="seg"><button data-ab="0">Abfahrt</button><button data-ab="1">Ankunft</button></div>' +
        '<div class="dt"><input class="inp" type="date" id="tdD" value="' + iso.slice(0, 10) + '"><input class="inp" type="time" id="tdT" value="' + iso.slice(11, 16) + '"></div>' +
        '<div class="opts" style="padding-top:0">' + [['0', 'Jetzt'], ['15', '+15 Min.'], ['30', '+30 Min.'], ['60', '+1 Std.'], ['m7', 'Morgen 7:00'], ['m17', 'Morgen 17:00']].map((q) => '<button class="opt" data-q="' + q[0] + '">' + q[1] + '</button>').join('') + '</div>' +
        '<div class="btn-row"><button class="btn-o" data-now>Jetzt fahren</button><button class="btn-a" data-ok style="flex:1">Übernehmen</button></div>';
      const segs = ctx.body.querySelectorAll('[data-ab]');
      const sync = () => segs.forEach((b) => b.classList.toggle('on', (b.dataset.ab === '1') === arriveBy));
      sync();
      segs.forEach((b) => b.addEventListener('click', () => { arriveBy = b.dataset.ab === '1'; sync(); }));
      const dI = M.$('#tdD', ctx.body), tI = M.$('#tdT', ctx.body);
      const set = (d) => { const v = M.toLocalInput(d); dI.value = v.slice(0, 10); tI.value = v.slice(11, 16); };
      bindAll(ctx.body, '[data-q]', (b) => {
        const q = b.dataset.q;
        if (q[0] === 'm') { const p = M.berlinParts(new Date(Date.now() + 864e5)); set(M.fromBerlin(p.y, p.mo, p.d, +q.slice(1), 0)); }
        else set(new Date(Date.now() + +q * 60000));
      });
      const done = (t) => { M.state.time = t; M.state.arriveBy = t ? arriveBy : false; M.emit('state'); ctx.back(); if (ctx.params.onApply) ctx.params.onApply(); };
      bindAll(ctx.body, '[data-now]', () => done(null));
      bindAll(ctx.body, '[data-ok]', () => {
        const [y, mo, d] = dI.value.split('-').map(Number), [h, mi] = tI.value.split(':').map(Number);
        if (!y || isNaN(h)) { M.toast('Bitte Datum und Uhrzeit wählen', { type: 'err' }); return; }
        const t = M.fromBerlin(y, mo, d, h, mi);
        done(Math.abs(t - Date.now()) < 60000 && !arriveBy ? null : t);
      });
    }
  };

  V.via = {
    height: 'fit',
    render(ctx) {
      ctx.head({ title: 'Zwischenhalt' });
      const draw = () => {
        const vias = M.state.via;
        let h = '<div class="hint" style="padding-bottom:12px">' + icon('infoFill') + '<span>Von A nach B über C: bis zu 2 Zwischenhalte. Der Aufenthalt ist die Mindestzeit vor der Weiterfahrt.</span></div>';
        vias.forEach((v, i) => {
          h += '<div class="kv"><div class="k">' + esc(v.place.name) + '<small>Aufenthalt</small></div><div class="stepper"><button data-m="' + i + '" aria-label="weniger">' + icon('minus') + '</button><b>' + (v.stay ? M.fmtDur(v.stay) : 'kein') + '</b><button data-p="' + i + '" aria-label="mehr">' + icon('plus') + '</button><button data-del="' + i + '" aria-label="Entfernen">' + icon('trash') + '</button></div></div>';
        });
        h += '<div class="btn-row">' + (vias.length < 2 ? '<button class="btn-o" data-add>' + icon('plus') + 'Zwischenhalt hinzufügen</button>' : '') + '<button class="btn-a" data-done style="flex:1">Fertig</button></div>';
        ctx.body.innerHTML = h;
        const step = (i, d) => { const v = vias[i]; v.stay = Math.max(0, Math.min(480, (v.stay || 0) + d)); draw(); };
        bindAll(ctx.body, '[data-m]', (b) => step(+b.dataset.m, (vias[+b.dataset.m].stay || 0) > 30 ? -15 : -5));
        bindAll(ctx.body, '[data-p]', (b) => step(+b.dataset.p, (vias[+b.dataset.p].stay || 0) >= 30 ? 15 : 5));
        bindAll(ctx.body, '[data-del]', (b) => { vias.splice(+b.dataset.del, 1); draw(); });
        bindAll(ctx.body, '[data-add]', () => UI.open('places', {
          title: 'Zwischenhalt', placeholder: 'Haltestelle suchen …', allowMe: false, stopsFirst: true,
          onPick: async (place) => {
            let stop = place;
            if (place.type !== 'stop' || place.src !== 'motis') {
              try { stop = await nearestStop(place); } catch (e) { stop = null; }
              if (!stop) { M.toast('Keine Haltestelle in der Nähe gefunden', { type: 'err' }); return; }
              if (stop.name !== place.name) M.toast('Zwischenhalt: nächste Haltestelle „' + stop.name + '“');
            }
            M.state.via.push({ place: stop, stay: 15 });
            M.emit('via');
          }
        }));
        bindAll(ctx.body, '[data-done]', () => { ctx.back(); if (ctx.params.onApply) ctx.params.onApply(); });
      };
      ctx.on('via', () => { if (ctx.alive()) draw(); });
      draw();
    }
  };

  /* =====================================================================
     Verbindungen (Liste)
     ===================================================================== */
  function queryFromState() {
    return { from: M.state.from || M.MY_LOCATION, to: M.state.to, via: M.state.via.map((v) => ({ place: v.place, stay: v.stay })), time: M.state.time, arriveBy: M.state.arriveBy, dticket: !!M.state.dticket };
  }
  M.queryFromState = queryFromState;
  const ALL_MODES = ['tram', 'bus', 'sbahn', 'ubahn', 'regio', 'fern', 'ferry'];
  async function runJourneys(q, cursor) {
    const from = await M.concretePlace(q.from), to = await M.concretePlace(q.to);
    // Reise-Optionen (Mehr › Reise-Optionen): Verkehrsmittel, Umstiege, barrierefrei
    const t = M.settings.travel || {};
    let modes = t.modes && t.modes.length && t.modes.length < ALL_MODES.length ? ALL_MODES.filter((m) => t.modes.includes(m)) : null;
    if (q.dticket) modes = (modes || ALL_MODES).filter((m) => m !== 'fern');
    return M.Transit.journeys({ from, to, via: q.via, time: q.time, arriveBy: q.arriveBy, cursor, modes, maxTransfers: t.maxTransfers != null ? t.maxTransfers : null, wheelchair: !!t.wheelchair });
  }
  M.runJourneys = runJourneys;

  V.journeys = {
    height: 0.94,
    render(ctx) {
      const q = ctx.params.query, st = ctx.state;
      const head = () => ctx.head({
        title: 'Verbindungen',
        actions: [
          { icon: M.favs.hasRoute(q.from, q.to) ? 'starFill' : 'star', label: 'Route merken', on: M.favs.hasRoute(q.from, q.to), onClick: () => { const on = M.favs.toggleRoute(q.from, q.to); M.toast(on ? 'Route gemerkt' : 'Route entfernt'); head(); } },
          { icon: 'refresh', label: 'Aktualisieren', onClick: () => load(true) }
        ]
      });
      head();
      ctx.body.innerHTML =
        '<div class="od"><button class="od-row" data-f><span class="radio on"></span><span class="v">' + esc(placeName(q.from)) + '</span></button><div class="od-div"></div>' +
        '<button class="od-row" data-t><span class="radio off"></span><span class="v">' + esc(placeName(q.to)) + '</span></button><button class="swap" data-swap>' + icon('swap') + '</button></div>' +
        '<div class="opts"><button class="opt' + (q.time ? ' on' : '') + '" data-time>' + icon('clock') + esc(timeLabel(q)) + '</button>' +
        '<button class="opt' + (q.via.length ? ' on' : '') + '" data-via>' + icon('route') + (q.via.length ? 'über ' + esc(q.via[0].place.name) + (q.via[0].stay ? ' · ' + q.via[0].stay + ' Min.' : '') : 'Zwischenhalt') + '</button>' +
        '<button class="opt' + (q.dticket ? ' on' : '') + '" data-dt>' + icon('ticket') + 'Deutschlandticket</button></div>' +
        '<div class="hr"></div><div id="jl"></div>';
      const list = M.$('#jl', ctx.body);
      const reload = () => { st.list = null; UI.refresh(); };
      bindAll(ctx.body, '[data-f]', () => UI.open('places', { title: 'Start', onPick: (p) => { q.from = M.state.from = p; reload(); } }));
      bindAll(ctx.body, '[data-t]', () => UI.open('places', { title: 'Ziel', onPick: (p) => { q.to = M.state.to = p; reload(); } }));
      bindAll(ctx.body, '[data-swap]', () => { const f = q.from; q.from = M.state.from = q.to; q.to = M.state.to = f; reload(); });
      bindAll(ctx.body, '[data-time]', () => UI.open('time', { onApply: () => { q.time = M.state.time; q.arriveBy = M.state.arriveBy; reload(); } }));
      bindAll(ctx.body, '[data-via]', () => UI.open('via', { onApply: () => { q.via = M.state.via.map((v) => ({ place: v.place, stay: v.stay })); reload(); } }));
      bindAll(ctx.body, '[data-dt]', () => { q.dticket = M.state.dticket = !q.dticket; reload(); });

      function draw() {
        const items = (st.list || []).concat(st.direct && st.direct[0] && st.direct[0].duration <= 45 ? [st.direct[0]] : []);
        if (!items.length) { list.innerHTML = C.empty('Keine Verbindung gefunden', 'Probiere eine andere Uhrzeit, entferne Zwischenhalte oder wähle eine nahe Haltestelle.'); return; }
        list.innerHTML = (st.prev ? '<button class="pager" data-prev>Früher</button>' : '') + items.map((j, i) => C.jrow(j, i)).join('') +
          (st.next ? '<button class="pager" data-next>Später</button>' : '') +
          '<div class="src-note">' + icon('live') + 'Echtzeit · ' + esc(st.source || 'Transitous') + ' · ' + M.fmtTime(new Date()) + '</div>';
        bindAll(list, '.jrow', (b) => { st.sel = +b.dataset.i; UI.open('journey', { j: items[st.sel], query: q }); });
        bindAll(list, '[data-prev]', () => page('prev'));
        bindAll(list, '[data-next]', () => page('next'));
        M.Map.drawJourney(items[st.sel != null && items[st.sel] ? st.sel : 0]);
      }
      async function load(force) {
        if (st.list && !force) { draw(); return; }
        if (!st.list) list.innerHTML = C.skel(5);
        try {
          const r = await runJourneys(q);
          if (!ctx.alive()) return;
          Object.assign(st, { list: r.list, direct: r.direct, next: r.next, prev: r.prev, source: r.fallback || M.Transit.lastSource });
          M.recents.addRoute(q.from, q.to);
          draw();
        } catch (e) { if (ctx.alive()) { list.innerHTML = ''; list.appendChild(C.error(e, () => load(true))); } }
      }
      async function page(dir) {
        try {
          const r = await runJourneys(q, dir === 'next' ? st.next : st.prev);
          if (!ctx.alive()) return;
          const seen = new Set(st.list.map((j) => j.id)), add = r.list.filter((j) => !seen.has(j.id));
          if (dir === 'next') { st.list = st.list.concat(add); st.next = r.next; } else { st.list = add.concat(st.list); st.prev = r.prev; }
          draw();
        } catch (e) { M.toast(e.message, { type: 'err' }); }
      }
      ctx.every(60000, () => load(true));
      load(false);
    }
  };

  /* =====================================================================
     Verbindung (Detail) – exakt nach Vorlage
     ===================================================================== */
  function delayHTML(d, realtime) {
    if (!realtime || d == null) return '';
    return '<div class="d ' + (d === 0 ? 'c-green' : 'c-red') + '">' + (d > 0 ? '+' : d === 0 ? '+' : '') + d + '</div>';
  }
  function stopRowHTML(ev, color, key, opts) {
    opts = opts || {};
    return '<div class="vb-stop" style="--c:' + color + '"><div class="vb-time">' + (ev.time ? M.fmtTime(ev.time) : '') + delayHTML(ev.delay, opts.realtime) + '</div>' +
      '<span class="vb-node"></span><div class="vb-name" data-stop="' + key + '">' + esc(ev.name) + '</div>' + C.bstg(ev.platform, opts.mode, ev.plannedPlatform) + '</div>';
  }
  function legHTML(l, i) {
    const c = M.routeColor(l.line);
    const n = l.stops.length;
    return '<div class="vb-leg" data-leg="' + i + '" style="--c:' + c + ';--dc:' + M.stopDotColor(c) + '"><div class="vb-rail"></div>' +
      stopRowHTML(l.from, c, i + ':f', { realtime: l.realtime, mode: l.line.mode }) +
      '<div class="vb-body"><div class="vb-line"><span class="bds" data-trip="' + i + '">' + C.badges(l.line, { rt: !!l.realtime }) + '</span><span class="dir">nach ' + esc(l.headsign || l.to.name) + '</span></div>' +
        (l.wheelchair ? '<div class="wbox" title="Barrierefrei">' + icon('wheel') + '</div>' : '') +
        l.alerts.map((a) => '<div class="vb-alert">' + icon('warnFill') + '<div>' + C.richText(a.title, l.line, l.from.name) + (a.text ? '<small>' + esc(a.text.slice(0, 220)) + '</small>' : '') + '</div></div>').join('') +
        (l.notes || []).map((n) => '<div class="vb-alert note">' + icon('infoFill') + '<div>' + C.richText(n.text, l.line, l.from.name) + '</div></div>').join('') +
        (n ? '<button class="vb-tog" data-tog="' + i + '">' + icon('down') + n + (n === 1 ? ' Haltestelle' : ' Haltestellen') + '</button>' +
          '<div class="vb-inter">' + l.stops.map((s) => '<div class="ist' + (s.cancelled ? ' cx' : '') + '">' + (s.cancelled ? '<span class="xm">' + icon('close') + '</span>' : '') + '<div class="n"><span>' + esc(s.name) + '</span></div><div class="t">' + M.fmtTime(s.arr || s.dep || s.arrPlanned || s.depPlanned) + '</div></div>').join('') + '</div>' : '') +
      '</div>' +
      stopRowHTML(l.to, c, i + ':t', { realtime: l.realtime, mode: l.line.mode }) +
      '<div class="vb-dur" style="top:50%">' + Math.max(1, Math.round(l.duration)) + '<br>Min.</div></div>';
  }
  function walkHTML(l, first) {
    const m = Math.max(1, Math.round(l.duration));
    return '<div class="vb-walk' + (first ? ' first' : '') + '"><span class="wl">' + m + ' Min.</span>' + m + ' Min. zu Fuß' + (l.distance ? ' • ' + M.fmtDist(l.distance) : '') + '</div>';
  }
  function placeRowHTML(ev, key) {
    return '<div class="vb-leg" style="--c:#7A7A7E">' + stopRowHTML(ev, '#7A7A7E', key) + '</div>';
  }

  V.journey = {
    height: 'full',
    render(ctx) {
      const st = ctx.state, q = ctx.params.query;
      st.j = st.j || ctx.params.j;
      ctx.head({ title: 'Verbindung', border: true });
      function draw() {
        const j = st.j, legs = j.legs;
        const refs = {};
        let h = '<div class="vb">';
        legs.forEach((l, i) => {
          if (l.walk) {
            if (i === 0) { h += placeRowHTML(l.from, i + ':f'); refs[i + ':f'] = l.from; }
            h += walkHTML(l, false);
            if (i === legs.length - 1) { h += placeRowHTML(l.to, i + ':t'); refs[i + ':t'] = l.to; }
            return;
          }
          if (i > 0 && !legs[i - 1].walk) {
            const gap = Math.max(0, M.delayMin(l.from.time, legs[i - 1].to.time));
            h += l.interline
              ? '<div class="vb-walk thru"><span class="wl">' + gap + ' Min.</span><span>Sitzen bleiben – weiter als <span class="ref">' + C.badges(l.line, { sm: true }) + '</span> nach ' + esc(M.localName(l.headsign && M.localName(l.headsign) !== M.localName(l.from.name) ? l.headsign : l.to.name)) + '</span></div>'
              : '<div class="vb-walk"><span class="wl">' + gap + ' Min.</span>Umstieg · ' + gap + ' Min.</div>';
          }
          h += legHTML(l, i);
          refs[i + ':f'] = l.from; refs[i + ':t'] = l.to;
        });
        h += '</div>';
        const est = M.Tariffs.estimate(j);
        const favOn = q && M.favs.hasRoute(q.from, q.to);
        h += '<div class="hr" style="margin-top:22px"></div>' +
          '<div class="kv"><div class="k">' + esc(est.title) + '<small>' + esc(est.note) + '</small></div><div class="v">' + (est.price != null ? M.money(est.price) : '–') + '</div></div>' +
          '<div data-pres></div>' +
          '<div class="btn-row">' +
            '<button class="btn-o" data-a="refresh">' + icon('refresh') + 'Aktualisieren</button>' +
            '<button class="btn-o' + (favOn ? ' acc' : '') + '" data-a="fav">' + icon(favOn ? 'starFill' : 'star') + (favOn ? 'Gemerkt' : 'Merken') + '</button>' +
            (j.arr > Date.now() && M.Watch ? '<button class="btn-o' + (M.Watch.isWatching(j) ? ' acc' : '') + '" data-a="watch">' + icon(M.Watch.isWatching(j) ? 'bellRing' : 'bell') + (M.Watch.isWatching(j) ? 'Wird überwacht' : 'Überwachen') + '</button>' : '') +
            '<button class="btn-o" data-a="share">' + icon('share') + 'Teilen</button>' +
            (est.kind === 'db' || est.kind === 'verbund' ? '<button class="btn-o" data-a="price">' + icon('euro') + 'DB-Preis</button>' : '') +
            '<button class="btn-o" data-a="ai">' + icon('headset') + 'Assistance</button>' +
          '</div>' +
          '<div class="src-note">' + icon('live') + (j.src === 'db' ? 'Deutsche Bahn' : 'Transitous · Echtzeit') + ' · Stand ' + M.fmtTime(st.updated || new Date()) + '</div>';
        ctx.body.innerHTML = h;
        // Linienfarbe exakt von Knoten zu Knoten
        ctx.body.querySelectorAll('.vb-leg').forEach((leg) => {
          const rail = leg.querySelector('.vb-rail'), stops = leg.querySelectorAll('.vb-stop');
          if (!rail || stops.length < 2) return;
          rail.style.top = '15px';
          rail.style.bottom = (stops[stops.length - 1].offsetHeight - 15) + 'px';
        });
        bindAll(ctx.body, '[data-tog]', (b) => {
          const box = b.nextElementSibling; const open = box.classList.toggle('open');
          b.innerHTML = icon(open ? 'up' : 'down') + b.textContent;
        });
        bindAll(ctx.body, '[data-trip]', (b) => { const l = j.legs[+b.dataset.trip]; if (l.tripId) UI.open('trip', { tripId: l.tripId, src: j.src, line: l.line, headsign: l.headsign, focusStop: l.from.name }); });
        bindAll(ctx.body, '[data-stop]', (b) => {
          const s = refs[b.dataset.stop];
          if (s && s.id) UI.open('stop', { stop: { id: s.id, name: s.name, lat: s.lat, lon: s.lon, type: 'stop', src: j.src } });
          else if (s) M.Map.flyTo(s.lat, s.lon, 17);
        });
        bindAll(ctx.body, '[data-a]', (b) => action(b.dataset.a, b));
      }
      async function action(a, b) {
        const j = st.j;
        if (a === 'refresh') refresh(true);
        else if (a === 'fav' && q) { const on = M.favs.toggleRoute(q.from, q.to); M.toast(on ? 'Route gemerkt' : 'Route entfernt'); draw(); }
        else if (a === 'watch') {
          if (M.Watch.isWatching(j)) { M.Watch.stop(); M.toast('Überwachung beendet'); } else await M.Watch.start(j, q);
          draw();
        }
        else if (a === 'share') {
          const a0 = j.legs[0].from, b0 = j.legs[j.legs.length - 1].to;
          const text = 'Muvit · ' + a0.name + ' → ' + b0.name + '\n' + M.fmtDayTime(a0.time) + ' – ' + M.fmtTime(b0.time) + ' (' + M.fmtDur(j.duration) + ')\n' +
            j.legs.filter((l) => !l.walk).map((l) => '• ' + M.fmtTime(l.from.time) + ' ' + M.modeInfo(l.line.mode).short + ' ' + l.line.full + ' → ' + l.headsign + ' ab ' + l.from.name + (l.from.platform ? ' (' + C.platform(l.from.platform, l.line.mode) + ')' : '')).join('\n');
          if (navigator.share) navigator.share({ title: 'Meine Verbindung', text }).catch(() => {});
          else if (navigator.clipboard) navigator.clipboard.writeText(text).then(() => M.toast('Verbindung kopiert'));
        } else if (a === 'ai') {
          const a0 = j.legs[0].from, b0 = j.legs[j.legs.length - 1].to;
          UI.open('assistant', { prompt: 'Erkläre mir diese Verbindung von ' + a0.name + ' nach ' + b0.name + ' um ' + M.fmtTime(a0.time) + ' Uhr und welches Ticket ich brauche.' });
        } else if (a === 'price') {
          b.disabled = true;
          const box = M.$('[data-pres]', ctx.body);
          try {
            const a0 = j.legs[0].from, b0 = j.legs[j.legs.length - 1].to;
            const r = await M.Transit.dbPrice({ name: a0.name, lat: a0.lat, lon: a0.lon, type: 'coord' }, { name: b0.name, lat: b0.lat, lon: b0.lon, type: 'coord' }, j.dep);
            if (!ctx.alive()) return;
            box.innerHTML = r ? '<div class="kv"><div class="k">Günstigster DB-Preis<small>Abfahrt ' + M.fmtTime(r.cheapest.dep) + ' · ' + M.fmtDur(r.cheapest.duration) + (r.cheapest.price.hint ? ' · ' + esc(r.cheapest.price.hint) : '') + '</small></div><div class="v">' + M.money(r.cheapest.price.amount, r.cheapest.price.currency) + '</div></div>'
              : '<div class="kv"><div class="k">Kein Online-Preis der DB<small>Für reine Verbundfahrten gilt der marego-Tarif.</small></div></div>';
          } catch (e) { box.innerHTML = '<div class="kv"><div class="k">DB-Preisauskunft nicht erreichbar<small>' + esc(e.message) + '</small></div></div>'; }
          b.disabled = false;
        }
      }
      async function refresh(manual) {
        if (!q) return;
        try {
          const j = st.j;
          const r = await runJourneys(Object.assign({}, q, { time: new Date((j.depPlanned || j.dep).getTime() - 60000), arriveBy: false }));
          if (!ctx.alive()) return;
          const key = (x) => x.legs.filter((l) => !l.walk).map((l) => l.tripId || l.line.name).join('|');
          const m = r.list.find((x) => x.id === j.id) || r.list.find((x) => key(x) === key(j));
          if (m) { st.j = m; st.updated = new Date(); draw(); M.Map.drawJourney(m, { fit: false }); if (manual) M.toast('Echtzeitdaten aktualisiert'); }
          else if (manual) M.toast('Verbindung nicht mehr im Fahrplan', { type: 'err' });
        } catch (e) { if (manual) M.toast(e.message, { type: 'err' }); }
      }
      draw();
      M.Map.drawJourney(st.j);
      ctx.every(45000, () => refresh(false));
    }
  };

  /* =====================================================================
     Fahrtverlauf (Linienverlauf mit Live-Position)
     ===================================================================== */
  function stopTimes(s) {
    const a = s.arr || s.arrPlanned || s.dep || s.depPlanned, d = s.dep || s.depPlanned || s.arr || s.arrPlanned;
    return { a: a ? +a : null, d: d ? +d : null };
  }
  function tripProgress(trip, now) {
    const T = trip.stops.map(stopTimes), n = T.length;
    if (!n || T[0].d == null) return { state: 'unknown', idx: 0, f: 0 };
    if (now < T[0].d) return { state: 'before', idx: 0, f: 0 };
    for (let i = 0; i < n; i++) {
      if (T[i].a != null && T[i].d != null && now >= T[i].a && now <= T[i].d) return { state: 'at', idx: i, f: 0 };
      if (i < n - 1 && T[i].d != null && T[i + 1].a != null && now > T[i].d && now < T[i + 1].a) return { state: 'between', idx: i, f: (now - T[i].d) / Math.max(1, T[i + 1].a - T[i].d) };
    }
    return { state: 'after', idx: n - 1, f: 0 };
  }
  /** Wo ist das Fahrzeug? „at“ = steht an Halt idx, „between“ = zwischen idx und idx+1 (Anteil f) */
  const DWELL = 20000;
  function railProgress(t, now) {
    const T = t.stops.map(stopTimes), n = T.length;
    if (!n || T[0].d == null) return { state: 'unknown', idx: 0, f: 0 };
    if (now < T[0].d - DWELL) return { state: 'before', idx: 0, f: 0 };
    for (let i = 0; i < n; i++) {
      const a = T[i].a != null ? T[i].a : T[i].d, d = T[i].d != null ? T[i].d : T[i].a;
      if (a != null && d != null && now >= a - DWELL && now <= d + DWELL) return { state: 'at', idx: i, f: 0 };
      if (i < n - 1) {
        const na = T[i + 1].a != null ? T[i + 1].a : T[i + 1].d;
        if (d != null && na != null && now > d + DWELL && now < na - DWELL) return { state: 'between', idx: i, f: smooth((now - d - DWELL) / Math.max(1, na - d - 2 * DWELL)) };
      }
    }
    return { state: 'after', idx: n - 1, f: 0 };
  }
  /** Anfahren und Bremsen statt gleichmäßigem Gleiten */
  function smooth(f) { f = Math.min(1, Math.max(0, f)); return f * f * (3 - 2 * f); }
  /** Erster noch nicht passierter Halt */
  function firstOpen(rp, n) {
    if (rp.state === 'at') return rp.idx;
    if (rp.state === 'between') return rp.idx + 1;
    if (rp.state === 'after') return n;
    return 0;
  }
  /** Verlaufslinie zeichnen: gefahrener Teil grau und dünn, Rest in Linienfarbe mit weißem Rand.
      Steht die Bahn an einem Halt, sitzt dort der große Kreis; fährt sie, beginnt die farbige Linie
      mit runder Spitze genau an ihrer aktuellen Position (Echtzeit). Die Endstelle hat immer den Kreis. */
  function layoutRail(listEl, rp) {
    const rows = listEl.querySelectorAll(':scope > .trow');
    const ys = Array.from(rows, (r) => r.offsetTop + Math.min(r.offsetHeight / 2, 31));
    const n = ys.length;
    if (!n) return;
    let layer = listEl.querySelector(':scope > .rl');
    if (!layer) { layer = document.createElement('div'); layer.className = 'rl'; listEl.prepend(layer); }
    let head;
    if (rp.state === 'between') head = ys[rp.idx] + (ys[rp.idx + 1] - ys[rp.idx]) * Math.min(1, Math.max(0, rp.f));
    else if (rp.state === 'at') head = ys[rp.idx];
    else if (rp.state === 'after') head = ys[n - 1];
    else head = ys[0];
    const at = rp.state === 'at' ? rp.idx : (rp.state === 'before' || rp.state === 'unknown') ? 0 : -1;
    const cap = rp.state === 'between';
    let h = '<div class="rl-gray" style="top:' + ys[0] + 'px;height:' + Math.max(0, head - ys[0]) + 'px"></div>';
    if (rp.state !== 'after' && ys[n - 1] > head) {
      h += '<div class="rl-out' + (cap ? ' cap' : '') + '" style="top:' + (head - (cap ? 2 : 0)) + 'px;height:' + (ys[n - 1] - head + (cap ? 2 : 0)) + 'px"></div>' +
        '<div class="rl-in' + (cap ? ' cap' : '') + '" style="top:' + head + 'px;height:' + (ys[n - 1] - head) + 'px"></div>';
    }
    ys.forEach((y, i) => {
      if (rows[i].classList.contains('cx')) h += '<span class="rl-x" style="top:' + y + 'px">' + M.icon('close') + '</span>';   // Halt entfällt
      else if (i === n - 1 || i === at) h += '<span class="rl-node" style="top:' + y + 'px"></span>';
      else h += '<span class="rl-dot' + (y < head - 0.5 ? ' past' : '') + '" style="top:' + y + 'px"></span>';
    });
    layer.innerHTML = h;
  }

  function stopCoordIdx(trip) {
    const out = []; let from = 0; const c = trip.coords;
    trip.stops.forEach((s) => {
      let best = from, bd = Infinity;
      for (let i = from; i < c.length; i++) { const d = M.dist(s.lat, s.lon, c[i][1], c[i][0]); if (d < bd) { bd = d; best = i; } if (bd < 15 && d > bd + 400) break; }
      out.push(best); from = best;
    });
    return out;
  }
  function tripPos(trip, idxs, prog) {
    const s = trip.stops;
    if (prog.state !== 'between') return { lat: s[prog.idx].lat, lon: s[prog.idx].lon };
    const a = idxs[prog.idx], b = idxs[prog.idx + 1], c = trip.coords;
    if (!c.length || b <= a) { const p = s[prog.idx], q = s[prog.idx + 1]; return { lat: p.lat + (q.lat - p.lat) * prog.f, lon: p.lon + (q.lon - p.lon) * prog.f }; }
    let total = 0; const seg = [];
    for (let i = a; i < b; i++) { const d = M.dist(c[i][1], c[i][0], c[i + 1][1], c[i + 1][0]); seg.push(d); total += d; }
    let target = total * prog.f;
    for (let i = 0; i < seg.length; i++) {
      if (target <= seg[i] || i === seg.length - 1) { const r = seg[i] ? Math.min(1, target / seg[i]) : 0, p = c[a + i], q = c[a + i + 1]; return { lon: p[0] + (q[0] - p[0]) * r, lat: p[1] + (q[1] - p[1]) * r }; }
      target -= seg[i];
    }
    return { lat: s[prog.idx + 1].lat, lon: s[prog.idx + 1].lon };
  }

  M.tripProgress = tripProgress;

  V.trip = {
    height: 0.95,
    render(ctx) {
      const p = ctx.params, st = ctx.state;
      let idxs = null;
      ctx.head({ title: 'Fahrtverlauf' });
      const headHTML = (line, to, rt) => '<div class="trip-head">' + C.badges(line, rt === undefined ? {} : { rt }) + icon('arrow', 'to-ar') + '<span class="to">' + esc(to) + '</span></div>';
      if (p.line) ctx.extra(headHTML(p.line, '…'));
      ctx.body.innerHTML = C.skel(7);

      /** Fahrt am angezeigten Ziel teilen (z. B. Linie 2 bis City Carré, Linie 1 bis City Carré); der Rest ist die
          Weiterfahrt als andere Linie. Maßgeblich ist das Ziel an der Haltestelle, nicht die letzte Haltestelle der Fahrt. */
      function cutTrip(t, hs) {
        // 1, 2, 5, 13: Die Bahn wechselt am City Carré die Linie (1 ↔ 5, 2 ↔ 13) – auch wenn die Daten sie
        // als eine Fahrt mit einer Nummer führen. Dort teilen, der Rest fährt als Partnerlinie.
        const partner = M.partnerLine(t.line);
        let h = partner ? t.stops.findIndex((s, i) => i > 0 && i < t.stops.length - 1 && M.isChangeStop(s.name)) : -1;
        const byRule = h > 0;
        // sonst: Fahrt endet laut Anzeige an der Haltestelle früher (z. B. „Hauptbahnhof“), danach nichts zeigen
        if (!byRule) h = M.headIdx(t, hs);
        if (h < 0) return { main: t, rest: null };
        const ci = stopCoordIdx(t);
        const at = t.stops[h].name;
        const main = Object.assign({}, t, { headsign: at, stops: t.stops.slice(0, h + 1), coords: t.coords.slice(0, (ci[h] || 0) + 1), next: null, continues: null });
        const rest = Object.assign({}, t, { line: partner, rule: true, stops: t.stops.slice(h), coords: t.coords.slice(ci[h] || 0), headsign: t.stops[t.stops.length - 1].name, next: null, continues: null });
        // nach City Carré nur noch Leerfahrt (z. B. ins Depot): keine Weiterfahrt
        return { main, rest: byRule && M.servesAfter(t, h) ? rest : null };
      }
      /** Hinweise an einem Halt: Meldungen zur Haltestelle */
      function stopInfo(s, line) {
        let h = '';
        (s.alerts || []).slice(0, 2).forEach((a) => { h += '<div class="ti warn">' + icon('warnFill') + '<span>' + C.richText(a.title, line, s.name) + '</span></div>'; });
        // antippen: Störungen der Haltestelle im aufgeklappten Extra-Frame
        return h ? '<div class="tinfo" data-tinfo>' + h + '</div>' : '';
      }
      /** Halte einer Fahrt als Zeitstrahl in Linienfarbe */
      /** Wo ist die Bahn? Aus den Echtzeitdaten des Fahrzeugs (Fahrplan + aktuelle Verspätung) */
      function progOf(pt, k, now) { return railProgress(pt, now); }
      function partHTML(t, pi, now) {
        const rp = progOf(t, pi, now);
        const next = firstOpen(rp, t.stops.length);
        const c = M.routeColor(t.line);
        const n = t.stops.length;
        // Barrierefreiheit je Halt: Angabe der Haltestelle, sonst Fahrzeug (Niederflur)
        const wcIcon = (s) => {
          const v = s.wheelchair != null ? s.wheelchair : (t.wheelchair ? true : null);
          return v == null ? '' : '<span class="wc-ic' + (v ? '' : ' no') + '" title="' + (v ? 'Barrierefreier Ein- und Ausstieg' : 'Nicht barrierefrei') + '">' + icon('wheel') + '</span>';
        };
        let h = '<div class="trip-list" style="--c:' + c + ';--dc:' + M.stopDotColor(c) + '">';
        t.stops.forEach((s, i) => {
          const past = i < next, isNext = i === next;
          const tm = i === n - 1 ? (s.arr || s.dep) : (s.dep || s.arr);
          const pl = i === n - 1 ? (s.arrPlanned || s.depPlanned) : (s.depPlanned || s.arrPlanned);
          const d = t.realtime ? M.delayMin(tm, pl) : null;
          // Aufenthalt: Ankunft und Abfahrt getrennt zeigen (z. B. an 18:45, ab 18:48)
          const ar = s.arr || s.arrPlanned, de = s.dep || s.depPlanned;
          const dwell = i > 0 && i < n - 1 && ar && de && de - ar >= 60000;
          let ss, a, b;
          const dcls = C.delayCls({ realtime: t.realtime, delay: d, cancelled: s.cancelled });
          if (past) {
            ss = '<span>' + (s.cancelled ? 'Halt entfiel' : 'Abgefahren') + '</span>';
            const m = Math.max(0, -M.minsUntil(tm));
            a = m < 100 ? 'Vor ' + m + ' Min' : M.fmtTime(tm); b = 'Um ' + M.fmtTime(tm);
          } else {
            const x = C.status({ realtime: t.realtime, delay: d, cancelled: s.cancelled });
            const txt = s.cancelled ? 'Halt entfällt' : !t.realtime || d == null ? 'Planmäßig' : d === 0 ? 'Pünktlich' : d < 0 ? 'Früher (' + d + ' Min.)' : 'Verspätet (+' + d + ' Min.)';
            ss = '<span class="' + x.cls + '">' + txt + '</span>';
            a = '<span class="' + dcls + '">' + C.countdown(tm) + '</span>';
            // Plan und daneben die voraussichtliche Zeit (auf dem Handy nur die voraussichtliche)
            b = dwell ? 'an ' + M.fmtTime(ar) + '<br>ab ' + M.fmtTime(de) : C.clock(pl || tm, t.realtime ? tm : null, dcls);
          }
          h += '<button class="trow' + (past ? ' past' : '') + (isNext ? ' next' : '') + (s.cancelled ? ' cx' : '') + '" data-p="' + pi + '" data-i="' + i + '">' +
            '<div style="min-width:0"><div class="nm"><span>' + esc(s.name) + '</span>' + wcIcon(s) + (!past && !s.cancelled ? C.bstg(s.platform, t.line.mode, s.plannedPlatform) : '') + '</div><div class="ss">' + ss + '</div></div>' +
            '<div class="r"><div class="a">' + a + '</div><div class="b">' + b + '</div></div>' + (past ? '' : stopInfo(s, t.line)) + '</button>';
        });
        return { html: h + '</div>', next, key: rp.state + rp.idx };
      }
      /** „Weiter als [Tram][13] nach Sudenburg“ – Ziel ist immer der letzte Halt der Weiterfahrt, nie der Wechselhalt */
      function gapHTML(info, n) {
        const dest = esc(M.localName(n.stops[n.stops.length - 1].name));
        const line = (info && info.line) || (n.rule ? n.line : null);
        const txt = line ? 'Weiter als <span class="ref">' + C.badges(line, { sm: true }) + '</span> nach ' + dest : 'Weiter nach ' + dest;
        return '<div class="trip-gap"><div class="alert-line note">' + icon('infoFill', 'n') + '<span class="tx">' + txt + '</span><span></span></div></div>';
      }
      function draw() {
        const t = st.trip, now = Date.now();
        ctx.extra(headHTML(t.line, t.headsign, !!t.realtime));
        const main = partHTML(t, 0, now);
        const at = t.stops[Math.min(main.next, t.stops.length - 1)];
        // Linienwechsel steht als eigener Abschnitt darunter – Texthinweise dazu nicht doppelt zeigen
        const THRU = /(weiter\s+als|kommt\s+als|kommend\s+als|Linienwechsel)/i;
        const notes = st.next ? (t.notes || []).filter((x) => !THRU.test(x.text)) : t.notes;
        const info = C.infoLines({ alerts: t.alerts, notes, line: t.line, stop: at, headsign: t.headsign }, 0, { max: 3 });
        let h = (info ? '<div class="trip-info">' + info + '</div>' : '') + main.html;
        const parts = [t];
        if (st.next && st.next.stops && st.next.stops.length) {
          // Linienwechsel: Lücke, Hinweis und die nächste Fahrt in der Farbe der neuen Linie
          parts.push(st.next);
          h += gapHTML(st.nextInfo, st.next) + partHTML(st.next, 1, now).html;
        }
        h += '<div class="trip-foot">' + icon('live') + (t.realtime ? 'Echtzeitdaten' : 'Fahrplandaten') + ' · aktualisiert ' + M.fmtTime(st.updated || new Date()) + '</div>';
        const keep = ctx.body.scrollTop;
        ctx.body.innerHTML = h;
        ctx.body.scrollTop = keep;
        st.parts = parts;
        st.keys = parts.map((pt, k) => { const rp = progOf(pt, k, now); return rp.state + rp.idx; });
        layoutRails(now);
        bindAll(ctx.body, '.trow', (el, e) => {
          const pt = parts[+el.dataset.p] || t, s = pt.stops[+el.dataset.i];
          if (e.target.closest('[data-tinfo]')) { M.showAlerts('Störungen · ' + M.localName(s.name), (s.alerts || []).map((a) => ({ a, lines: [pt.line] })), s.name); return; }
          UI.open('stop', { stop: { id: s.id, name: s.name, lat: s.lat, lon: s.lon, type: 'stop', src: pt.src || t.src } });
        });
        if (!st.scrolled) {
          st.scrolled = true;
          const target = ctx.body.querySelector('.trow[data-p="0"][data-i="' + (main.next - 2) + '"]');
          if (target && main.next > 3) setTimeout(() => { if (ctx.alive()) ctx.body.scrollTop = target.offsetTop; }, 60);
        }
        placeVehicle();
      }
      /** Weiterfahrt als andere Linie ermitteln und als zweiten Abschnitt anhängen */
      /** Weiterfahrt als andere Linie ermitteln: dieselbe Fahrt über das Ziel hinaus (eigene Halte, neue Linie)
          oder die Folgefahrt im Umlauf bzw. die am Wechselhalt beginnende Fahrt */
      async function loadNext() {
        const raw = st.raw;
        const key = raw && raw.tripId + '|' + (st.hs || '');
        if (!raw || st.nextTried === key) return;
        st.nextTried = key;
        // schon geteilt (Bahn fährt über City Carré hinaus) oder keine Wechsel-Linie: nichts nachzuladen
        if (st.rest || !M.partnerLine(raw.line) || !M.isChangeStop(raw.stops[raw.stops.length - 1].name)) return;
        // Fahrt endet am City Carré: Folgefahrt im Umlauf (Daten) bzw. die dort beginnende Fahrt der Partnerlinie
        if (raw.next && raw.next.stops && raw.next.stops.length && raw.continues) { st.next = raw.next; st.nextInfo = raw.continues; st.nextFor = key; draw(); return; }
        const c = await M.Transit.continuation({ tripId: raw.tripId, src: raw.src, line: raw.line, headsign: st.hs || raw.headsign });
        if (!ctx.alive() || !st.raw || st.raw.tripId !== raw.tripId) return;
        st.cont = { key, c };
        if (c && c.tripId) {
          const t2 = await M.Transit.trip(c.tripId, c.src || 'motis').catch(() => null);
          if (!t2 || !ctx.alive()) return;
          // nur ab dem Umstiegshalt (falls die Fahrt der neuen Linie früher beginnt)
          const k = t2.stops.findIndex((x) => M.isChangeStop(x.name));
          if (k < 0 || k >= t2.stops.length - 1 || !st.raw || st.raw.tripId !== raw.tripId || st.rest) return;
          st.next = Object.assign({}, t2, { stops: t2.stops.slice(k) });
          st.nextInfo = c; st.nextFor = key;
          draw();
        }
      }
      function layoutRails(now) {
        ctx.body.querySelectorAll('.trip-list').forEach((el, k) => { const pt = (st.parts || [])[k]; if (pt) layoutRail(el, progOf(pt, k, now)); });
      }
      /** jede Sekunde: Position in Echtzeit nachführen; erreicht/verlässt die Bahn einen Halt, alles neu zeichnen */
      function tickRail() {
        if (!st.trip || !st.parts) return;
        const now = Date.now();
        const keys = st.parts.map((pt, k) => { const rp = progOf(pt, k, now); return rp.state + rp.idx; });
        if (keys.join() !== (st.keys || []).join()) draw(); else layoutRails(now);
      }
      function placeVehicle() {
        const t = st.raw || st.trip; if (!t) return;
        // Fahrplan/Echtzeit mit Haltezeit an jeder Haltestelle (die Bahn hält, statt durchzufahren)
        const prog = railProgress(t, Date.now());
        idxs = idxs || stopCoordIdx(t);
        const pos = prog.state === 'between' || prog.state === 'at' ? tripPos(t, idxs, prog) : null;
        M.Map.setTripVehicle(pos, (st.next && prog.state !== 'before' && st.trip && prog.idx >= st.trip.stops.length - 1) ? st.next.line : t.line);
      }
      /** Fahrt teilen und anzeigen (auch erneut, wenn das Ziel an der Haltestelle erst nachträglich bekannt wird) */
      function apply(raw, fit) {
        const cut = cutTrip(raw, st.hs);
        st.raw = raw; st.trip = cut.main; st.rest = cut.rest; st.updated = new Date(); idxs = null;
        const key = raw.tripId + '|' + (st.hs || '');
        // Weiterfahrt passt nicht mehr (anderes Ziel bekannt geworden) oder wird gleich neu aufgebaut
        if (st.next && (st.next === st.restShown || (st.nextFor && st.nextFor !== key) || cut.rest)) { st.next = null; st.nextInfo = null; st.nextFor = null; }
        // dieselbe Bahn fährt ab City Carré als Partnerlinie weiter (1 ↔ 5, 2 ↔ 13)
        if (cut.rest && !st.next) {
          st.next = st.restShown = cut.rest;
          st.nextInfo = { line: cut.rest.line, at: cut.main.headsign, headsign: cut.rest.headsign };
        }
        M.Map.drawTrip(cut.main, { fit });
        draw();
        loadNext();
      }
      async function load(manual) {
        try {
          const raw = await M.Transit.trip(p.tripId, p.src);
          if (!ctx.alive()) return;
          const first = !st.trip;
          if (st.hs === undefined) st.hs = p.headsign || null;
          apply(raw, first || manual);
          // ohne angezeigtes Ziel (z. B. Fahrzeug auf der Karte): Ziel am nächsten Halt nachschlagen
          if (!st.hs && !st.rest && !st.hsTried) {
            st.hsTried = true;
            M.Transit.boardHeadsign(raw).then((hs) => {
              if (!hs || !ctx.alive() || !st.raw || st.raw.tripId !== raw.tripId || M.headIdx(st.raw, hs) < 0) return;
              st.hs = hs;
              apply(st.raw, false);
            });
          }
          if (manual) M.toast('Fahrtverlauf aktualisiert');
        } catch (e) {
          if (!ctx.alive()) return;
          if (!st.trip) { ctx.body.innerHTML = ''; ctx.body.appendChild(C.error(e, () => load(true))); } else if (manual) M.toast(e.message, { type: 'err' });
        }
      }
      if (st.trip && ctx.restoring) { M.Map.drawTrip(st.trip); draw(); } else load(false);
      ctx.every(1000, () => { placeVehicle(); tickRail(); });
      ctx.every(20000, () => { if (st.trip) draw(); });
      ctx.every(30000, () => load(false));
      ctx.cleanup(() => M.Map.setTripVehicle(null));
    }
  };

  /* =====================================================================
     Haltestelle – Abfahrten in Echtzeit
     ===================================================================== */
  V.stop = {
    height: 0.95,
    render(ctx) {
      const st = ctx.state;
      const stop = ctx.params.stop;
      recentStops.add(stop);
      const head = () => ctx.head({
        title: 'Haltestelle',
        actions: [{ icon: M.favs.hasStop(stop) ? 'starFill' : 'star', label: 'Favorit', on: M.favs.hasStop(stop), onClick: () => { const on = M.favs.toggleStop(stop); M.toast(on ? 'Haltestelle gemerkt' : 'Favorit entfernt'); head(); } }]
      });
      head();
      st.off = st.off || [];
      const area = M.localArea(stop.area || '');
      ctx.body.innerHTML =
        '<div class="st-title">' + icon('hOutline', 'h') + '<h2>' + esc(M.localName(stop.name)) + '</h2><span data-wc></span></div>' +
        '<div class="st-area" data-starea>' + esc(area) + '</div>' +
        '<div class="st-btns"><button class="btn-o" data-alerts>' + icon('infoFill', 'yel') + '<span data-alertn>Störungen</span></button></div>' +
        '<div data-nosvc></div>' +
        '<h3 class="h2">Abfahrten</h3><div class="chips logos" data-chips></div><div class="hr"></div>' +
        '<div class="day"><span data-day0>Heute</span><button class="upd" data-reload><span data-upd>Aktualisiert: –</span>' + icon('refresh') + '</button></div>' +
        '<div data-list>' + C.skel(6) + '</div><div data-more></div>';
      M.Map.addStops([{ id: stop.id, name: stop.name, lat: stop.lat, lon: stop.lon, src: stop.src }]);
      M.Map.flyTo(stop.lat, stop.lon, 16.2);
      const listBox = M.$('[data-list]', ctx.body), chips = M.$('[data-chips]', ctx.body);
      if (!area) M.Transit.district(stop).then((d) => { const el = ctx.alive() && M.$('[data-starea]', ctx.body); if (el && d) el.textContent = d; });
      // Durchläufer („kommt als“ / „fährt weiter als“) für die nächsten Trams und Busse ermitteln
      let drawPending = false;
      const redraw = (v) => { if (!v || drawPending) return; drawPending = true; requestAnimationFrame(() => { drawPending = false; if (ctx.alive()) draw(); }); };
      function through(list) {
        let n = 0;
        list.forEach((x) => {
          const c = M.Transit.known(M.Transit.contKey(x)), k = M.Transit.known('k|' + x.tripId);
          if (c) x.cont = c;
          if (k) x.comes = k;
          if (n >= 6 || x.cancelled || !(x.line.mode === 'tram' || x.line.mode === 'bus')) return;
          n++;
          if (c === undefined) M.Transit.continuation(x).then(redraw);
          if (k === undefined) M.Transit.comesAs(x).then(redraw);
        });
      }
      const NO_SVC_TXT = { tram: 'Straßenbahnverkehr', bus: 'Busverkehr', sbahn: 'S-Bahn-Verkehr', ubahn: 'U-Bahn-Verkehr', regio: 'Regionalverkehr', fern: 'Fernverkehr', ferry: 'Fährverkehr' };
      const NO_SERVICE = 6 * 3600000, HORIZON = 36 * 3600000;
      /** Grund für fehlenden Verkehr: Meldungen der Haltestelle bzw. der Linien (Baustellen zuerst) */
      function reasonFor(mode) {
        const list = (st.alerts || []).concat(...(st.list || []).filter((x) => x.line.mode === mode).map((x) => x.alerts || []));
        const a = list.find((x) => M.WORK_RE.test(x.title + ' ' + (x.text || ''))) || list[0];
        return a ? a.title + (a.text && a.text !== a.title ? ' – ' + a.text : '') : '';
      }
      function allAlerts() {
        const seen = new Map();
        (st.alerts || []).forEach((a) => { if (!seen.has(a.title)) seen.set(a.title, { a, lines: [] }); });
        (st.list || []).forEach((x) => (x.alerts || []).forEach((a) => {
          if (!seen.has(a.title)) seen.set(a.title, { a, lines: [] });
          const e = seen.get(a.title);
          if (!e.lines.some((l) => l.name === x.line.name && l.mode === x.line.mode)) e.lines.push(x.line);
        }));
        return Array.from(seen.values());
      }

      function draw() {
        const now = Date.now();
        const all0 = (st.list || []).filter((x) => M.minsUntil(x.time) > -2);
        const MODE_ORDER = ['bus', 'tram', 'sbahn', 'regio', 'fern', 'ubahn', 'ferry'];
        const modes0 = all0.map((x) => x.line.mode).filter((m, i, a) => a.indexOf(m) === i)
          .sort((a, b) => (MODE_ORDER.indexOf(a) + 1 || 99) - (MODE_ORDER.indexOf(b) + 1 || 99));
        // Verkehrsmittel, die hier stundenlang nicht fahren (z. B. Baustelle): Hinweis mit Grund statt Abfahrten in Tagen
        const paused = modes0.filter((m) => { const f = all0.find((x) => x.line.mode === m && !x.cancelled); return !f || f.time - now > NO_SERVICE; });
        M.$('[data-nosvc]', ctx.body).innerHTML = paused.map((m) => {
          const f = all0.find((x) => x.line.mode === m && !x.cancelled), why = reasonFor(m);
          return '<div class="nosvc">' + C.modeLogo(m) + '<div><b>Derzeit kein ' + esc(NO_SVC_TXT[m] || 'Verkehr') + '</b>' +
            '<span>' + (why ? 'Grund: ' + C.richText(why, null, stop.name) : 'Die MVB nennt derzeit keinen Grund.') + '</span>' +
            (f ? '<span class="c-gray">Nächste Fahrt laut Fahrplan: ' + esc(M.dayLabel(f.time)) + ', ' + M.fmtTime(f.time) + ' Uhr</span>' : '') + '</div></div>';
        }).join('');
        const all = all0.filter((x) => !paused.includes(x.line.mode) && x.time - now < HORIZON);
        const modes = modes0.filter((m) => !paused.includes(m));
        // Filter: nur die Logos (Bus, Tram, S-Bahn, Regional-, Fernverkehr – ohne DB-Logo)
        chips.innerHTML = modes.length > 1 ? modes.map((m) => '<button class="chip ic' + (st.off.includes(m) ? ' off' : '') + '" data-m="' + m + '" aria-label="' + esc(C.modeTitle(m)) + '" title="' + esc(C.modeTitle(m)) + '">' + C.modeLogo(m) + '</button>').join('') : '';
        bindAll(chips, '[data-m]', (b) => { const m = b.dataset.m; st.off = st.off.includes(m) ? st.off.filter((x) => x !== m) : st.off.concat(m); draw(); });
        const shown = all.filter((x) => !st.off.includes(x.line.mode));
        through(shown);
        // heute und morgen getrennt
        let h = '', day = null;
        shown.forEach((x, i) => {
          const k = M.dayKey(x.time);
          if (day !== null && k !== day) h += '<div class="day sub"><span>' + esc(M.dayLabel(x.time)) + '</span></div>';
          day = k;
          h += C.depRow(x, i);
        });
        M.$('[data-day0]', ctx.body).textContent = shown.length ? M.dayLabel(shown[0].time) : 'Heute';
        const n = allAlerts().length;
        M.$('[data-alertn]', ctx.body).textContent = n ? 'Störungen (' + n + ')' : 'Störungen';
        listBox.innerHTML = h || (paused.length ? '' : C.empty('Keine Abfahrten', 'In nächster Zeit fährt hier nichts ab.'));
        bindAll(listBox, '.dep', (b) => { const x = shown[+b.dataset.i]; UI.open('trip', { tripId: x.tripId, src: x.src, line: x.line, headsign: x.headsign, focusStop: stop.name }); });
        bindAll(listBox, '.alert-line[data-alert]', (b) => {
          const [i, k] = b.dataset.alert.split(':').map(Number);
          const a = shown[i].alerts[k];
          if (!a || !a.text) return;
          const n = b.nextElementSibling;
          if (n && n.classList.contains('alert-det')) { n.remove(); return; }
          b.insertAdjacentHTML('afterend', '<div class="alert-det">' + esc(a.text || a.title) + '</div>');
        });
        M.$('[data-upd]', ctx.body).textContent = 'Aktualisiert: ' + M.fmtTime(st.updated || new Date());
        M.$('[data-wc]', ctx.body).innerHTML = all.some((x) => x.wheelchair) ? icon('wheel', 'wc') : '';
        M.$('[data-more]', ctx.body).innerHTML = all.length ? '<button class="more" data-later>Spätere Abfahrten</button>' : '';
        bindAll(ctx.body, '[data-later]', loadMore);
      }
      async function load() {
        try {
          const r = await M.Transit.departures(stop, { n: 50 });
          if (!ctx.alive()) return;
          st.list = r.list; st.alerts = r.alerts; st.updated = new Date();
          draw();
        } catch (e) { if (ctx.alive() && !st.list) { listBox.innerHTML = ''; listBox.appendChild(C.error(e, load)); } }
      }
      async function loadMore() {
        const last = st.list[st.list.length - 1]; if (!last) return;
        try {
          const r = await M.Transit.departures(stop, { n: 40, time: new Date(last.time.getTime() + 60000) });
          if (!ctx.alive()) return;
          const seen = new Set(st.list.map((x) => x.tripId + x.planned));
          st.list = st.list.concat(r.list.filter((x) => !seen.has(x.tripId + x.planned)));
          draw();
        } catch (e) { M.toast(e.message, { type: 'err' }); }
      }
      bindAll(ctx.body, '[data-reload]', () => { load(); M.toast('Abfahrten aktualisiert'); });
      // Störungen der Haltestelle: eigener, aufgeklappter Frame (nicht Vollbild)
      bindAll(ctx.body, '[data-alerts]', () => M.showAlerts('Störungen · ' + M.localName(stop.name), allAlerts(), stop.name));
      if (st.list && ctx.restoring) draw(); else load();
      ctx.every(30000, load);
      ctx.every(15000, () => { if (st.list) draw(); });
    }
  };

  /** Störungen im Extra-Frame: Titel, betroffene Linien, Details zum Aufklappen */
  M.showAlerts = function (title, items, stopName) {
    const html = items.length ? items.map((e, i) => '<div class="pa-item"><button class="pa-h" data-pa="' + i + '">' + icon('warnFill', 'w') +
      '<span class="tx"><b>' + C.richText(e.a.title, null, stopName) + '</b>' + (e.lines && e.lines.length ? '<span class="pa-lines">' + C.lineGroups(e.lines, { sep: ' ' }) + '</span>' : '') + '</span>' +
      (e.a.text ? '<span class="chev">' + icon('down') + '</span>' : '<span></span>') + '</button>' +
      (e.a.text ? '<div class="pa-d" hidden>' + esc(e.a.text) + '</div>' : '') + '</div>').join('')
      : '<div class="hint" style="padding:14px var(--pad)">' + icon('infoFill') + '<span>Aktuell sind hier keine Störungen gemeldet.</span></div>';
    const body = UI.panel({ title, html, icon: icon('warnFill', 'pw') });
    body.querySelectorAll('[data-pa]').forEach((b) => b.addEventListener('click', () => {
      const d = b.nextElementSibling;
      if (!d || !d.classList.contains('pa-d')) return;
      d.hidden = !d.hidden;
      const ch = b.querySelector('.chev'); if (ch) ch.innerHTML = icon(d.hidden ? 'down' : 'up');
    }));
  };

  /* =====================================================================
     Abfahrten / Departure – Suche, Verlauf, Favoriten, In der Nähe
     ===================================================================== */
  const LINE_RE = /^(?:(?:tram|bus|linie|str|s-?bahn)\s*)?([a-z]{0,3}\s?\d{1,4}[a-z]?)$/i;
  V.departures = {
    height: 'full',
    render(ctx) {
      const st = ctx.state;
      st.tab = st.tab || ctx.params.tab || 'hist';
      ctx.head({ title: 'Abfahrten / Departure' });
      ctx.body.innerHTML =
        '<div class="search">' + icon('search', 'si') + '<input data-q placeholder="Haltestelle oder Linie suchen..." autocomplete="off" enterkeyhint="search" value="' + esc(st.q || '') + '"><button class="clr" data-clr hidden>' + icon('close') + '</button></div>' +
        '<div class="tabs"><button class="tab" data-tab="hist">' + icon('history') + 'Verlauf</button><button class="tab" data-tab="fav">' + icon('star') + 'Favoriten</button><button class="tab" data-tab="near">' + icon('pin') + 'In der Nähe</button></div>' +
        '<div data-list></div><div class="note-dim" data-note></div>';
      const input = M.$('[data-q]', ctx.body), clr = M.$('[data-clr]', ctx.body), box = M.$('[data-list]', ctx.body), note = M.$('[data-note]', ctx.body);
      let token = 0;

      function renderStops(list, opts) {
        opts = opts || {};
        box.innerHTML = list.length ? list.map((s, i) => C.stopRow(s, i, { end: opts.dist && s.distance != null ? M.fmtDist(s.distance) : '' })).join('') : C.empty(opts.emptyTitle || 'Keine Haltestellen', opts.emptyText || '');
        box.querySelectorAll('.stop-row').forEach((el) => el.addEventListener('click', (e) => {
          const sb = e.target.closest('[data-star]');
          const s = list[+el.dataset.i];
          if (sb) { e.stopPropagation(); const on = M.favs.toggleStop(s); sb.classList.toggle('on', on); sb.innerHTML = icon(on ? 'starFill' : 'star'); if (st.tab === 'fav' && !input.value.trim()) tab('fav'); return; }
          UI.open('stop', { stop: s });
        }));
        fillLines(ctx, list);
      }
      async function tab(t) {
        st.tab = t;
        ctx.body.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === t));
        if (input.value.trim()) return;
        if (t === 'hist') {
          renderStops(recentStops.list(), { emptyTitle: 'Noch kein Verlauf', emptyText: 'Gesuchte Haltestellen erscheinen hier.' });
          note.textContent = 'Es werden nur Haltestellen aus dem Verlauf angezeigt. Unter „Mehr“ > „Einstellungen“ > „Privatsphäre“ können Sie Ihren Verlauf löschen.';
        } else if (t === 'fav') {
          renderStops(M.favs.stops(), { emptyTitle: 'Noch keine Favoriten', emptyText: 'Tippe auf den Stern einer Haltestelle, um sie hier zu sehen.' });
          note.textContent = 'Favoriten werden nur auf diesem Gerät gespeichert.';
        } else {
          box.innerHTML = C.skel(5);
          note.textContent = 'Entfernung ab deinem aktuellen Standort berechnet.';
          try {
            const pos = await M.Geo.get(10000);
            const list = await M.Transit.nearby(pos.lat, pos.lon, M.settings.radius || 900);
            if (!ctx.alive() || st.tab !== 'near' || input.value.trim()) return;
            renderStops(list.slice(0, 20), { dist: true, emptyTitle: 'Keine Haltestellen in der Nähe' });
            M.Map.showStopList(list.slice(0, 20));
          } catch (e) {
            if (!ctx.alive()) return;
            box.innerHTML = C.empty('Standort nicht verfügbar', 'Erlaube den Standortzugriff, damit Muvit Haltestellen in deiner Nähe findet.');
          }
        }
      }
      const search = M.debounce(async () => {
        const q = input.value.trim(); st.q = q;
        clr.hidden = !q;
        if (q.length < 1) { tab(st.tab); return; }
        const my = ++token;
        box.innerHTML = C.skel(5);
        note.textContent = '';
        try {
          const lm = q.match(LINE_RE);
          let lines = [];
          if (lm) {
            const c = M.Geo.pos || M.Map.center();
            st.lines = st.lines || await M.Transit.linesNear(c.lat, c.lon).catch(() => []);
            const norm = (x) => String(x).toLowerCase().replace(/\s+/g, '');
            lines = st.lines.filter((x) => norm(x.line.name) === norm(lm[1]) || norm(x.line.full).startsWith(norm(lm[1])));
          }
          const res = q.length >= 2 ? await M.Transit.search(q, M.Geo.pos || M.Map.center()) : [];
          if (my !== token || !ctx.alive()) return;
          const stops = res.filter((x) => x.type === 'stop');
          let h = '';
          if (lines.length) h += '<div class="lbl">Linien</div>' + lines.map((x, i) => C.lrow({ cls: 'lines', lead: C.badges(x.line), title: esc(x.headsigns.slice(0, 2).join(' – ')), sub: 'Nächste Abfahrt ' + esc(C.countdown(x.next.time).toLowerCase()) + ' ab ' + esc(x.next.stop.name) }, 'L' + i)).join('');
          if (stops.length) h += (lines.length ? '<div class="lbl">Haltestellen</div>' : '') + stops.map((s, i) => C.stopRow(s, i)).join('');
          box.innerHTML = h || C.empty('Nichts gefunden', 'Prüfe die Schreibweise oder suche nach einer Liniennummer.');
          box.querySelectorAll('[data-i^="L"]').forEach((el) => el.addEventListener('click', () => { const x = lines[+el.dataset.i.slice(1)]; UI.open('trip', { tripId: x.next.tripId, src: x.next.src, line: x.line, headsign: x.next.headsign }); }));
          box.querySelectorAll('.stop-row').forEach((el) => el.addEventListener('click', (e) => {
            const s = stops[+el.dataset.i], sb = e.target.closest('[data-star]');
            if (sb) { e.stopPropagation(); const on = M.favs.toggleStop(s); sb.classList.toggle('on', on); sb.innerHTML = icon(on ? 'starFill' : 'star'); return; }
            UI.open('stop', { stop: s });
          }));
          fillLines(ctx, stops);
        } catch (e) { if (my === token) { box.innerHTML = ''; box.appendChild(C.error(e, search)); } }
      }, 250);
      ctx.body.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { input.value = ''; st.q = ''; clr.hidden = true; tab(b.dataset.tab); }));
      input.addEventListener('input', search);
      clr.addEventListener('click', () => { input.value = ''; search(); });
      if (st.q) search(); else tab(st.tab);
    }
  };

  /* =====================================================================
     Verkehrsmelder – aktuelle Störungen & Meldungen
     ===================================================================== */
  V.verkehr = {
    height: 0.95,
    render(ctx) {
      const st = ctx.state;
      ctx.head({ title: 'Verkehrsmelder', actions: [{ icon: 'refresh', label: 'Aktualisieren', onClick: () => { st.items = null; load(); } }] });
      ctx.body.innerHTML = '<div class="day" style="border-top:0"><span>Aktuelle Meldungen der MVB</span><span class="upd" data-upd></span></div><div data-list>' + C.skel(5) + '</div>' +
        '<div class="hint" style="padding-top:18px">' + icon('infoFill') + '<span>Die Meldungen stammen aus den Echtzeitdaten der MVB (Straßenbahn und Bus in Magdeburg). Muvit fragt dafür die wichtigsten Haltestellen im ganzen Stadtgebiet ab.</span></div>' +
        '<div class="btn-row" style="padding-top:6px"><a class="btn-o" href="https://www.mvbnet.de/" target="_blank" rel="noopener">' + icon('external') + 'Alle Meldungen auf mvbnet.de</a></div>';
      const box = M.$('[data-list]', ctx.body);
      const isMvb = (l) => !l || /MVB|Magdeburger Verkehrsbetriebe/i.test(l.agency || '') || (!l.agency && (l.mode === 'tram' || l.mode === 'bus'));
      function itemHTML(a, i) {
        const ls = a.lines.filter((l) => isMvb(l) === a.mvb);
        return '<div class="dep-item"><button class="alert-line" style="padding-top:14px" data-i="' + i + '">' + icon('warnFill', 'w') +
          '<span class="tx"><b>' + C.richText(a.title) + '</b>' + (ls.length ? '<span style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">' + C.lineGroups(ls) + '</span>' : '') +
          '<span class="c-gray" style="display:block;margin-top:6px;font-size:14px">' + esc(a.stops.slice(0, 3).join(', ')) + (a.stops.length > 3 ? ' u. a.' : '') + '</span></span><span class="chev">' + icon('down') + '</span></button></div>';
      }
      function draw() {
        const items = st.items || [];
        M.$('[data-upd]', ctx.body).textContent = st.loading ? 'Wird geladen …' : 'Aktualisiert: ' + M.fmtTime(st.updated || new Date());
        const mvb = items.filter((a) => a.mvb), other = items.filter((a) => !a.mvb);
        if (!items.length) { box.innerHTML = st.loading ? C.skel(4) : C.empty('Keine Störungen gemeldet', 'Für Straßenbahn und Bus in Magdeburg liegen gerade keine Meldungen vor.'); return; }
        let h = mvb.length ? mvb.map((a) => itemHTML(a, items.indexOf(a))).join('') : C.empty('Keine MVB-Meldungen', 'Für Straßenbahn und Bus liegen gerade keine Meldungen vor.');
        if (other.length) h += '<div class="lbl" style="padding-top:18px">Weitere Meldungen (Bahn)</div>' + other.map((a) => itemHTML(a, items.indexOf(a))).join('');
        if (st.loading) h += C.skel(2);
        box.innerHTML = h;
        bindAll(box, '.alert-line', (b) => {
          const a = items[+b.dataset.i], n = b.nextElementSibling;
          if (n) { n.remove(); return; }
          b.insertAdjacentHTML('afterend', '<div class="alert-det">' + esc(a.text || 'Keine weiteren Details.') + '</div>');
        });
      }
      async function load() {
        box.innerHTML = C.skel(5);
        st.loading = true; st.items = [];
        const map = new Map();
        const add = (a, line, s) => {
          const k = a.title;
          if (!map.has(k)) map.set(k, { title: a.title, text: a.text, lines: [], stops: [], mvb: isMvb(line) });
          const it = map.get(k);
          if (line && !it.lines.some((l) => l.name === line.name && l.mode === line.mode)) it.lines.push(line);
          if (line && isMvb(line)) it.mvb = true;
          if (!it.stops.includes(s.name)) it.stops.push(s.name);
        };
        try {
          const c = M.CONFIG.center;
          const { list } = await M.Transit.cityStops(c.lat, c.lon);
          let i = 0;
          const worker = async () => {
            while (i < list.length) {
              const s = list[i++];
              try {
                const r = await M.Transit.departures(s, { n: 80 });
                (r.alerts || []).forEach((a) => add(a, null, s));
                r.list.forEach((x) => (x.alerts || []).forEach((a) => add(a, x.line, s)));
              } catch (e) { /* Haltestelle überspringen */ }
              if (!ctx.alive()) return;
              st.items = Array.from(map.values()).sort((a, b) => b.lines.length - a.lines.length);
              draw();
            }
          };
          await Promise.all([worker(), worker(), worker()]);
          if (!ctx.alive()) return;
          st.loading = false; st.updated = new Date();
          st.items = Array.from(map.values()).sort((a, b) => b.lines.length - a.lines.length);
          draw();
        } catch (e) { st.loading = false; if (ctx.alive()) { box.innerHTML = ''; box.appendChild(C.error(e, load)); } }
      }
      if (st.items && !st.loading && ctx.restoring) draw(); else load();
    }
  };


  /* =====================================================================
     Netzplan – Live-Karte & Linien
     ===================================================================== */
  V.netz = {
    height: 0.46,
    render(ctx) {
      const st = ctx.state;
      ctx.head({ title: 'Netzplan', actions: [{ icon: 'refresh', label: 'Neu laden', onClick: () => { st.lines = null; M.Map.refreshVehicles(); load(); } }] });
      const wasOn = M.Map.showVehicles;
      M.Map.setShowVehicles(true);
      ctx.cleanup(() => { if (!wasOn) M.Map.setShowVehicles(false); });
      if (M.Map.map && !ctx.restoring) {
        // ganze Stadt zeigen, damit alle Fahrzeuge zu sehen sind
        const b = M.CONFIG.mdBBox;
        M.Map.fitCoords([[b.minLon, b.minLat], [b.maxLon, b.maxLat]], { maxZoom: 13 });
      }
      ctx.body.innerHTML =
        '<div class="kv" style="border-top:0"><div class="k">Live-Fahrzeuge<small data-live>Straßenbahnen, Busse und Züge in Echtzeit</small></div><label class="sw"><input type="checkbox" data-sw="veh" checked><span></span></label></div>' +
        '<div class="kv"><div class="k">Haltestellen<small>„H“-Zeichen auf der Karte</small></div><label class="sw"><input type="checkbox" data-sw="stops"' + (M.Map.showStops ? ' checked' : '') + '><span></span></label></div>' +
        '<div class="lbl" data-ltitle>Alle Linien</div><div data-list>' + C.skel(6) + '</div>';
      ctx.body.querySelectorAll('[data-sw]').forEach((i) => i.addEventListener('change', () => {
        if (i.dataset.sw === 'veh') { M.Map.setShowVehicles(i.checked); M.saveSettings({ showVehicles: i.checked }); }
        else { M.Map.setShowStops(i.checked); M.saveSettings({ showStops: i.checked }); }
      }));
      ctx.on('vehicles:update', (ev) => {
        const el = M.$('[data-live]', ctx.body);
        if (el && ev) el.textContent = ev.tooFar ? 'Zum Anzeigen näher heranzoomen' : (ev.list.length + ' Fahrzeuge live ' + (M.Map.vehArea ? 'in ' + M.Map.vehArea : 'in der Umgebung'));
        if (ev && !ev.tooFar && st.lines) { const n = liveOnly().length; if (n !== st.liveN) { st.liveN = n; draw(); } }
      });
      /** Linien, die gerade fahren, aber an keiner abgefragten Haltestelle auftauchten */
      function liveOnly() {
        const known = new Set((st.lines || []).map((x) => x.line.mode + '|' + x.line.name)), out = new Map();
        (M.Map.vehVisible || []).forEach((v) => {
          const L = v.seg.line, k = L.mode + '|' + L.name;
          if (!known.has(k) && !out.has(k)) out.set(k, { line: L, headsigns: v.seg.to ? [v.seg.to] : [], live: { tripId: v.tripId } });
        });
        return Array.from(out.values());
      }
      const box = M.$('[data-list]', ctx.body);
      const ORDER = { tram: 0, bus: 1, night: 2, sbahn: 3, ubahn: 4, regio: 5, fern: 6, ferry: 7, other: 8 };
      const group = (l) => (M.isNight(l) ? 'night' : l.mode);
      /** Vollständige Linienliste (Transitous-Linien im MVB-Gebiet) mit den nächsten Abfahrten zusammenführen */
      function merged() {
        const map = new Map(), key = (l) => l.mode + '|' + l.name;
        (st.routes || []).forEach((R) => map.set(key(R.line), { line: R.line, headsigns: R.termini, route: R }));
        (st.lines || []).concat(liveOnly()).forEach((x) => {
          const m = map.get(key(x.line));
          if (m) Object.assign(m, { next: x.next, live: x.live, headsigns: x.headsigns && x.headsigns.length ? x.headsigns : m.headsigns });
          else map.set(key(x.line), x);
        });
        return Array.from(map.values());
      }
      function draw() {
        const L = merged().sort((a, b) => ((ORDER[group(a.line)] ?? 9) - (ORDER[group(b.line)] ?? 9)) || a.line.name.localeCompare(b.line.name, 'de', { numeric: true }));
        const t = M.$('[data-ltitle]', ctx.body);
        if (t) t.textContent = 'Alle Linien' + (st.area ? ' in ' + st.area : '') + (L.length ? ' (' + L.length + ')' : '');
        if (!L.length) { box.innerHTML = st.loading ? C.skel(6) : C.empty('Keine Linien gefunden', 'Bitte später erneut versuchen.'); return; }
        let h = '', mode = null;
        L.forEach((x, i) => {
          if (group(x.line) !== mode) { mode = group(x.line); h += '<div class="lbl" style="padding-top:16px">' + (mode === 'night' ? 'Nachtlinien' : M.modeInfo(mode).label) + '</div>'; }
          const sub = x.next ? 'Nächste Abfahrt ' + esc(C.countdown(x.next.time).toLowerCase()) + ' ab ' + esc(x.next.stop.name) : x.live ? 'Gerade unterwegs' : 'Derzeit keine Fahrten · Linienverlauf ansehen';
          h += C.lrow({ cls: 'lines', lead: C.badges(x.line), title: esc(x.headsigns.slice(0, 2).join(' – ') || M.modeInfo(x.line.mode).label + ' ' + x.line.name), sub }, i);
        });
        if (st.loading) h += C.skel(2);
        box.innerHTML = h;
        bindAll(box, '.lrow', (el) => {
          const x = L[+el.dataset.i];
          if (x.next) UI.open('trip', { tripId: x.next.tripId, src: x.next.src, line: x.line, headsign: x.next.headsign });
          else if (x.live) UI.open('trip', { tripId: x.live.tripId, src: 'motis', line: x.line });
          else if (x.route) UI.open('linie', { route: x.route });
        });
      }
      async function load() {
        box.innerHTML = C.skel(6);
        const c = M.CONFIG.center;   // Muvit ist eine Magdeburg-App
        st.area = 'Magdeburg'; st.loading = true; st.lines = null;
        // vollständige Liste aller Linien (auch Sonderlinien ohne Fahrten in den nächsten Stunden)
        M.Transit.cityRoutes().then((r) => { st.routes = r; if (ctx.alive()) draw(); }).catch(() => { /* nur Abfahrten */ });
        try {
          const res = await M.Transit.linesCity(c.lat, c.lon, (part) => { if (ctx.alive()) { st.lines = part; draw(); } });
          st.lines = res; st.loading = false;
          if (ctx.alive()) draw();
        } catch (e) { st.loading = false; if (ctx.alive()) { box.innerHTML = ''; box.appendChild(C.error(e, load)); } }
      }
      if (st.lines) draw(); else load();
    }
  };

  /* =====================================================================
     Linie – Verlauf einer Linie (aus dem Liniennetz), beide Richtungen
     ===================================================================== */
  V.linie = {
    height: 0.6,
    render(ctx) {
      const R = ctx.params.route, st = ctx.state;
      st.dir = st.dir || 0;
      ctx.head({ title: 'Linienverlauf' });
      const draw = () => {
        const v = st.dir && R.back ? R.back : R.main;
        const a = v.stops[0].name, z = v.stops[v.stops.length - 1].name;
        ctx.extra('<div class="trip-head">' + C.badges(R.line) + icon('arrow', 'to-ar') + '<span class="to">' + esc(z) + '</span></div>');
        const c = M.routeColor(R.line);
        ctx.body.innerHTML = (R.back ? '<div class="btn-row" style="padding-top:12px"><button class="btn-o" data-dir>' + icon('swap') + 'Gegenrichtung: nach ' + esc(a) + '</button></div>' : '') +
          '<div class="trip-list" style="--c:' + c + ';--dc:' + M.stopDotColor(c) + ';margin-top:8px">' +
          v.stops.map((s, i) => '<button class="trow" data-i="' + i + '"><div style="min-width:0"><div class="nm"><span>' + esc(s.name) + '</span></div></div><div class="r"></div></button>').join('') + '</div>' +
          '<div class="trip-foot">' + icon('route') + v.stops.length + ' Haltestellen · Fahrplan laut Transitous</div>';
        const list = ctx.body.querySelector('.trip-list');
        layoutRail(list, { state: 'before', idx: 0, f: 0 });
        bindAll(ctx.body, '[data-dir]', () => { st.dir = st.dir ? 0 : 1; draw(); });
        bindAll(ctx.body, '.trow', (el) => { const s = v.stops[+el.dataset.i]; UI.open('stop', { stop: { id: s.id, name: s.name, lat: s.lat, lon: s.lon, type: 'stop', src: 'motis' } }); });
        M.Map.drawTrip({ line: R.line, stops: v.stops, coords: v.coords }, { fit: true });
      };
      draw();
    }
  };

  /* =====================================================================
     Verlauf (alle Routen)
     ===================================================================== */
  V.history = {
    height: 0.95,
    render(ctx) {
      ctx.head({ title: 'Verlauf' });
      const draw = () => {
        const routes = M.favs.routes().map((r) => Object.assign({ fav: true }, r)).concat(M.recents.routes()).filter((r, i, a) => a.findIndex((x) => x.key === r.key) === i);
        ctx.body.innerHTML = routes.length ? routes.map((r, i) => C.lrow({ icon: r.fav ? 'starFill' : 'history', title: esc(placeName(r.from) || 'Mein Standort') + ' → ' + esc(r.to.name), sub: r.fav ? 'Gemerkte Route' : 'Zuletzt gesucht' }, i)).join('') +
          '<div class="btn-row"><button class="btn-o" data-clear>' + icon('trash') + 'Verlauf löschen</button></div>' : C.empty('Noch kein Verlauf', 'Deine gesuchten Verbindungen erscheinen hier.');
        bindAll(ctx.body, '.lrow', (el) => { const r = routes[+el.dataset.i]; M.state.from = r.from; M.state.to = r.to; M.state.via = []; App().search(); });
        bindAll(ctx.body, '[data-clear]', () => { M.store.del('recentRoutes'); draw(); });
      };
      draw();
    }
  };

  /* =====================================================================
     Einstellungen (Mehr)
     ===================================================================== */
  V.settings = {
    height: 'full',
    render(ctx) {
      const s = M.settings;
      ctx.head({ title: 'Einstellungen' });
      const seg = (key, opts) => '<div class="seg" data-seg="' + key + '">' + opts.map((o) => '<button data-v="' + o[0] + '" class="' + (String(s[key]) === String(o[0]) ? 'on' : '') + '">' + o[1] + '</button>').join('') + '</div>';
      const sw = (id, on) => '<label class="sw"><input type="checkbox" data-sw="' + id + '"' + (on ? ' checked' : '') + '><span></span></label>';
      const notifState = () => (!('Notification' in window) ? 'In diesem Browser nicht verfügbar (iPhone: Muvit zum Home-Bildschirm hinzufügen)'
        : Notification.permission === 'granted' ? 'Erlaubt' + (M.Watch && M.Watch.pushReady() ? ' – auch bei geschlossener App' : ' – nur solange Muvit geöffnet ist (Push-Dienst nicht eingerichtet)')
        : Notification.permission === 'denied' ? 'Blockiert – in den Browser-Einstellungen freigeben' : 'Noch nicht erlaubt');
      ctx.body.innerHTML =
        '<div class="lbl" style="padding-top:6px">Assistance (Muvit KI)</div>' +
        '<div class="hint" style="padding-bottom:14px">' + icon('infoFill') + '<span>Die Assistance nutzt Claude von Anthropic. Dein API-Schlüssel bleibt nur in diesem Browser und wird direkt an api.anthropic.com gesendet. Ohne Schlüssel beantwortet Muvit typische Fragen im Basis-Modus.</span></div>' +
        '<label class="field"><span>Anthropic API-Schlüssel</span><div class="inp-wrap"><input class="inp" type="password" data-key placeholder="sk-ant-…" value="' + esc(s.apiKey || '') + '" autocomplete="off"><button class="eye" data-eye>' + icon('eye') + '</button></div></label>' +
        '<label class="field"><span>Modell</span><select class="inp" data-model>' + M.CONFIG.aiModels.map((m) => '<option value="' + m.id + '"' + (s.model === m.id ? ' selected' : '') + '>' + esc(m.label) + '</option>').join('') + '</select></label>' +
        '<label class="field"><span>Antwortstil</span></label>' + seg('effort', [['low', 'Schnell'], ['medium', 'Ausgewogen'], ['high', 'Gründlich']]) +
        '<div class="btn-row" style="padding-top:0"><button class="btn-o" data-test>' + icon('check') + 'Schlüssel testen</button><button class="btn-o" data-clearkey>' + icon('trash') + 'Entfernen</button></div>' +
        '<div class="lbl">Karte</div>' +
        '<div class="kv"><div class="k">Live-Fahrzeuge</div>' + sw('veh', s.showVehicles !== false) + '</div>' +
        '<div class="kv"><div class="k">Haltestellen („H“)</div>' + sw('stops', s.showStops !== false) + '</div>' +
        '<div class="kv"><div class="k">Dunkle Karte</div>' + sw('dark', !!s.mapDark) + '</div>' +
        '<div class="kv"><div class="k">Mitteilungen<small data-npst>' + notifState() + '</small></div><button class="btn-o" data-notif style="height:36px">' + icon('bell') + 'Erlauben</button></div>' +
        '<div class="lbl">Fahrplandaten</div>' + seg('provider', [['motis', 'Transitous (Echtzeit)'], ['db', 'Deutsche Bahn']]) +
        '<div class="lbl" style="padding-top:4px">Umkreis „In der Nähe“</div>' + seg('radius', [[500, '500 m'], [900, '900 m'], [1500, '1,5 km']]) +
        '<div class="lbl">Privatsphäre</div>' +
        '<div class="kv"><div class="k">Verlauf löschen<small>Gesuchte Orte, Routen und Haltestellen</small></div><button class="btn-o" data-wipe>Löschen</button></div>' +
        '<div class="kv"><div class="k">Favoriten löschen<small>Gemerkte Haltestellen und Routen</small></div><button class="btn-o" data-wipefav>Löschen</button></div>' +
        '<div class="lbl">Über Muvit</div><div class="hint">' + icon('infoFill') + '<span>Fahrplan & Echtzeit: <a href="https://transitous.org" target="_blank" rel="noopener">Transitous</a> und <a href="https://v6.db.transport.rest" target="_blank" rel="noopener">db.transport.rest</a>. Karte: © OpenStreetMap-Mitwirkende, OpenFreeMap, MapLibre. Icons: <a href="https://www.flaticon.com/uicons" target="_blank" rel="noopener">Uicons by Flaticon</a>. Code-Leser: <a href="https://github.com/zxing-js/library" target="_blank" rel="noopener">ZXing for JS</a> (Apache-2.0). Tarife ohne Gewähr.</span></div>';
      ctx.body.querySelectorAll('[data-seg]').forEach((g) => g.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
        const key = g.dataset.seg; let v = b.dataset.v; if (key === 'radius') v = +v;
        M.saveSettings({ [key]: v });
        g.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
      })));
      ctx.body.querySelectorAll('[data-sw]').forEach((i) => i.addEventListener('change', () => {
        if (i.dataset.sw === 'veh') { M.saveSettings({ showVehicles: i.checked }); M.Map.setShowVehicles(i.checked); }
        if (i.dataset.sw === 'stops') { M.saveSettings({ showStops: i.checked }); M.Map.setShowStops(i.checked); }
        if (i.dataset.sw === 'dark') { M.saveSettings({ mapDark: i.checked }); M.Map.setTheme(i.checked); }
      }));
      const key = M.$('[data-key]', ctx.body);
      key.addEventListener('change', () => M.saveSettings({ apiKey: key.value.trim() }));
      bindAll(ctx.body, '[data-eye]', () => { key.type = key.type === 'password' ? 'text' : 'password'; });
      M.$('[data-model]', ctx.body).addEventListener('change', (e) => M.saveSettings({ model: e.target.value }));
      bindAll(ctx.body, '[data-clearkey]', () => { key.value = ''; M.saveSettings({ apiKey: '' }); M.toast('API-Schlüssel entfernt'); });
      bindAll(ctx.body, '[data-test]', async (b) => {
        M.saveSettings({ apiKey: key.value.trim() });
        b.disabled = true;
        try { await M.Assistant.testKey(); M.toast('Verbindung zu Claude funktioniert'); }
        catch (err) { M.toast(err.message || 'Test fehlgeschlagen', { type: 'err', ms: 6000 }); }
        finally { b.disabled = false; }
      });
      bindAll(ctx.body, '[data-notif]', async () => {
        if (!('Notification' in window)) { M.toast('Mitteilungen sind hier nicht verfügbar. Auf dem iPhone Muvit zuerst zum Home-Bildschirm hinzufügen.', { type: 'err', ms: 6000 }); return; }
        try { await Notification.requestPermission(); } catch (e) { /* ignore */ }
        const el = M.$('[data-npst]', ctx.body); if (el) el.textContent = notifState();
      });
      bindAll(ctx.body, '[data-wipe]', () => { ['recentPlaces', 'recentRoutes', 'recentStops', 'stopLines'].forEach((k) => M.store.del(k)); M.toast('Verlauf gelöscht'); });
      bindAll(ctx.body, '[data-wipefav]', () => { ['favStops', 'favRoutes'].forEach((k) => M.store.del(k)); M.toast('Favoriten gelöscht'); });
    }
  };
})(window.Muvit = window.Muvit || {});
