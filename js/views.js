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
  const placeName = (p) => (!p ? '' : M.isMe(p) ? 'Mein Standort' : p.name);
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
          : '<div class="empty-hint" data-fit-end>Deine gesuchten Verbindungen erscheinen hier.</div>') +
        '<div class="sec">Mehr</div>' +
        C.lrow({ icon: 'star', title: 'Favoriten', sub: 'Gemerkte Haltestellen & Routen' }, 'fav') +
        C.lrow({ icon: 'settings', title: 'Einstellungen', sub: 'Assistance (KI), Karte, Privatsphäre' }, 'set');
      bindAll(ctx.body, '[data-f]', () => App().pickFrom());
      bindAll(ctx.body, '[data-t]', () => App().pickTo());
      bindAll(ctx.body, '[data-swap]', (el) => { const f = s.from; s.from = s.to; s.to = f; el.classList.toggle('spin'); setTimeout(() => UI.refresh(), 250); });
      bindAll(ctx.body, '.gbtn', (el) => UI.open(el.dataset.v, {}));
      bindAll(ctx.body, '[data-allhist]', () => UI.open('history', {}));
      bindAll(ctx.body, '[data-r]', (el) => { const r = routes[+el.dataset.r]; s.from = r.from; s.to = r.to; s.via = []; App().search(); });
      bindAll(ctx.body, '.lrow[data-i="fav"]', () => UI.open('departures', { tab: 'fav' }));
      bindAll(ctx.body, '.lrow[data-i="set"]', () => UI.open('settings', {}));
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
        '<div class="search">' + icon('search', 'si') + '<input id="plq" placeholder="' + esc(p.placeholder || 'Haltestelle, Adresse oder Ort') + '" autocomplete="off" enterkeyhint="search"><button class="clr" id="plx" hidden aria-label="Leeren">' + icon('close') + '</button></div>' +
        '<div id="plres" style="margin-top:12px"></div>';
      const input = M.$('#plq', ctx.body), res = M.$('#plres', ctx.body), clr = M.$('#plx', ctx.body);
      let results = [], token = 0;
      const pick = (place) => { M.recents.addPlace(place); ctx.back(); if (p.onPick) p.onPick(place); };

      function rows(list, startIdx, sub) {
        return list.map((x, k) => {
          const i = startIdx + k;
          if (x.type === 'stop') return C.stopRow(x, i, { star: false, end: x.distance != null ? M.fmtDist(x.distance) : (M.Geo.pos ? M.fmtDist(M.dist(M.Geo.pos.lat, M.Geo.pos.lon, x.lat, x.lon)) : '') });
          return C.lrow({ icon: x.type === 'address' ? 'pin' : 'flag', white: true, title: esc(x.name), sub: esc(sub ? sub(x) : (x.area || '')), chev: false, end: M.Geo.pos ? M.fmtDist(M.dist(M.Geo.pos.lat, M.Geo.pos.lon, x.lat, x.lon)) : '' }, i);
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
  async function runJourneys(q, cursor) {
    const from = await M.concretePlace(q.from), to = await M.concretePlace(q.to);
    return M.Transit.journeys({ from, to, via: q.via, time: q.time, arriveBy: q.arriveBy, cursor, modes: q.dticket ? ['tram', 'bus', 'sbahn', 'ubahn', 'regio', 'ferry'] : null });
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
      '<span class="vb-node"></span><div class="vb-name" data-stop="' + key + '">' + esc(ev.name) + '</div>' + C.bstg(ev.platform) + '</div>';
  }
  function legHTML(l, i) {
    const c = M.routeColor(l.line);
    const n = l.stops.length;
    return '<div class="vb-leg" data-leg="' + i + '" style="--c:' + c + '"><div class="vb-rail"></div>' +
      stopRowHTML(l.from, c, i + ':f', { realtime: l.realtime }) +
      '<div class="vb-body"><div class="vb-line"><span class="bds" data-trip="' + i + '">' + C.badges(l.line) + '</span><span class="dir">nach ' + esc(l.headsign || l.to.name) + '</span></div>' +
        (l.wheelchair ? '<div class="wbox" title="Barrierefrei">' + icon('wheel') + '</div>' : '') +
        l.alerts.map((a) => '<div class="vb-alert">' + icon('warnFill') + '<div>' + esc(a.title) + (a.text ? '<small>' + esc(a.text.slice(0, 220)) + '</small>' : '') + '</div></div>').join('') +
        (n ? '<button class="vb-tog" data-tog="' + i + '">' + icon('down') + n + (n === 1 ? ' Haltestelle' : ' Haltestellen') + '</button>' +
          '<div class="vb-inter">' + l.stops.map((s) => '<div class="ist' + (s.cancelled ? ' cx' : '') + '"><div class="n"><span>' + esc(s.name) + '</span></div><div class="t">' + M.fmtTime(s.arr || s.dep || s.arrPlanned || s.depPlanned) + '</div></div>').join('') + '</div>' : '') +
      '</div>' +
      stopRowHTML(l.to, c, i + ':t', { realtime: l.realtime }) +
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
          if (i > 0 && !legs[i - 1].walk) h += '<div class="vb-walk"><span class="wl">' + Math.max(0, M.delayMin(l.from.time, legs[i - 1].to.time)) + ' Min.</span>Umstieg · ' + Math.max(0, M.delayMin(l.from.time, legs[i - 1].to.time)) + ' Min.</div>';
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
        bindAll(ctx.body, '[data-trip]', (b) => { const l = j.legs[+b.dataset.trip]; if (l.tripId) UI.open('trip', { tripId: l.tripId, src: j.src, line: l.line, focusStop: l.from.name }); });
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
        else if (a === 'share') {
          const a0 = j.legs[0].from, b0 = j.legs[j.legs.length - 1].to;
          const text = 'Muvit · ' + a0.name + ' → ' + b0.name + '\n' + M.fmtDayTime(a0.time) + ' – ' + M.fmtTime(b0.time) + ' (' + M.fmtDur(j.duration) + ')\n' +
            j.legs.filter((l) => !l.walk).map((l) => '• ' + M.fmtTime(l.from.time) + ' ' + M.modeInfo(l.line.mode).short + ' ' + l.line.full + ' → ' + l.headsign + ' ab ' + l.from.name + (l.from.platform ? ' (' + C.platform(l.from.platform) + ')' : '')).join('\n');
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
  function viaText(t) {
    const ln = t.line && t.line.longName;
    if (ln && !/^\s*\d+\s*$/.test(ln) && ln.length < 60) return ln;
    const s = t.stops;
    if (s.length < 5) return '';
    return 'ü. ' + s[Math.floor(s.length / 3)].name + ' & ' + s[Math.floor((2 * s.length) / 3)].name;
  }
  M.tripProgress = tripProgress;

  V.trip = {
    height: 0.95,
    render(ctx) {
      const p = ctx.params, st = ctx.state;
      let idxs = null;
      ctx.head({ title: 'Fahrtverlauf' });
      if (p.line) ctx.extra('<div class="trip-head">' + C.badges(p.line) + '<span class="to">-&gt; …</span></div>');
      ctx.body.innerHTML = C.skel(7);

      function draw() {
        const t = st.trip, now = Date.now();
        ctx.extra('<div class="trip-head">' + C.badges(t.line) + '<span class="to">-&gt; ' + esc(t.headsign) + '</span></div>' + (viaText(t) ? '<div class="trip-via">' + esc(viaText(t)) + '</div>' : ''));
        const T = t.stops.map(stopTimes);
        let next = T.findIndex((x, i) => (i === T.length - 1 ? x.a : x.d) >= now - 20000);
        if (next < 0) next = T.length;
        const c = M.routeColor(t.line);
        const wc = t.wheelchair ? ' • ' + icon('wheel') : '';
        let h = '<div class="trip-list" style="--c:' + c + '">';
        t.stops.forEach((s, i) => {
          const past = i < next, isNext = i === next;
          const tm = i === t.stops.length - 1 ? (s.arr || s.dep) : (s.dep || s.arr);
          const pl = i === t.stops.length - 1 ? (s.arrPlanned || s.depPlanned) : (s.depPlanned || s.arrPlanned);
          const d = t.realtime ? M.delayMin(tm, pl) : null;
          let ss, a, b;
          if (past) {
            ss = '<span>Abgefahren</span>' + wc;
            const m = Math.max(0, -M.minsUntil(tm));
            a = 'Vor ' + m + ' Min'; b = 'Um ' + M.fmtTime(tm);
          } else {
            const x = C.status({ realtime: t.realtime, delay: d, cancelled: s.cancelled });
            const txt = s.cancelled ? 'Fällt aus' : !t.realtime || d == null ? 'Planmäßig' : d === 0 ? 'Pünktlich' : d < 0 ? 'Früher (' + d + ' Min.)' : 'Verspätet (+' + d + ' Min.)';
            ss = '<span class="' + x.cls + '">' + txt + '</span>' + (wc ? '<span class="c-gray" style="display:inline-flex;gap:6px;align-items:center">' + wc + '</span>' : '');
            const mins = M.minsUntil(tm);
            a = '<span class="' + (s.cancelled ? 'c-red' : mins <= 3 ? 'c-orange' : 'c-green') + '">' + (mins <= 0 ? 'Jetzt' : 'In ' + mins + ' Min') + '</span>';
            b = 'Um ' + M.fmtTime(pl || tm) + (d ? ' (vsl. ' + M.fmtTime(tm) + ')' : '');
          }
          const up = i > 0 ? '<span class="rail up' + (i <= next ? ' c' : '') + '"></span>' : '';
          const dn = i < t.stops.length - 1 ? '<span class="rail dn' + (i + 1 <= next ? ' c' : '') + '"></span>' : '';
          h += '<button class="trow' + (past ? ' past' : '') + (isNext ? ' next' : '') + '" data-i="' + i + '">' + up + dn + '<span class="dot"></span>' +
            '<div style="min-width:0"><div class="nm"><span>' + esc(s.name) + '</span>' + (!past ? C.bstg(s.platform) : '') + '</div><div class="ss">' + ss + '</div></div>' +
            '<div class="r"><div class="a">' + a + '</div><div class="b">' + b + '</div></div></button>';
        });
        h += '</div><div class="trip-foot">' + icon('live') + (t.realtime ? 'Echtzeitdaten' : 'Fahrplandaten') + ' · aktualisiert ' + M.fmtTime(st.updated || new Date()) + '</div>';
        const keep = ctx.body.scrollTop;
        ctx.body.innerHTML = h;
        ctx.body.scrollTop = keep;
        bindAll(ctx.body, '.trow', (el) => {
          const s = t.stops[+el.dataset.i];
          UI.open('stop', { stop: { id: s.id, name: s.name, lat: s.lat, lon: s.lon, type: 'stop', src: t.src } });
        });
        if (!st.scrolled) {
          st.scrolled = true;
          const target = ctx.body.querySelector('.trow[data-i="' + (next - 2) + '"]');
          if (target && next > 3) setTimeout(() => { if (ctx.alive()) ctx.body.scrollTop = target.offsetTop; }, 60);
        }
        placeVehicle();
      }
      function placeVehicle() {
        const t = st.trip; if (!t) return;
        const prog = tripProgress(t, Date.now());
        idxs = idxs || stopCoordIdx(t);
        M.Map.setTripVehicle(prog.state === 'between' || prog.state === 'at' ? tripPos(t, idxs, prog) : null, t.line);
      }
      async function load(manual) {
        try {
          const t = await M.Transit.trip(p.tripId, p.src);
          if (!ctx.alive()) return;
          const first = !st.trip;
          st.trip = t; st.updated = new Date(); idxs = null;
          M.Map.drawTrip(t, { fit: first || manual });
          draw();
          if (manual) M.toast('Fahrtverlauf aktualisiert');
        } catch (e) {
          if (!ctx.alive()) return;
          if (!st.trip) { ctx.body.innerHTML = ''; ctx.body.appendChild(C.error(e, () => load(true))); } else if (manual) M.toast(e.message, { type: 'err' });
        }
      }
      if (st.trip && ctx.restoring) { M.Map.drawTrip(st.trip); draw(); } else load(false);
      ctx.every(1000, placeVehicle);
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
      const area = stop.area || (M.inMagdeburg(stop.lat, stop.lon) ? 'Magdeburg' : '');
      ctx.body.innerHTML =
        '<div class="st-title">' + icon('hOutline', 'h') + '<h2>' + esc(stop.name) + '</h2><span data-wc></span></div>' +
        (area ? '<div class="st-area">' + esc(area) + '</div>' : '') +
        '<div class="st-btns"><button class="btn-o" data-alerts>' + icon('infoFill', 'yel') + 'Störungen</button></div>' +
        '<div data-alertbox></div>' +
        '<h3 class="h2">Abfahrten</h3><div class="chips" data-chips></div><div class="hr"></div>' +
        '<div class="day"><span>Heute</span><button class="upd" data-reload><span data-upd>Aktualisiert: –</span>' + icon('refresh') + '</button></div>' +
        '<div data-list>' + C.skel(6) + '</div><div data-more></div>';
      M.Map.addStops([{ id: stop.id, name: stop.name, lat: stop.lat, lon: stop.lon, src: stop.src }]);
      M.Map.flyTo(stop.lat, stop.lon, 16.2);
      const listBox = M.$('[data-list]', ctx.body), chips = M.$('[data-chips]', ctx.body);
      const MODE_TXT = { tram: 'TRAM', bus: 'BUS', sbahn: 'S-BAHN', regio: 'ZUG', fern: 'FERNZUG', ubahn: 'U-BAHN', ferry: 'FÄHRE' };

      function draw() {
        const all = (st.list || []).filter((x) => M.minsUntil(x.time) > -2);
        const MODE_ORDER = ['bus', 'tram', 'sbahn', 'regio', 'fern', 'ubahn', 'ferry'];
        const modes = all.map((x) => x.line.mode).filter((m, i, a) => a.indexOf(m) === i)
          .sort((a, b) => (MODE_ORDER.indexOf(a) + 1 || 99) - (MODE_ORDER.indexOf(b) + 1 || 99));
        chips.innerHTML = modes.map((m) => '<button class="chip' + (st.off.includes(m) ? ' off' : '') + '" data-m="' + m + '">' + C.modeBadge(m) + (MODE_TXT[m] || m.toUpperCase()) + '</button>').join('');
        bindAll(chips, '[data-m]', (b) => { const m = b.dataset.m; st.off = st.off.includes(m) ? st.off.filter((x) => x !== m) : st.off.concat(m); draw(); });
        const shown = all.filter((x) => !st.off.includes(x.line.mode));
        listBox.innerHTML = shown.length ? shown.map((x, i) => C.depRow(x, i)).join('') : C.empty('Keine Abfahrten', 'In nächster Zeit fährt hier nichts ab.');
        bindAll(listBox, '.dep', (b) => { const x = shown[+b.dataset.i]; UI.open('trip', { tripId: x.tripId, src: x.src, line: x.line, focusStop: stop.name }); });
        bindAll(listBox, '.alert-line', (b) => {
          const [i, k] = b.dataset.alert.split(':').map(Number);
          const a = shown[i].alerts[k];
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
      bindAll(ctx.body, '[data-alerts]', () => {
        const box = M.$('[data-alertbox]', ctx.body);
        if (box.innerHTML) { box.innerHTML = ''; return; }
        const seen = new Set(), list = [];
        (st.alerts || []).concat(...(st.list || []).map((x) => x.alerts || [])).forEach((a) => { if (!seen.has(a.title)) { seen.add(a.title); list.push(a); } });
        box.innerHTML = '<div style="padding-top:14px">' + (list.length ? list.map((a) => '<div class="dep-item"><div class="alert-line" style="padding-top:12px">' + icon('warnFill', 'w') + '<span class="tx"><b>' + esc(a.title) + '</b>' + (a.text ? '<br><span class="c-gray">' + esc(a.text) + '</span>' : '') + '</span><span></span></div></div>').join('')
          : '<div class="hint">' + icon('infoFill') + '<span>Aktuell sind für diese Haltestelle keine Störungen gemeldet.</span></div>') + '</div>';
      });
      if (st.list && ctx.restoring) draw(); else load();
      ctx.every(30000, load);
      ctx.every(15000, () => { if (st.list) draw(); });
    }
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
          box.querySelectorAll('[data-i^="L"]').forEach((el) => el.addEventListener('click', () => { const x = lines[+el.dataset.i.slice(1)]; UI.open('trip', { tripId: x.next.tripId, src: x.next.src, line: x.line }); }));
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
      ctx.body.innerHTML = '<div class="day" style="border-top:0"><span>Aktuelle Meldungen</span><span class="upd" data-upd></span></div><div data-list>' + C.skel(5) + '</div>' +
        '<div class="hint" style="padding-top:18px">' + icon('infoFill') + '<span>Meldungen stammen aus den Echtzeitdaten der Verkehrsunternehmen (MVB, DB u. a.) für Haltestellen rund um dich.</span></div>';
      const box = M.$('[data-list]', ctx.body);
      function draw() {
        const items = st.items || [];
        M.$('[data-upd]', ctx.body).textContent = 'Aktualisiert: ' + M.fmtTime(st.updated || new Date());
        if (!items.length) { box.innerHTML = C.empty('Keine Störungen gemeldet', 'Aktuell liegen für die Umgebung keine Meldungen vor.'); return; }
        box.innerHTML = items.map((a, i) => '<div class="dep-item"><button class="alert-line" style="padding-top:14px" data-i="' + i + '">' + icon('warnFill', 'w') +
          '<span class="tx"><b>' + esc(a.title) + '</b><span style="display:flex;gap:5px;flex-wrap:wrap;margin-top:8px">' + M.sortLines(a.lines).slice(0, 10).map((l) => C.badges(l, { sm: true })).join('') + '</span>' +
          '<span class="c-gray" style="display:block;margin-top:6px;font-size:14px">' + esc(a.stops.slice(0, 3).join(', ')) + '</span></span><span class="chev">' + icon('down') + '</span></button></div>').join('');
        bindAll(box, '.alert-line', (b) => {
          const a = items[+b.dataset.i], n = b.nextElementSibling;
          if (n) { n.remove(); return; }
          b.insertAdjacentHTML('afterend', '<div class="alert-det">' + esc(a.text || 'Keine weiteren Details.') + '</div>');
        });
      }
      async function load() {
        box.innerHTML = C.skel(5);
        try {
          const c = M.Geo.pos && M.dist(M.Geo.pos.lat, M.Geo.pos.lon, M.CONFIG.center.lat, M.CONFIG.center.lon) < 40000 ? M.Geo.pos : M.CONFIG.center;
          let stops = await M.Transit.nearby(c.lat, c.lon, 2000);
          stops = stops.sort((a, b) => (b.importance - a.importance) || (a.distance - b.distance)).slice(0, 6);
          const map = new Map();
          for (const s of stops) {
            try {
              const r = await M.Transit.departures(s, { n: 60 });
              const add = (a, line) => {
                const k = a.title;
                if (!map.has(k)) map.set(k, { title: a.title, text: a.text, lines: [], stops: [] });
                const it = map.get(k);
                if (line && !it.lines.some((l) => l.name === line.name && l.mode === line.mode)) it.lines.push(line);
                if (!it.stops.includes(s.name)) it.stops.push(s.name);
              };
              (r.alerts || []).forEach((a) => add(a, null));
              r.list.forEach((x) => (x.alerts || []).forEach((a) => add(a, x.line)));
            } catch (e) { /* Haltestelle überspringen */ }
            if (!ctx.alive()) return;
          }
          st.items = Array.from(map.values()); st.updated = new Date();
          draw();
        } catch (e) { if (ctx.alive()) { box.innerHTML = ''; box.appendChild(C.error(e, load)); } }
      }
      if (st.items) draw(); else load();
    }
  };

  /* =====================================================================
     Abonnements
     ===================================================================== */
  function ticketCard(p, opts) {
    opts = opts || {};
    return '<div class="card-o"><div class="top"><div class="n">' + esc(p.name) + '</div><div class="p">' + (p.price != null ? M.money(p.price) + (p.unit ? '<small>' + esc(p.unit) + '</small>' : '') : '<small style="margin:0">Preis laut marego</small>') + '</div></div>' +
      '<div class="z">' + esc(p.zone) + '</div>' +
      (p.app || p.child ? '<div class="sub2">' + (p.app ? '<span>App/online: <b>' + M.money(p.app) + '</b></span>' : '') + (p.child ? '<span>Kind 6–14: <b>' + M.money(p.child) + '</b>' + (p.childApp ? ' (App ' + M.money(p.childApp) + ')' : '') + '</span>' : '') + '</div>' : '') +
      '<div class="d">' + esc(p.note) + '</div>' +
      (p.tags ? '<div class="tags">' + p.tags.map((t) => '<span>' + esc(t) + '</span>').join('') + '</div>' : '') +
      (opts.link ? '<a class="btn-o acc" href="' + opts.link + '" target="_blank" rel="noopener">' + icon('external') + esc(opts.linkText || 'Mehr erfahren') + '</a>' : '') + '</div>';
  }
  V.abos = {
    height: 0.95,
    render(ctx) {
      const T = M.Tariffs;
      ctx.head({ title: 'Abonnements' });
      const dt = T.products.find((p) => p.id === 'dt'), abo = T.products.find((p) => p.id === 'abo');
      ctx.body.innerHTML = '<div class="lbl" style="padding-top:6px">Stand ' + T.stand + ' · ohne Gewähr</div>' +
        ticketCard(dt, { link: 'https://www.bahn.de/angebot/regio/deutschland-ticket', linkText: 'Deutschlandticket abschließen' }) +
        ticketCard(abo, { link: 'https://www.marego-heimat.de/', linkText: 'marego-Abo ansehen' }) +
        '<div class="hint">' + icon('infoFill') + '<span>Mit dem Deutschlandticket fährst du in ganz Magdeburg (Straßenbahn, Bus, S-Bahn) und bundesweit im Nahverkehr ohne Aufpreis.</span></div>';
    }
  };

  /* =====================================================================
     Ticket kaufen
     ===================================================================== */
  V.tickets = {
    height: 0.95,
    render(ctx) {
      const T = M.Tariffs, st = ctx.state;
      ctx.head({ title: 'Ticket kaufen' });
      const shop = 'https://www.mvbnet.de/fahrkarten/';
      ctx.body.innerHTML = '<div class="lbl" style="padding-top:6px">Magdeburg · ' + esc(T.verbund) + ' · Stand ' + T.stand + '</div>' +
        T.products.filter((p) => ['einzel', 'kurz', '24h'].includes(p.id)).map((p) => ticketCard(p, { link: shop, linkText: 'Bei der MVB kaufen' })).join('') +
        '<div class="lbl">Preis für deine Strecke</div>' +
        '<div class="od"><button class="od-row" data-pick="from"><span class="radio on"></span><span class="v' + (st.from ? '' : ' ph') + '">' + esc(st.from ? placeName(st.from) : 'Start eingeben') + '</span></button><div class="od-div"></div>' +
        '<button class="od-row" data-pick="to"><span class="radio off"></span><span class="v' + (st.to ? '' : ' ph') + '">' + esc(st.to ? placeName(st.to) : 'Ziel eingeben') + '</span></button></div>' +
        '<button class="btn-a full" data-calc style="margin-top:14px">' + icon('euro') + 'Preis ermitteln</button><div data-res></div>' +
        '<div class="lbl">Fernverkehr & Deutschland</div>' +
        ticketCard({ name: 'DB-Tickets', zone: 'ICE · IC · RE · bundesweit', price: null, note: 'Spar- und Flexpreise für Fahrten mit der Deutschen Bahn. Muvit zeigt dir den aktuellen Bestpreis direkt bei deiner Verbindung.' }, { link: 'https://www.bahn.de/', linkText: 'Auf bahn.de buchen' }).replace('Preis laut marego', 'Preis je Verbindung') +
        '<div class="hint">' + icon('infoFill') + '<span>Alle Preise ohne Gewähr. Den aktuellen Tarif findest du in der <a href="https://www.marego-heimat.de/" target="_blank" rel="noopener">marego-Tarifauskunft</a>.</span></div>';
      bindAll(ctx.body, '[data-pick]', (b) => { const k = b.dataset.pick; UI.open('places', { title: k === 'from' ? 'Start' : 'Ziel', onPick: (pl) => { st[k] = pl; } }); });
      bindAll(ctx.body, '[data-calc]', async () => {
        const res = M.$('[data-res]', ctx.body);
        if (!st.to) { M.toast('Bitte ein Ziel wählen', { type: 'err' }); return; }
        const q = { from: st.from || M.MY_LOCATION, to: st.to, via: [], time: null, arriveBy: false };
        res.innerHTML = C.skel(2);
        try {
          const r = await runJourneys(q);
          if (!ctx.alive()) return;
          const j = r.list[0];
          if (!j) { res.innerHTML = C.empty('Keine Verbindung gefunden', ''); return; }
          const est = M.Tariffs.estimate(j);
          res.innerHTML = '<div style="margin-top:14px" class="hr"></div><div class="kv"><div class="k">' + esc(est.title) + '<small>' + esc(est.note) + '</small></div><div class="v">' + (est.price != null ? M.money(est.price) : '–') + '</div></div>' + C.jrow(j, 0) + '<div data-db></div>';
          bindAll(res, '.jrow', () => UI.open('journey', { j, query: q }));
          if (est.kind !== 'md' && est.kind !== 'walk') {
            const box = M.$('[data-db]', res);
            const a = await M.concretePlace(q.from), b = await M.concretePlace(q.to);
            M.Transit.dbPrice(a, b, null).then((p) => {
              if (!ctx.alive()) return;
              box.innerHTML = p ? '<div class="kv"><div class="k">Günstigster DB-Preis heute<small>Abfahrt ' + M.fmtTime(p.cheapest.dep) + ' · ' + M.fmtDur(p.cheapest.duration) + '</small></div><div class="v">' + M.money(p.cheapest.price.amount) + '</div></div>' : '';
            }).catch(() => {});
          }
        } catch (e) { res.innerHTML = ''; res.appendChild(C.error(e)); }
      });
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
      if (M.Map.map && (M.Map.map.getZoom() < 12.5 || M.Map.map.getZoom() > 15.2)) { const p = M.Geo.pos || M.Map.center(); M.Map.flyTo(p.lat, p.lon, 13.8); }
      ctx.body.innerHTML =
        '<div class="kv" style="border-top:0"><div class="k">Live-Fahrzeuge<small data-live>Straßenbahnen, Busse und Züge in Echtzeit</small></div><label class="sw"><input type="checkbox" data-sw="veh" checked><span></span></label></div>' +
        '<div class="kv"><div class="k">Haltestellen<small>„H“-Zeichen auf der Karte</small></div><label class="sw"><input type="checkbox" data-sw="stops"' + (M.Map.showStops ? ' checked' : '') + '><span></span></label></div>' +
        '<div class="lbl">Linien in der Umgebung</div><div data-list>' + C.skel(6) + '</div>';
      ctx.body.querySelectorAll('[data-sw]').forEach((i) => i.addEventListener('change', () => {
        if (i.dataset.sw === 'veh') { M.Map.setShowVehicles(i.checked); M.saveSettings({ showVehicles: i.checked }); }
        else { M.Map.setShowStops(i.checked); M.saveSettings({ showStops: i.checked }); }
      }));
      ctx.on('vehicles:update', (ev) => {
        const el = M.$('[data-live]', ctx.body);
        if (el && ev) el.textContent = ev.tooFar ? 'Zum Anzeigen näher heranzoomen' : (ev.list.length + ' Fahrzeuge live im Kartenausschnitt');
      });
      const box = M.$('[data-list]', ctx.body);
      function draw() {
        const L = st.lines || [];
        if (!L.length) { box.innerHTML = C.empty('Keine Linien gefunden', 'Bewege die Karte in ein anderes Gebiet.'); return; }
        let h = '', mode = null;
        L.forEach((x, i) => {
          if (x.line.mode !== mode) { mode = x.line.mode; h += '<div class="lbl" style="padding-top:16px">' + M.modeInfo(mode).label + '</div>'; }
          h += C.lrow({ cls: 'lines', lead: C.badges(x.line), title: esc(x.headsigns.slice(0, 2).join(' – ')), sub: 'Nächste Abfahrt ' + esc(C.countdown(x.next.time).toLowerCase()) + ' ab ' + esc(x.next.stop.name) }, i);
        });
        box.innerHTML = h;
        bindAll(box, '.lrow', (el) => { const x = L[+el.dataset.i]; UI.open('trip', { tripId: x.next.tripId, src: x.next.src, line: x.line }); });
      }
      async function load() {
        box.innerHTML = C.skel(6);
        try {
          const c = M.Map.center();
          st.lines = await M.Transit.linesNear(c.lat, c.lon);
          if (ctx.alive()) draw();
        } catch (e) { if (ctx.alive()) { box.innerHTML = ''; box.appendChild(C.error(e, load)); } }
      }
      if (st.lines) draw(); else load();
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
        '<div class="lbl">Fahrplandaten</div>' + seg('provider', [['motis', 'Transitous (Echtzeit)'], ['db', 'Deutsche Bahn']]) +
        '<div class="lbl" style="padding-top:4px">Umkreis „In der Nähe“</div>' + seg('radius', [[500, '500 m'], [900, '900 m'], [1500, '1,5 km']]) +
        '<div class="lbl">Privatsphäre</div>' +
        '<div class="kv"><div class="k">Verlauf löschen<small>Gesuchte Orte, Routen und Haltestellen</small></div><button class="btn-o" data-wipe>Löschen</button></div>' +
        '<div class="kv"><div class="k">Favoriten löschen<small>Gemerkte Haltestellen und Routen</small></div><button class="btn-o" data-wipefav>Löschen</button></div>' +
        '<div class="lbl">Über Muvit</div><div class="hint">' + icon('infoFill') + '<span>Fahrplan & Echtzeit: <a href="https://transitous.org" target="_blank" rel="noopener">Transitous</a> und <a href="https://v6.db.transport.rest" target="_blank" rel="noopener">db.transport.rest</a>. Karte: © OpenStreetMap-Mitwirkende, OpenFreeMap, MapLibre. Icons: <a href="https://www.flaticon.com/uicons" target="_blank" rel="noopener">Uicons by Flaticon</a>. Tarife ohne Gewähr.</span></div>';
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
      bindAll(ctx.body, '[data-wipe]', () => { ['recentPlaces', 'recentRoutes', 'recentStops', 'stopLines'].forEach((k) => M.store.del(k)); M.toast('Verlauf gelöscht'); });
      bindAll(ctx.body, '[data-wipefav]', () => { ['favStops', 'favRoutes'].forEach((k) => M.store.del(k)); M.toast('Favoriten gelöscht'); });
    }
  };
})(window.Muvit = window.Muvit || {});
