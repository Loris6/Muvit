/* Muvit – Ansichten im Sheet */
(function (M) {
  'use strict';

  const V = M.Views, C = M.C, UI = M.UI;
  const esc = M.esc, icon = M.icon;

  /* ---------------- Helfer ---------------- */
  function placeIcon(p) {
    if (M.isMe(p)) return '<span class="row-ico" style="background:var(--primary-soft);color:var(--primary)">' + icon('locate') + '</span>';
    if (p.type === 'stop') return '<span class="row-ico" style="background:transparent">' + M.hSignSVG(34) + '</span>';
    if (p.type === 'address') return '<span class="row-ico">' + icon('pin') + '</span>';
    if (p.type === 'coord') return '<span class="row-ico">' + icon('target') + '</span>';
    return '<span class="row-ico">' + icon('flag') + '</span>';
  }
  function distFromMe(p) {
    const me = M.Geo.pos;
    if (!me || p.lat == null) return '';
    return M.fmtDist(M.dist(me.lat, me.lon, p.lat, p.lon));
  }
  function placeRow(p, i, sub) {
    const typeLabel = p.type === 'stop' ? 'Haltestelle' : p.type === 'address' ? 'Adresse' : p.type === 'poi' ? 'Ort' : '';
    return '<button class="row fade-in" data-i="' + i + '">' + placeIcon(p) +
      '<div class="row-main"><div class="row-title">' + esc(p.name) + '</div><div class="row-sub">' + esc(sub != null ? sub : [typeLabel, p.area].filter(Boolean).join(' · ')) + '</div></div>' +
      '<div class="row-end">' + distFromMe(p) + '</div></button>';
  }
  function bindRows(root, list, fn) {
    root.querySelectorAll('[data-i]').forEach((b) => b.addEventListener('click', () => fn(list[+b.dataset.i], b)));
  }
  function timeLabel(time, arriveBy) {
    return (time ? (arriveBy ? 'Ankunft ' : 'Abfahrt ') + M.fmtDayTime(time) : 'Abfahrt jetzt');
  }
  function stopChooseHTML() {
    return '<div class="input-wrap" style="margin:2px 0 10px"><span class="i-left">' + icon('search') + '</span>' +
      '<input class="input" data-q placeholder="Haltestelle suchen …" autocomplete="off" enterkeyhint="search"></div><div data-res></div>';
  }
  async function nearestStop(place) {
    const list = await M.Transit.nearby(place.lat, place.lon, 600);
    return list[0] || null;
  }

  /* =====================================================================
     Ortssuche
     ===================================================================== */
  V.places = {
    title: 'Ort suchen', snap: 'full',
    render(ctx) {
      const p = ctx.params;
      ctx.head({ title: p.title || 'Ort suchen', sub: p.sub || '' });
      ctx.body.innerHTML =
        '<div class="input-wrap" style="margin:2px 0 12px"><span class="i-left">' + icon('search') + '</span>' +
        '<input class="input" id="plq" placeholder="Haltestelle, Adresse oder Ort" autocomplete="off" enterkeyhint="search">' +
        '<button class="i-right icon-btn flat" id="plx" hidden aria-label="Leeren">' + icon('close') + '</button></div><div id="plres"></div>';
      const input = M.$('#plq', ctx.body), res = M.$('#plres', ctx.body), clr = M.$('#plx', ctx.body);
      let results = [], token = 0;

      const pick = (place) => {
        M.recents.addPlace(place);
        ctx.back();
        if (p.onPick) p.onPick(place);
      };

      function renderDefault() {
        let html = '', list = [];
        if (p.allowMe !== false) { list.push(M.MY_LOCATION); html += placeRow(M.MY_LOCATION, list.length - 1, M.Geo.pos ? 'GPS · ±' + Math.round(M.Geo.pos.acc || 0) + ' m' : 'Gerätestandort verwenden'); }
        html += '<button class="row" data-map>' + '<span class="row-ico">' + icon('map') + '</span><div class="row-main"><div class="row-title">Auf der Karte wählen</div><div class="row-sub">Tippe auf einen Punkt der Karte</div></div></button>';
        const favs = M.favs.stops();
        if (favs.length) {
          html += '<div class="section-title">Favoriten</div><div class="list">';
          favs.slice(0, 5).forEach((f) => { list.push(f); html += placeRow(f, list.length - 1); });
          html += '</div>';
        }
        const rec = M.recents.places();
        if (rec.length) {
          html += '<div class="section-title">Zuletzt gesucht</div><div class="list">';
          rec.slice(0, 6).forEach((r) => { list.push(r); html += placeRow(r, list.length - 1); });
          html += '</div>';
        }
        html += '<div data-near></div>';
        res.innerHTML = '<div class="list">' + html + '</div>';
        bindRows(res, list, pick);
        M.$('[data-map]', res).addEventListener('click', async () => {
          ctx.setSnap('peek');
          ctx.cleanup(() => { M.Map._pick = null; });
          const pt = await M.Map.pickPoint();
          if (!ctx.alive()) return;
          const place = { id: pt.lat.toFixed(6) + ',' + pt.lon.toFixed(6), name: 'Markierter Ort', lat: pt.lat, lon: pt.lon, type: 'coord', src: 'device' };
          try { const r = await M.Transit.reverse(pt.lat, pt.lon); if (r[0]) place.name = r[0].name; } catch (e) { /* Koordinaten genügen */ }
          pick(place);
        });
        if (M.Geo.pos) {
          M.Transit.nearby(M.Geo.pos.lat, M.Geo.pos.lon, 700).then((near) => {
            if (!ctx.alive() || input.value.trim()) return;
            const box = M.$('[data-near]', res); if (!box || !near.length) return;
            const nl = near.slice(0, 5);
            box.innerHTML = '<div class="section-title">In der Nähe</div><div class="list">' + nl.map((s, i) => placeRow(s, i, M.fmtDist(s.distance) + ' · ' + s.walk + ' Min zu Fuß')).join('') + '</div>';
            bindRows(box, nl, pick);
          }).catch(() => {});
        }
      }

      const search = M.debounce(async () => {
        const q = input.value.trim();
        clr.hidden = !q;
        if (q.length < 2) { renderDefault(); return; }
        const my = ++token;
        res.innerHTML = C.skeleton('row', 5);
        try {
          const near = M.Geo.pos || M.Map.center();
          let r = await M.Transit.search(q, near);
          if (my !== token || !ctx.alive()) return;
          if (p.stopsFirst) r = r.slice().sort((a, b) => (b.type === 'stop') - (a.type === 'stop'));
          results = r;
          res.innerHTML = r.length ? '<div class="list">' + r.map((x, i) => placeRow(x, i)).join('') + '</div>' :
            C.empty('search', 'Nichts gefunden', 'Versuche es mit einem anderen Namen oder einer Adresse.');
          bindRows(res, r, pick);
        } catch (e) {
          if (my !== token) return;
          res.innerHTML = ''; res.appendChild(C.error(e, search));
        }
      }, 220);

      input.addEventListener('input', search);
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && results[0]) pick(results[0]); });
      clr.addEventListener('click', () => { input.value = ''; search(); input.focus(); });
      if (p.initial) { input.value = p.initial; search(); } else renderDefault();
      setTimeout(() => { if (ctx.alive()) input.focus({ preventScroll: true }); }, 380);
    }
  };

  /* =====================================================================
     Zeitwahl
     ===================================================================== */
  V.time = {
    title: 'Wann möchtest du fahren?', snap: 'half',
    render(ctx) {
      let arriveBy = M.state.arriveBy;
      const t0 = M.state.time || new Date();
      const iso = M.toLocalInput(t0);
      ctx.head({ title: 'Wann möchtest du fahren?' });
      ctx.body.innerHTML =
        '<div class="seg" style="margin-bottom:12px"><button data-ab="0">Abfahrt</button><button data-ab="1">Ankunft</button></div>' +
        '<div class="dt-row"><input class="input" type="date" id="tdDate" value="' + iso.slice(0, 10) + '"><input class="input" type="time" id="tdTime" value="' + iso.slice(11, 16) + '"></div>' +
        '<div class="time-quick">' +
          '<button class="chip" data-q="0">Jetzt</button><button class="chip" data-q="15">+15 Min</button><button class="chip" data-q="30">+30 Min</button>' +
          '<button class="chip" data-q="60">+1 Std</button><button class="chip" data-q="m7">Morgen 7:00</button><button class="chip" data-q="m17">Morgen 17:00</button>' +
        '</div>' +
        '<div class="btn-row"><button class="btn" data-now>Jetzt fahren</button><button class="btn primary" data-ok>Übernehmen</button></div>';
      const segBtns = ctx.body.querySelectorAll('[data-ab]');
      const syncSeg = () => segBtns.forEach((b) => b.classList.toggle('on', (b.dataset.ab === '1') === arriveBy));
      syncSeg();
      segBtns.forEach((b) => b.addEventListener('click', () => { arriveBy = b.dataset.ab === '1'; syncSeg(); }));
      const dI = M.$('#tdDate', ctx.body), tI = M.$('#tdTime', ctx.body);
      const setDate = (d) => { const v = M.toLocalInput(d); dI.value = v.slice(0, 10); tI.value = v.slice(11, 16); };
      ctx.body.querySelectorAll('[data-q]').forEach((b) => b.addEventListener('click', () => {
        const q = b.dataset.q;
        if (q[0] === 'm') {
          const p = M.berlinParts(new Date(Date.now() + 864e5));
          setDate(M.fromBerlin(p.y, p.mo, p.d, +q.slice(1), 0));
        } else setDate(new Date(Date.now() + +q * 60000));
      }));
      const done = (time) => {
        M.state.time = time; M.state.arriveBy = time ? arriveBy : false;
        M.emit('state');
        ctx.back();
        if (ctx.params.onApply) ctx.params.onApply();
      };
      M.$('[data-now]', ctx.body).addEventListener('click', () => done(null));
      M.$('[data-ok]', ctx.body).addEventListener('click', () => {
        const [y, mo, d] = dI.value.split('-').map(Number);
        const [h, mi] = tI.value.split(':').map(Number);
        if (!y || isNaN(h)) { M.toast('Bitte Datum und Uhrzeit wählen', { type: 'err' }); return; }
        const t = M.fromBerlin(y, mo, d, h, mi);
        done(Math.abs(t - Date.now()) < 60000 && !arriveBy ? null : t);
      });
    }
  };

  /* =====================================================================
     Zwischenhalte (A → C → B mit Aufenthalt)
     ===================================================================== */
  V.via = {
    title: 'Zwischenhalte', snap: 'half',
    render(ctx) {
      ctx.head({ title: 'Zwischenhalte', sub: 'Von A nach B über C – mit Aufenthalt' });
      const draw = () => {
        const vias = M.state.via;
        let html = '<div class="note">' + icon('info') + '<div>Bis zu 2 Zwischenhalte. Die Aufenthaltsdauer ist die Mindestzeit, die du dort verbringst, bevor es weitergeht.</div></div>';
        vias.forEach((v, i) => {
          html += '<div class="via-item">' + M.hSignSVG(30) + '<span class="vi-name">' + esc(v.place.name) + '</span>' +
            '<span class="stepper"><button data-m="' + i + '" aria-label="weniger">' + icon('minus') + '</button><b>' + (v.stay ? M.fmtDur(v.stay) : 'kein Halt') + '</b><button data-p="' + i + '" aria-label="mehr">' + icon('plus') + '</button></span>' +
            '<button class="icon-btn flat" data-del="' + i + '" aria-label="Entfernen">' + icon('trash') + '</button></div>';
        });
        if (vias.length < 2) html += '<button class="btn soft block" data-add>' + icon('plus') + 'Zwischenhalt hinzufügen</button>';
        html += '<div class="btn-row"><button class="btn primary" data-done>Fertig</button></div>';
        ctx.body.innerHTML = html;
        const step = (i, d) => { const v = vias[i]; v.stay = Math.max(0, Math.min(480, (v.stay || 0) + d)); M.emit('state'); draw(); };
        ctx.body.querySelectorAll('[data-m]').forEach((b) => b.addEventListener('click', () => step(+b.dataset.m, (vias[+b.dataset.m].stay || 0) > 30 ? -15 : -5)));
        ctx.body.querySelectorAll('[data-p]').forEach((b) => b.addEventListener('click', () => step(+b.dataset.p, (vias[+b.dataset.p].stay || 0) >= 30 ? 15 : 5)));
        ctx.body.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => { vias.splice(+b.dataset.del, 1); M.emit('state'); draw(); }));
        const add = M.$('[data-add]', ctx.body);
        if (add) add.addEventListener('click', () => UI.open('places', {
          title: 'Zwischenhalt wählen', sub: 'Am besten eine Haltestelle', allowMe: false, stopsFirst: true,
          onPick: async (place) => {
            let stop = place;
            if (place.type !== 'stop' || place.src !== 'motis') {
              try { stop = await nearestStop(place); } catch (e) { stop = null; }
              if (!stop) { M.toast('Keine Haltestelle in der Nähe dieses Ortes gefunden', { type: 'err' }); return; }
              if (stop.name !== place.name) M.toast('Zwischenhalt: nächste Haltestelle „' + stop.name + '“');
            }
            M.state.via.push({ place: stop, stay: 15 });
            M.emit('state');
          }
        }));
        M.$('[data-done]', ctx.body).addEventListener('click', () => { ctx.back(); if (ctx.params.onApply) ctx.params.onApply(); });
      };
      ctx.on('state', () => { if (ctx.alive()) draw(); });
      draw();
    }
  };

  /* =====================================================================
     Verbindungen
     ===================================================================== */
  function viaLabel(via) {
    if (!via || !via.length) return '';
    return 'über ' + via.map((v) => v.place.name + (v.stay ? ' (' + M.fmtDur(v.stay) + ')' : '')).join(', ');
  }
  function queryFromState() {
    return {
      from: M.state.from, to: M.state.to, via: M.state.via.map((v) => ({ place: v.place, stay: v.stay })),
      time: M.state.time, arriveBy: M.state.arriveBy, dticket: !!M.state.dticket
    };
  }
  M.queryFromState = queryFromState;

  function pillFor(ctx, q) {
    UI.setPill(UI.routePillHTML(q.from, q.to, esc(timeLabel(q.time, q.arriveBy)) + (q.via.length ? ' · ' + esc(viaLabel(q.via)) : '')), () => UI.home());
  }

  async function runJourneys(q, cursor) {
    const from = await M.concretePlace(q.from);
    const to = await M.concretePlace(q.to);
    return M.Transit.journeys({
      from, to, via: q.via, time: q.time, arriveBy: q.arriveBy, cursor,
      modes: q.dticket ? ['tram', 'bus', 'sbahn', 'ubahn', 'regio', 'ferry'] : null
    });
  }
  M.runJourneys = runJourneys;

  function badgeFor(list) {
    const b = {};
    if (list.length < 2) return b;
    const fastest = list.reduce((a, x) => (x.duration < a.duration ? x : a), list[0]);
    b[fastest.id] = 'Schnellste';
    const minT = Math.min.apply(null, list.map((x) => x.transfers));
    const fewest = list.find((x) => x.transfers === minT && x !== fastest && x.transfers < fastest.transfers);
    if (fewest) b[fewest.id] = 'Wenigste Umstiege';
    return b;
  }

  V.journeys = {
    title: 'Verbindungen', snap: 'half',
    render(ctx) {
      const q = ctx.params.query;
      const st = ctx.state;
      pillFor(ctx, q);
      const fav = () => M.favs.hasRoute(q.from, q.to);
      const head = () => ctx.head({
        title: 'Verbindungen', sub: esc(timeLabel(q.time, q.arriveBy)) + (q.via.length ? ' · ' + esc(viaLabel(q.via)) : ''),
        actions: [
          { icon: 'star', label: 'Route merken', on: fav(), onClick: () => { const on = M.favs.toggleRoute(q.from, q.to); M.toast(on ? 'Route gemerkt' : 'Route entfernt', { type: 'ok' }); head(); } },
          { icon: 'refresh', label: 'Aktualisieren', onClick: () => load(true) }
        ]
      });
      head();
      ctx.body.innerHTML =
        '<div class="filters">' +
          '<button class="chip solid" data-time>' + icon('clock') + esc(q.time ? M.fmtDayTime(q.time) : 'Jetzt') + '</button>' +
          '<button class="chip solid' + (q.via.length ? ' on' : '') + '" data-via>' + icon('route') + (q.via.length ? q.via.length + ' Zwischenhalt' + (q.via.length > 1 ? 'e' : '') : 'Zwischenhalt') + '</button>' +
          '<button class="chip solid' + (q.dticket ? ' on' : '') + '" data-dt>' + icon('ticket') + 'Deutschlandticket</button>' +
        '</div><div id="jl"></div>';
      const list = M.$('#jl', ctx.body);

      M.$('[data-time]', ctx.body).addEventListener('click', () => UI.open('time', { onApply: () => { q.time = M.state.time; q.arriveBy = M.state.arriveBy; st.list = null; UI.refresh(); } }));
      M.$('[data-via]', ctx.body).addEventListener('click', () => UI.open('via', { onApply: () => { q.via = M.state.via.map((v) => ({ place: v.place, stay: v.stay })); st.list = null; UI.refresh(); } }));
      M.$('[data-dt]', ctx.body).addEventListener('click', () => { q.dticket = M.state.dticket = !q.dticket; st.list = null; UI.refresh(); });

      function draw() {
        const items = st.list || [];
        if (!items.length && !(st.direct && st.direct.length)) {
          list.innerHTML = C.empty('route', 'Keine Verbindung gefunden', 'Probiere eine andere Uhrzeit, entferne Zwischenhalte oder wähle eine nahe Haltestelle.');
          return;
        }
        const badges = badgeFor(items);
        let html = st.prev ? '<div class="more-btns"><button class="btn sm" data-earlier>' + icon('back') + 'Früher</button></div>' : '';
        html += items.map((j, i) => C.journeyCard(j, i, { badge: badges[j.id], sel: st.sel === i })).join('');
        if (st.direct && st.direct[0] && st.direct[0].duration <= 45) {
          html += '<div class="section-title">Zu Fuß</div>' + C.journeyCard(st.direct[0], 'w');
        }
        html += st.next ? '<div class="more-btns"><button class="btn sm" data-later>Später' + icon('right') + '</button></div>' : '';
        html += '<div class="updated">' + icon('live') + 'Echtzeitdaten · ' + esc(st.source || 'Transitous') + ' · ' + M.fmtTime(new Date()) + '</div>';
        list.innerHTML = html;
        list.querySelectorAll('.jc').forEach((b) => {
          const j = b.dataset.idx === 'w' ? st.direct[0] : items[+b.dataset.idx];
          b.addEventListener('click', () => { st.sel = +b.dataset.idx; UI.open('journey', { j, query: q }); });
          b.addEventListener('mouseenter', () => M.Map.drawJourney(j, { fit: false }));
        });
        const e = M.$('[data-earlier]', list), l = M.$('[data-later]', list);
        if (e) e.addEventListener('click', () => page('prev'));
        if (l) l.addEventListener('click', () => page('next'));
        const first = items[st.sel != null && items[st.sel] ? st.sel : 0] || (st.direct && st.direct[0]);
        if (first) M.Map.drawJourney(first);
      }

      async function load(force) {
        if (st.list && !force) { draw(); return; }
        if (!st.list) list.innerHTML = C.skeleton('card', 4);
        try {
          const res = await runJourneys(q);
          if (!ctx.alive()) return;
          st.list = res.list; st.direct = res.direct; st.next = res.next; st.prev = res.prev;
          st.source = res.fallback || M.Transit.lastSource;
          if (res.fallback) M.toast('Transitous nicht erreichbar – Daten von ' + res.fallback);
          M.recents.addRoute(q.from, q.to);
          draw();
        } catch (e) {
          if (!ctx.alive()) return;
          list.innerHTML = ''; list.appendChild(C.error(e, () => load(true)));
        }
      }
      async function page(dir) {
        const btn = M.$(dir === 'next' ? '[data-later]' : '[data-earlier]', list);
        if (btn) { btn.disabled = true; btn.innerHTML = '…'; }
        try {
          const res = await runJourneys(q, dir === 'next' ? st.next : st.prev);
          if (!ctx.alive()) return;
          const seen = new Set(st.list.map((j) => j.id));
          const add = res.list.filter((j) => !seen.has(j.id));
          if (dir === 'next') { st.list = st.list.concat(add); st.next = res.next; } else { st.list = add.concat(st.list); st.prev = res.prev; if (st.sel != null) st.sel += add.length; }
          draw();
        } catch (e) { M.toast(e.message, { type: 'err' }); draw(); }
      }
      ctx.every(60000, () => { if (!st.paged) load(true); });
      load(false);
    }
  };

  /* =====================================================================
     Verbindungsdetail – Hero + Zeitstrahl
     ===================================================================== */
  function nodeRow(o) {
    // o: { time, planned, delay, rt, cancelled, name, meta, inStyle, outStyle, cIn, cOut, node, stopData }
    const rail = (cls, style, c) => style === 'none' ? '' : '<i class="' + cls + (style === 'dot' ? ' dot' : '') + '" style="--c:' + (c || 'var(--primary)') + '"></i>';
    return '<div class="tl-row stop">' +
      '<div class="tl-time">' + (o.time || o.planned ? C.time(o.time, o.planned, o.delay, o.rt, o.cancelled) : '') + '</div>' +
      '<div class="tl-rail">' + rail('in', o.inStyle, o.cIn) + rail('out', o.outStyle, o.cOut) + '<span class="tl-node ' + (o.node || '') + '" style="--c:' + (o.cNode || o.cOut || o.cIn || 'var(--primary)') + '"></span></div>' +
      '<div class="tl-content"><div class="tl-stop"' + (o.stopIdx != null ? ' data-stop="' + o.stopIdx + '"' : '') + '>' + esc(o.name) + '</div>' + (o.meta ? '<div class="tl-meta">' + o.meta + '</div>' : '') + '</div></div>';
  }
  function railRow(style, c, content) {
    return '<div class="tl-row"><div></div><div class="tl-rail"><i class="full' + (style === 'dot' ? ' dot' : '') + '" style="--c:' + (c || 'var(--primary)') + '"></i></div><div class="tl-content">' + content + '</div></div>';
  }
  function timelineHTML(j) {
    const legs = j.legs;
    const stopRefs = [];
    const ref = (s) => { stopRefs.push(s); return stopRefs.length - 1; };
    let h = '<div class="tl">';
    legs.forEach((l, i) => {
      const prev = legs[i - 1], next = legs[i + 1];
      if (l.walk) {
        if (i === 0) h += nodeRow({ time: l.from.time, planned: l.from.planned, name: l.from.name, inStyle: 'none', outStyle: 'dot', node: 'origin' });
        const prevT = prev && !prev.walk ? prev : null, nextT = next && !next.walk ? next : null;
        let txt = icon('walk') + '<span>' + Math.max(1, Math.round(l.duration)) + ' Min Fußweg' + (l.distance ? ' · ' + M.fmtDist(l.distance) : '') + '</span>';
        if (prevT && nextT) {
          const tt = M.delayMin(nextT.from.time, prevT.to.time);
          txt = transferChip(tt, Math.round(l.duration)) + '<span>' + Math.max(1, Math.round(l.duration)) + ' Min zu Fuß' + (l.distance ? ' · ' + M.fmtDist(l.distance) : '') + '</span>';
        }
        h += railRow('dot', null, '<div class="tl-walk">' + txt + '</div>');
        if (i === legs.length - 1) h += nodeRow({ time: l.to.time, planned: l.to.planned, name: l.to.name, inStyle: 'dot', outStyle: 'none', node: 'end' });
        return;
      }
      const c = l.line.color, mi = M.modeInfo(l.line.mode);
      if (prev && !prev.walk) {
        const tt = M.delayMin(l.from.time, prev.to.time);
        h += railRow('dot', null, transferChip(tt, 0) + (prev.to.platform && l.from.platform && prev.to.platform !== l.from.platform ? ' <span class="plat">Gl. ' + esc(prev.to.platform) + ' → ' + esc(l.from.platform) + '</span>' : ''));
      }
      h += nodeRow({
        time: l.from.time, planned: l.from.planned, delay: l.from.delay, rt: l.realtime, cancelled: l.cancelled,
        name: l.from.name, stopIdx: ref(l.from),
        meta: C.platform(l.from.platform, l.from.plannedPlatform) + C.rtPill(l.from.delay, l.realtime, l.cancelled),
        inStyle: prev && prev.walk ? 'dot' : 'none', outStyle: 'solid', cOut: c
      });
      const nStops = l.stops.length;
      h += railRow('solid', c,
        '<div class="tl-ride"><div class="dir">' + C.lineBadge(l.line, { lg: true }) + '<span>→ <b>' + esc(l.headsign || l.to.name) + '</b></span></div>' +
        '<div class="sub">' + esc(mi.label) + (l.line.agency ? ' · ' + esc(l.line.agency) : '') + ' · ' + (nStops + 1) + (nStops ? ' Halte' : ' Halt') + ' · ' + M.fmtDur(l.duration) + '</div>' +
        '<div class="tl-links">' +
          (nStops ? '<button class="tl-toggle" data-tog>' + nStops + ' Zwischenhalt' + (nStops > 1 ? 'e' : '') + icon('down') + '</button>' : '') +
          (l.tripId ? '<button class="tl-toggle" data-trip="' + i + '">' + icon('live') + 'Linienverlauf</button>' : '') +
        '</div>' +
        (nStops ? '<ul class="tl-inter">' + l.stops.map((s) => '<li><span>' + esc(s.name) + '</span><span>' + C.time(s.dep || s.arr, s.depPlanned || s.arrPlanned, M.delayMin(s.dep || s.arr, s.depPlanned || s.arrPlanned), l.realtime, s.cancelled) + '</span></li>').join('') + '</ul>' : '') +
        '</div>' + C.alerts(l.alerts));
      const last = i === legs.length - 1;
      h += nodeRow({
        time: l.to.time, planned: l.to.planned, delay: l.to.delay, rt: l.realtime, cancelled: l.cancelled,
        name: l.to.name, stopIdx: ref(l.to), meta: C.platform(l.to.platform, l.to.plannedPlatform),
        inStyle: 'solid', cIn: c, outStyle: last ? 'none' : 'dot', node: last ? 'end' : '', cNode: c
      });
    });
    return { html: h + '</div>', stopRefs };
  }
  function transferChip(mins, walkMin) {
    if (mins == null || isNaN(mins)) return '';
    const buffer = mins - (walkMin || 0);
    const cls = buffer < 2 ? 'critical' : buffer < 5 ? 'tight' : '';
    return '<span class="tl-transfer ' + cls + '">' + icon('transfer') + 'Umstieg ' + mins + ' Min' + (cls === 'critical' ? ' – knapp!' : '') + '</span>';
  }

  V.journey = {
    title: 'Deine Verbindung', snap: 'half',
    render(ctx) {
      const st = ctx.state;
      st.j = st.j || ctx.params.j;
      const q = ctx.params.query;
      if (q) pillFor(ctx, q);

      function draw() {
        const j = st.j;
        const first = j.legs[0].from, last = j.legs[j.legs.length - 1].to;
        const firstT = j.legs.find((l) => !l.walk);
        const walkMin = Math.round(j.legs.filter((l) => l.walk).reduce((s, l) => s + l.duration, 0));
        const lines = j.legs.filter((l) => !l.walk).map((l) => C.lineBadge(l.line)).join(' ');
        const favOn = q && M.favs.hasRoute(q.from, q.to);
        ctx.head({
          title: 'Deine Verbindung',
          sub: (j.transfers ? j.transfers + (j.transfers === 1 ? ' Umstieg' : ' Umstiege') : 'Ohne Umstieg') + ' · ' + M.fmtDur(j.duration),
          actions: [{ icon: 'refresh', label: 'Echtzeit aktualisieren', onClick: () => refresh(true) }]
        });
        const mins = M.minsUntil(first.time);
        const tl = timelineHTML(j);
        const est = M.Tariffs.estimate(j);
        ctx.body.innerHTML =
          '<div class="hero fade-in"><div class="hero-row">' +
            '<div class="hero-col"><div class="ht">' + M.fmtTime(first.time) + '</div><div class="hn">' + esc(first.name) + '</div></div>' +
            '<div class="hmid"><span>' + M.fmtDur(j.duration) + '</span><span class="line"></span><span>' + (j.transfers ? j.transfers + '× umsteigen' : 'direkt') + '</span></div>' +
            '<div class="hero-col r"><div class="ht">' + M.fmtTime(last.time) + '</div><div class="hn">' + esc(last.name) + '</div></div>' +
          '</div><div class="hero-stats">' +
            (mins >= 0 ? '<span>' + icon('clock') + (mins === 0 ? 'Jetzt los!' : 'Los in ' + M.fmtDur(mins)) + '</span>' : '<span>' + icon('clock') + 'Unterwegs</span>') +
            (walkMin ? '<span>' + icon('walk') + walkMin + ' Min zu Fuß</span>' : '') +
            '<span>' + icon('live') + (j.realtime ? 'Echtzeit' : 'Fahrplan') + '</span>' +
            (firstT && firstT.from.delay > 0 ? '<span>' + icon('alert') + '+' + firstT.from.delay + ' Min</span>' : '') +
          '</div></div>' +
          '<div class="actions">' +
            '<button class="action" data-a="live">' + icon('refresh') + 'Aktualisieren</button>' +
            '<button class="action' + (favOn ? ' on' : '') + '" data-a="fav">' + icon('star') + (favOn ? 'Gemerkt' : 'Merken') + '</button>' +
            '<button class="action" data-a="share">' + icon('share') + 'Teilen</button>' +
            '<button class="action" data-a="ai">' + icon('sparkles') + 'Fragen</button>' +
          '</div>' +
          (j.cancelled ? '<div class="note alert">' + icon('alert') + '<div><b>Achtung:</b> Teile dieser Verbindung fallen aus. Bitte suche eine Alternative.</div></div>' : '') +
          tl.html +
          '<div class="section-title">Ticket & Preis</div>' +
          '<div class="price-box"><span class="pb-ico">' + icon('ticket') + '</span><div class="pb-main"><div class="pb-title">' + esc(est.title) + '</div><div class="pb-sub">' + esc(est.note) + '</div></div>' +
            '<div class="pb-val">' + (est.price != null ? M.money(est.price) : '–') + '</div></div>' +
          (est.kind === 'db' || est.kind === 'verbund' ? '<button class="btn soft block" data-price>' + icon('euro') + 'DB-Preis live abfragen</button><div data-pres></div>' : '') +
          '<div class="updated">' + lines + '</div>' +
          '<div class="updated">' + icon('info') + 'Quelle: ' + (j.src === 'db' ? 'Deutsche Bahn' : 'Transitous (Echtzeit)') + ' · Stand ' + M.fmtTime(st.updated || new Date()) + '</div>';

        ctx.body.querySelectorAll('[data-tog]').forEach((b) => b.addEventListener('click', () => {
          b.classList.toggle('open');
          const ul = b.closest('.tl-ride').querySelector('.tl-inter'); if (ul) ul.classList.toggle('open');
        }));
        ctx.body.querySelectorAll('[data-trip]').forEach((b) => b.addEventListener('click', () => {
          const l = j.legs[+b.dataset.trip];
          UI.open('trip', { tripId: l.tripId, src: j.src, line: l.line, focusStop: l.from.name });
        }));
        ctx.body.querySelectorAll('[data-stop]').forEach((b) => b.addEventListener('click', () => {
          const s = tl.stopRefs[+b.dataset.stop];
          M.Map.flyTo(s.lat, s.lon, 17);
        }));
        ctx.body.querySelectorAll('[data-a]').forEach((b) => b.addEventListener('click', () => action(b.dataset.a)));
        const pb = M.$('[data-price]', ctx.body);
        if (pb) pb.addEventListener('click', () => dbPrice(pb));
      }

      async function dbPrice(btn) {
        btn.disabled = true; btn.innerHTML = icon('refresh') + 'Frage DB-Preise ab …';
        const box = M.$('[data-pres]', ctx.body);
        try {
          const j = st.j;
          const a = j.legs[0].from, b = j.legs[j.legs.length - 1].to;
          const r = await M.Transit.dbPrice(
            { name: a.name, lat: a.lat, lon: a.lon, type: 'coord' }, { name: b.name, lat: b.lat, lon: b.lon, type: 'coord' }, j.dep);
          if (!ctx.alive()) return;
          btn.remove();
          box.innerHTML = r ? '<div class="price-box"><span class="pb-ico" style="background:var(--g-dep)">' + icon('euro') + '</span><div class="pb-main"><div class="pb-title">Günstigster DB-Preis</div><div class="pb-sub">Abfahrt ' + M.fmtTime(r.cheapest.dep) + ' · ' + M.fmtDur(r.cheapest.duration) + (r.cheapest.price.hint ? ' · ' + esc(r.cheapest.price.hint) : '') + '</div></div><div class="pb-val">' + M.money(r.cheapest.price.amount, r.cheapest.price.currency) + '</div></div>'
            : '<div class="note">' + icon('info') + '<div>Für diese Strecke liefert die DB keinen Online-Preis (z. B. reiner Verbundtarif). Infos: <a href="https://www.marego-heimat.de/" target="_blank" rel="noopener">marego</a></div></div>';
        } catch (e) {
          btn.disabled = false; btn.innerHTML = icon('euro') + 'Erneut versuchen';
          box.innerHTML = '<div class="note warn">' + icon('alert') + '<div>DB-Preisauskunft gerade nicht erreichbar: ' + esc(e.message) + '</div></div>';
        }
      }

      function action(a) {
        const j = st.j;
        if (a === 'live') refresh(true);
        else if (a === 'fav' && q) { const on = M.favs.toggleRoute(q.from, q.to); M.toast(on ? 'Route gemerkt' : 'Route entfernt', { type: 'ok' }); draw(); }
        else if (a === 'share') {
          const a0 = j.legs[0].from, b0 = j.legs[j.legs.length - 1].to;
          const text = 'Muvit · ' + a0.name + ' → ' + b0.name + '\n' + M.fmtDayTime(a0.time) + ' – ' + M.fmtTime(b0.time) + ' (' + M.fmtDur(j.duration) + ')\n' +
            j.legs.filter((l) => !l.walk).map((l) => '• ' + M.fmtTime(l.from.time) + ' ' + l.line.full + ' → ' + l.headsign + ' ab ' + l.from.name + (l.from.platform ? ' (Gl. ' + l.from.platform + ')' : '')).join('\n');
          if (navigator.share) navigator.share({ title: 'Meine Verbindung', text }).catch(() => {});
          else if (navigator.clipboard) navigator.clipboard.writeText(text).then(() => M.toast('Verbindung kopiert', { type: 'ok' }));
        } else if (a === 'ai') {
          const a0 = j.legs[0].from, b0 = j.legs[j.legs.length - 1].to;
          UI.open('assistant', { prompt: 'Erkläre mir diese Verbindung von ' + a0.name + ' nach ' + b0.name + ' um ' + M.fmtTime(a0.time) + ' Uhr und was das Ticket kostet.' });
        }
      }

      async function refresh(manual) {
        if (!q) return;
        try {
          const j = st.j;
          const t = new Date((j.depPlanned || j.dep).getTime() - 60000);
          const res = await runJourneys(Object.assign({}, q, { time: t, arriveBy: false }));
          if (!ctx.alive()) return;
          const key = (x) => x.legs.filter((l) => !l.walk).map((l) => l.tripId || l.line.name).join('|');
          const match = res.list.find((x) => x.id === j.id) || res.list.find((x) => key(x) === key(j));
          if (match) { st.j = match; st.updated = new Date(); draw(); M.Map.drawJourney(match, { fit: false }); if (manual) M.toast('Echtzeitdaten aktualisiert', { type: 'ok' }); }
          else if (manual) M.toast('Verbindung nicht mehr im Fahrplan gefunden', { type: 'err' });
        } catch (e) { if (manual) M.toast(e.message, { type: 'err' }); }
      }

      draw();
      M.Map.drawJourney(st.j);
      ctx.every(45000, () => refresh(false));
    }
  };

  /* =====================================================================
     Abfahrten (Echtzeit-Tafel)
     ===================================================================== */
  function stopChooser(ctx, onPick) {
    ctx.head({ title: 'Abfahrten', sub: 'Haltestelle wählen' });
    ctx.body.innerHTML = stopChooseHTML();
    const input = M.$('[data-q]', ctx.body), res = M.$('[data-res]', ctx.body);
    let current = [];
    const renderList = (sections) => {
      current = [];
      res.innerHTML = sections.map((s) => s.items.length ? '<div class="section-title">' + esc(s.title) + '</div><div class="list">' +
        s.items.map((p) => { current.push(p); return placeRow(p, current.length - 1, s.sub ? s.sub(p) : undefined); }).join('') + '</div>' : '').join('');
      bindRows(res, current, onPick);
    };
    const defaults = async () => {
      const secs = [{ title: 'Favoriten', items: M.favs.stops().slice(0, 6) }];
      renderList(secs.concat([{ title: 'In der Nähe', items: [] }]));
      if (M.Geo.pos || M.Geo.status !== 'denied') {
        res.insertAdjacentHTML('beforeend', C.skeleton('row', 3));
        try {
          const pos = await M.Geo.get(8000);
          const near = await M.Transit.nearby(pos.lat, pos.lon, 800);
          if (!ctx.alive() || input.value.trim()) return;
          renderList(secs.concat([{ title: 'In der Nähe', items: near.slice(0, 8), sub: (s) => M.fmtDist(s.distance) + ' · ' + s.walk + ' Min zu Fuß' }]));
        } catch (e) { if (ctx.alive() && !input.value.trim()) renderList(secs); }
      }
    };
    const search = M.debounce(async () => {
      const q = input.value.trim();
      if (q.length < 2) { defaults(); return; }
      res.innerHTML = C.skeleton('row', 4);
      try {
        const r = await M.Transit.search(q, M.Geo.pos || M.Map.center());
        if (!ctx.alive()) return;
        const stops = r.filter((x) => x.type === 'stop');
        renderList([{ title: 'Haltestellen', items: stops.length ? stops : r }]);
        if (!stops.length && !r.length) res.innerHTML = C.empty('search', 'Keine Haltestelle gefunden', '');
      } catch (e) { res.innerHTML = ''; res.appendChild(C.error(e, search)); }
    }, 220);
    input.addEventListener('input', search);
    defaults();
  }

  V.departures = {
    title: 'Abfahrten', snap: 'half',
    render(ctx) {
      const st = ctx.state;
      const stop = ctx.params.stop;
      if (!stop) {
        stopChooser(ctx, async (p) => {
          let s = p;
          if (p.type !== 'stop') { try { s = await nearestStop(p); } catch (e) { s = null; } }
          if (!s) { M.toast('Keine Haltestelle gefunden', { type: 'err' }); return; }
          UI.open('departures', { stop: s }, { replace: true });
        });
        return;
      }
      st.filter = st.filter || 'all';
      const head = () => ctx.head({
        title: stop.name, sub: 'Abfahrten in Echtzeit' + (M.Geo.pos ? ' · ' + distFromMe(stop) + ' entfernt' : ''),
        actions: [
          { icon: 'star', label: 'Favorit', on: M.favs.hasStop(stop), onClick: () => { const on = M.favs.toggleStop(stop); M.toast(on ? 'Haltestelle gemerkt' : 'Favorit entfernt', { type: 'ok' }); head(); } },
          { icon: 'route', label: 'Route hierher', onClick: () => { M.state.to = stop; M.emit('state'); UI.home(); M.App.search(); } }
        ]
      });
      head();
      M.Map.addStops([{ id: stop.id, name: stop.name, lat: stop.lat, lon: stop.lon, src: stop.src }]);
      M.Map.flyTo(stop.lat, stop.lon, 16.3);
      ctx.body.innerHTML = '<div class="filters" data-f></div><div data-alerts></div><div class="list" data-list>' + C.skeleton('row', 6) + '</div><div data-more></div>';
      const fBox = M.$('[data-f]', ctx.body), listBox = M.$('[data-list]', ctx.body), moreBox = M.$('[data-more]', ctx.body);

      function draw() {
        const all = st.list || [];
        const modes = Array.from(new Set(all.map((x) => x.line.mode)));
        fBox.innerHTML = modes.length > 1 ? ['all'].concat(modes).map((m) => '<button class="chip solid' + (st.filter === m ? ' on' : '') + '" data-m="' + m + '">' +
          (m === 'all' ? 'Alle' : icon(M.modeInfo(m).icon) + M.modeInfo(m).label) + '</button>').join('') : '';
        fBox.querySelectorAll('[data-m]').forEach((b) => b.addEventListener('click', () => { st.filter = b.dataset.m; draw(); }));
        const shown = all.filter((x) => st.filter === 'all' || x.line.mode === st.filter).filter((x) => M.minsUntil(x.time) > -2);
        M.$('[data-alerts]', ctx.body).innerHTML = C.alerts(st.alerts);
        listBox.innerHTML = shown.length ? shown.map((x, i) => C.depRow(x, i)).join('') : C.empty('board', 'Keine Abfahrten', 'In nächster Zeit fährt hier nichts ab.');
        listBox.querySelectorAll('.dep').forEach((b) => b.addEventListener('click', () => {
          const x = shown[+b.dataset.idx];
          UI.open('trip', { tripId: x.tripId, src: x.src, line: x.line, focusStop: stop.name });
        }));
        moreBox.innerHTML = all.length ? '<div class="more-btns"><button class="btn sm" data-later>Spätere Abfahrten' + icon('right') + '</button></div>' +
          '<div class="updated">' + icon('live') + 'Live · ' + esc(st.source || 'Transitous') + ' · aktualisiert ' + M.fmtTime(st.updated || new Date()) + '</div>' : '';
        const lb = M.$('[data-later]', moreBox);
        if (lb) lb.addEventListener('click', loadMore);
      }
      async function load() {
        try {
          const r = await M.Transit.departures(stop, { n: 50 });
          if (!ctx.alive()) return;
          st.list = r.list; st.alerts = r.alerts; st.updated = new Date(); st.source = r.fallback || M.Transit.lastSource;
          draw();
        } catch (e) {
          if (!ctx.alive()) return;
          listBox.innerHTML = ''; listBox.appendChild(C.error(e, load));
        }
      }
      async function loadMore() {
        const last = st.list[st.list.length - 1];
        if (!last) return;
        try {
          const r = await M.Transit.departures(stop, { n: 40, time: new Date(last.time.getTime() + 60000) });
          if (!ctx.alive()) return;
          const seen = new Set(st.list.map((x) => x.tripId + x.planned));
          st.list = st.list.concat(r.list.filter((x) => !seen.has(x.tripId + x.planned)));
          draw();
        } catch (e) { M.toast(e.message, { type: 'err' }); }
      }
      if (st.list && ctx.restoring) draw(); else load();
      ctx.every(30000, load);
    }
  };

  /* =====================================================================
     In der Nähe – Entfernung ab Geräteposition
     ===================================================================== */
  V.nearby = {
    title: 'In der Nähe', snap: 'half',
    render(ctx) {
      const st = ctx.state;
      st.radius = st.radius || M.settings.radius || 900;
      const head = (sub) => ctx.head({ title: 'In der Nähe', sub: sub || 'Haltestellen rund um dich', actions: [{ icon: 'locate', label: 'Neu orten', onClick: () => { st.list = null; load(); } }] });
      head();
      ctx.body.innerHTML = '<div class="filters">' + [500, 900, 1500].map((r) => '<button class="chip solid' + (st.radius === r ? ' on' : '') + '" data-r="' + r + '">' + M.fmtDist(r) + '</button>').join('') + '</div><div data-list>' + C.skeleton('row', 5) + '</div>';
      const box = M.$('[data-list]', ctx.body);
      ctx.body.querySelectorAll('[data-r]').forEach((b) => b.addEventListener('click', () => { st.radius = +b.dataset.r; st.list = null; UI.refresh(); }));

      function draw(pos) {
        const list = st.list;
        if (!list.length) { box.innerHTML = C.empty('radar', 'Keine Haltestellen im Umkreis', 'Vergrößere den Radius oder bewege die Karte.'); return; }
        head(list.length + ' Haltestellen im Umkreis von ' + M.fmtDist(st.radius));
        box.innerHTML = list.slice(0, 25).map((s, i) => '<button class="near fade-in" data-i="' + i + '">' +
          '<div class="near-top">' + M.hSignSVG(36) + '<div class="near-name">' + esc(s.name) + '</div>' +
          '<div class="near-dist"><b>' + M.fmtDist(s.distance) + '</b><span><span class="bearing" style="transform:rotate(' + Math.round(s.bearing) + 'deg)">' + icon('nav') + '</span>' + s.walk + ' Min · ' + M.compass(s.bearing) + '</span></div></div>' +
          '<div class="near-deps" data-deps="' + i + '"></div></button>').join('');
        bindRows(box, list, (s) => UI.open('departures', { stop: s }));
        M.Map.showStopList(list);
        const coords = list.slice(0, 8).map((s) => [s.lon, s.lat]).concat([[pos.lon, pos.lat]]);
        M.Map.fitCoords(coords, { maxZoom: 16.5 });
        preview(list.slice(0, 6));
      }
      async function preview(stops) {
        for (let i = 0; i < stops.length; i++) {
          if (!ctx.alive()) return;
          const s = stops[i];
          try {
            if (!s.deps) { const r = await M.Transit.departures(s, { n: 8 }); s.deps = r.list.filter((x) => !x.cancelled && M.minsUntil(x.time) >= 0).slice(0, 3); }
            const el = M.$('[data-deps="' + i + '"]', ctx.body);
            if (el) el.innerHTML = s.deps.map((x) => '<div class="near-dep">' + C.lineBadge(x.line) + '<span class="nd-dir">' + esc(x.headsign) + '</span><span class="nd-t ' + C.delayClass(x.delay, x.realtime) + '">' + (M.minsUntil(x.time) <= 0 ? 'jetzt' : M.minsUntil(x.time) + ' Min') + '</span></div>').join('');
          } catch (e) { /* Vorschau optional */ }
        }
      }
      async function load() {
        box.innerHTML = C.skeleton('row', 5);
        if (ctx.params.center) { head('Haltestellen um den markierten Ort'); run(ctx.params.center); return; }
        let pos;
        try { pos = await M.Geo.get(10000); } catch (e) {
          if (!ctx.alive()) return;
          box.innerHTML = C.empty('locate', 'Standort benötigt', 'Erlaube den Standortzugriff, damit Muvit die Entfernung zu Haltestellen berechnen kann. Alternativ zeige ich Haltestellen um die Kartenmitte.',
            '<button class="btn soft sm" data-center>' + icon('map') + 'Kartenmitte verwenden</button>');
          M.$('[data-center]', box).addEventListener('click', () => { const c = M.Map.center(); run({ lat: c.lat, lon: c.lon }); });
          return;
        }
        run(pos);
      }
      async function run(pos) {
        try {
          if (!st.list) st.list = await M.Transit.nearby(pos.lat, pos.lon, st.radius);
          if (!ctx.alive()) return;
          draw(pos);
        } catch (e) {
          if (!ctx.alive()) return;
          box.innerHTML = ''; box.appendChild(C.error(e, () => run(pos)));
        }
      }
      load();
    }
  };

  /* =====================================================================
     Live-Karte
     ===================================================================== */
  V.live = {
    title: 'Live-Karte', snap: 'peek',
    render(ctx) {
      const st = ctx.state;
      st.modes = st.modes || new Set();
      const wasOn = M.Map.showVehicles;
      M.Map.setShowVehicles(true);
      M.Map.setVehicleModes(st.modes);
      ctx.cleanup(() => { M.Map.setVehicleModes(null); if (!wasOn) M.Map.setShowVehicles(false); });
      if (M.Map.map) {
        const z = M.Map.map.getZoom();
        if (z < 12.5 || z > 15.2) {
          const p = M.Geo.pos && M.dist(M.Geo.pos.lat, M.Geo.pos.lon, M.Map.center().lat, M.Map.center().lon) < 5000 ? M.Geo.pos : M.Map.center();
          M.Map.flyTo(p.lat, p.lon, z < 12.5 ? 13.8 : 14.3);
        }
      }
      ctx.head({ title: 'Live-Karte', sub: 'Straßenbahnen, Busse & Züge in Echtzeit', actions: [{ icon: 'refresh', label: 'Neu laden', onClick: () => M.Map.refreshVehicles() }] });
      ctx.body.innerHTML = '<div class="stat-grid" data-stats></div><div class="filters" data-f></div><div class="section-title">Fahrzeuge in deiner Nähe</div><div class="list" data-list>' + C.skeleton('row', 3) + '</div>';
      const statBox = M.$('[data-stats]', ctx.body), fBox = M.$('[data-f]', ctx.body), listBox = M.$('[data-list]', ctx.body);
      const MODES = ['tram', 'bus', 'sbahn', 'regio', 'fern'];
      const drawFilters = () => {
        fBox.innerHTML = '<button class="chip solid' + (!st.modes.size ? ' on' : '') + '" data-m="all">Alle</button>' +
          MODES.map((m) => '<button class="chip solid' + (st.modes.has(m) ? ' on' : '') + '" data-m="' + m + '"><span class="sw" style="background:' + M.modeInfo(m).color + '"></span>' + M.modeInfo(m).label + '</button>').join('');
        fBox.querySelectorAll('[data-m]').forEach((b) => b.addEventListener('click', () => {
          const m = b.dataset.m;
          if (m === 'all') st.modes.clear(); else if (st.modes.has(m)) st.modes.delete(m); else st.modes.add(m);
          M.Map.setVehicleModes(st.modes); drawFilters();
        }));
      };
      drawFilters();
      let lastDraw = 0;
      function draw(ev) {
        if (ev && !ev.tooFar && Date.now() - lastDraw < 4000) return;
        lastDraw = Date.now();
        if (ev && ev.tooFar) {
          statBox.innerHTML = '';
          listBox.innerHTML = C.empty('map', 'Bitte näher heranzoomen', 'Live-Fahrzeuge werden ab Stadtebene angezeigt.');
          return;
        }
        const list = (ev && ev.list) || M.Map.vehVisible || [];
        const rt = list.filter((v) => v.seg.realtime);
        const onTime = rt.filter((v) => (v.seg.delay || 0) <= 1).length;
        const avg = rt.length ? rt.reduce((s, v) => s + Math.max(0, v.seg.delay || 0), 0) / rt.length : 0;
        statBox.innerHTML =
          '<div class="stat"><b>' + list.length + '</b><span>Fahrzeuge</span></div>' +
          '<div class="stat"><b>' + (rt.length ? Math.round((onTime / rt.length) * 100) + ' %' : '–') + '</b><span>pünktlich</span></div>' +
          '<div class="stat"><b>' + (rt.length ? avg.toFixed(1).replace('.', ',') : '–') + '</b><span>Ø Min Verspätung</span></div>';
        const c = M.Map.center();
        const near = list.map((v) => Object.assign({ d: M.dist(c.lat, c.lon, v.pos.lat, v.pos.lon) }, v)).sort((a, b) => a.d - b.d).slice(0, 15);
        if (!near.length) { listBox.innerHTML = C.empty('live', 'Gerade keine Fahrzeuge', 'Im Kartenausschnitt sind aktuell keine Fahrten unterwegs.'); return; }
        listBox.innerHTML = near.map((v, i) => '<button class="dep" data-i="' + i + '">' + C.lineBadge(v.seg.line, { lg: true }) +
          '<div style="min-width:0"><div class="dep-dir">→ ' + esc(v.seg.to || '') + '</div><div class="dep-sub">' + C.rtPill(v.seg.delay, v.seg.realtime, false) + '<span>' + (v.moving ? 'fährt' : 'hält') + ' · ' + M.fmtDist(v.d) + '</span></div></div>' +
          '<div class="dep-when"><span class="icon-btn flat" style="width:34px;height:34px">' + icon('right') + '</span></div></button>').join('');
        bindRows(listBox, near, (v) => UI.open('trip', { tripId: v.tripId, line: v.seg.line }));
      }
      ctx.on('vehicles:update', (ev) => { if (ctx.alive()) draw(ev); });
      setTimeout(() => { if (ctx.alive()) draw(); }, 1500);
    }
  };

  /* =====================================================================
     Linien
     ===================================================================== */
  V.lines = {
    title: 'Linien', snap: 'half',
    render(ctx) {
      const st = ctx.state;
      ctx.head({ title: 'Linien', sub: 'Alle Linien in der Umgebung', actions: [{ icon: 'refresh', label: 'Neu laden', onClick: () => { st.list = null; load(); } }] });
      ctx.body.innerHTML = '<div class="input-wrap" style="margin:2px 0 10px"><span class="i-left">' + icon('search') + '</span><input class="input" data-q placeholder="Linie suchen, z. B. 4, 52, S1, RE"></div><div data-list>' + C.skeleton('row', 6) + '</div>';
      const box = M.$('[data-list]', ctx.body), input = M.$('[data-q]', ctx.body);
      function draw() {
        const q = input.value.trim().toLowerCase().replace(/\s+/g, '');
        const list = (st.list || []).filter((x) => !q || x.line.name.toLowerCase().replace(/\s+/g, '').includes(q) || x.line.full.toLowerCase().replace(/\s+/g, '').includes(q) || x.headsigns.some((h) => h.toLowerCase().includes(q)));
        if (!list.length) { box.innerHTML = C.empty('lines', 'Keine Linie gefunden', ''); return; }
        let html = '', lastMode = null, flat = [];
        list.forEach((x) => {
          if (x.line.mode !== lastMode) { html += (lastMode ? '</div>' : '') + '<div class="section-title">' + M.modeInfo(x.line.mode).label + '</div><div class="list">'; lastMode = x.line.mode; }
          flat.push(x);
          html += '<button class="row fade-in" data-i="' + (flat.length - 1) + '">' + C.lineBadge(x.line, { lg: true }) +
            '<div class="row-main"><div class="row-title">' + esc(x.headsigns.slice(0, 2).join(' ⇄ ')) + '</div><div class="row-sub">Nächste ab ' + esc(x.next.stop.name) + ' ' + M.fmtCountdown(x.next.time) + '</div></div>' +
            '<div class="row-end">' + icon('right') + '</div></button>';
        });
        box.innerHTML = html + '</div>';
        bindRows(box, flat, (x) => UI.open('trip', { tripId: x.next.tripId, src: x.next.src, line: x.line, focusStop: x.next.stop.name }));
      }
      async function load() {
        box.innerHTML = C.skeleton('row', 6);
        try {
          const c = M.Geo.pos && M.Map.map && M.dist(M.Geo.pos.lat, M.Geo.pos.lon, M.Map.center().lat, M.Map.center().lon) < 3000 ? M.Geo.pos : M.Map.center();
          st.list = await M.Transit.linesNear(c.lat, c.lon);
          if (!ctx.alive()) return;
          draw();
        } catch (e) { if (ctx.alive()) { box.innerHTML = ''; box.appendChild(C.error(e, load)); } }
      }
      input.addEventListener('input', draw);
      if (st.list) draw(); else load();
    }
  };

  /* =====================================================================
     Linienverlauf (Fahrt) mit Live-Position
     ===================================================================== */
  function stopTimes(s) {
    const a = s.arr || s.arrPlanned || s.dep || s.depPlanned;
    const d = s.dep || s.depPlanned || s.arr || s.arrPlanned;
    return { a: a ? +a : null, d: d ? +d : null };
  }
  function tripProgress(trip, now) {
    const T = trip.stops.map(stopTimes);
    const n = T.length;
    if (!n || T[0].d == null) return { state: 'unknown', idx: 0, f: 0 };
    if (now < T[0].d) return { state: 'before', idx: 0, f: 0 };
    for (let i = 0; i < n; i++) {
      if (T[i].a != null && T[i].d != null && now >= T[i].a && now <= T[i].d) return { state: 'at', idx: i, f: 0 };
      if (i < n - 1 && T[i].d != null && T[i + 1].a != null && now > T[i].d && now < T[i + 1].a) {
        return { state: 'between', idx: i, f: (now - T[i].d) / Math.max(1, T[i + 1].a - T[i].d) };
      }
    }
    return { state: 'after', idx: n - 1, f: 0 };
  }
  function stopCoordIdx(trip) {
    const out = []; let from = 0;
    const c = trip.coords;
    trip.stops.forEach((s) => {
      let best = from, bd = Infinity;
      for (let i = from; i < c.length; i++) {
        const d = M.dist(s.lat, s.lon, c[i][1], c[i][0]);
        if (d < bd) { bd = d; best = i; }
        if (bd < 15 && d > bd + 400) break;
      }
      out.push(best); from = best;
    });
    return out;
  }
  function tripPos(trip, idxs, prog) {
    const s = trip.stops;
    if (prog.state === 'before' || prog.state === 'unknown') return { lat: s[0].lat, lon: s[0].lon };
    if (prog.state === 'at' || prog.state === 'after') return { lat: s[prog.idx].lat, lon: s[prog.idx].lon };
    const a = idxs[prog.idx], b = idxs[prog.idx + 1];
    const c = trip.coords;
    if (!c.length || b <= a) {
      const p = s[prog.idx], q = s[prog.idx + 1];
      return { lat: p.lat + (q.lat - p.lat) * prog.f, lon: p.lon + (q.lon - p.lon) * prog.f };
    }
    let total = 0; const seg = [];
    for (let i = a; i < b; i++) { const d = M.dist(c[i][1], c[i][0], c[i + 1][1], c[i + 1][0]); seg.push(d); total += d; }
    let target = total * prog.f;
    for (let i = 0; i < seg.length; i++) {
      if (target <= seg[i] || i === seg.length - 1) {
        const r = seg[i] ? Math.min(1, target / seg[i]) : 0;
        const p = c[a + i], q = c[a + i + 1];
        return { lon: p[0] + (q[0] - p[0]) * r, lat: p[1] + (q[1] - p[1]) * r };
      }
      target -= seg[i];
    }
    return { lat: s[prog.idx + 1].lat, lon: s[prog.idx + 1].lon };
  }

  V.trip = {
    title: 'Linienverlauf', snap: 'half',
    render(ctx) {
      const p = ctx.params, st = ctx.state;
      const L0 = p.line;
      ctx.head({
        title: L0 ? M.modeInfo(L0.mode).label + ' ' + L0.full : 'Linienverlauf', sub: 'Linienverlauf & Live-Position',
        actions: [{ icon: 'refresh', label: 'Aktualisieren', onClick: () => load(true) }]
      });
      ctx.body.innerHTML = C.skeleton('card', 1) + C.skeleton('row', 6);
      let idxs = null, firstDraw = true;

      function draw() {
        const t = st.trip, L = t.line;
        const now = Date.now();
        const prog = tripProgress(t, now);
        const nextIdx = prog.state === 'between' ? prog.idx + 1 : prog.idx;
        const nx = t.stops[nextIdx];
        const nxDelay = nx ? M.delayMin(nx.arr || nx.dep, nx.arrPlanned || nx.depPlanned) : null;
        ctx.head({
          title: M.modeInfo(L.mode).label + ' ' + L.full, sub: '→ ' + esc(t.headsign),
          actions: [{ icon: 'refresh', label: 'Aktualisieren', onClick: () => load(true) }]
        });
        const status = prog.state === 'before' ? 'Startet ' + M.fmtCountdown(stopTimes(t.stops[0]).d) + ' ab ' + esc(t.stops[0].name)
          : prog.state === 'after' ? 'Fahrt beendet'
          : prog.state === 'at' ? 'Hält gerade an ' + esc(t.stops[prog.idx].name)
          : 'Unterwegs nach ' + esc(nx ? nx.name : '');
        ctx.body.innerHTML =
          '<div class="trip-head fade-in" style="background:linear-gradient(135deg,' + L.color + ',' + L.color + 'cc)">' + C.lineBadge(Object.assign({}, L, { text: L.color }), { lg: true, icon: true }) +
          '<div class="th-main"><div class="th-title">→ ' + esc(t.headsign) + '</div><div class="th-sub">' + status + '</div></div>' +
          (t.realtime && prog.state !== 'after' ? '<span style="background:rgba(255,255,255,.94);border-radius:99px;display:inline-flex">' + C.rtPill(nxDelay, true, false) + '</span>' : '') + '</div>' +
          C.alerts(t.alerts) +
          '<ol class="stops" style="--c:' + L.color + '">' + t.stops.map((s, i) => {
            const past = (prog.state === 'after') || (prog.state === 'between' && i <= prog.idx) || (prog.state === 'at' && i < prog.idx);
            const tm = s.dep || s.arr, pl = s.depPlanned || s.arrPlanned;
            const isFocus = p.focusStop && s.name === p.focusStop;
            return '<li class="' + (past ? 'past ' : '') + (i === 0 || i === t.stops.length - 1 ? 'term ' : '') + (s.cancelled ? 'cancelled' : '') + '" data-i="' + i + '">' +
              '<div class="s-time">' + C.time(tm, pl, M.delayMin(tm, pl), t.realtime, s.cancelled) + '</div>' +
              '<div class="s-rail"><span class="s-dot"></span></div>' +
              '<div class="s-name"' + (isFocus ? ' style="color:var(--primary)"' : '') + '>' + esc(s.name) + (s.platform ? '<small>Gleis/Steig ' + esc(s.platform) + '</small>' : '') + '</div></li>';
          }).join('') + '<span class="veh" hidden>' + icon(M.modeInfo(L.mode).icon) + '</span></ol>' +
          '<div class="updated">' + icon('live') + (t.realtime ? 'Echtzeit' : 'Fahrplandaten') + ' · ' + M.fmtTime(st.updated || new Date()) + '</div>';
        ctx.body.querySelectorAll('.stops li').forEach((li) => li.addEventListener('click', () => {
          const s = t.stops[+li.dataset.i];
          UI.open('departures', { stop: { id: s.id, name: s.name, lat: s.lat, lon: s.lon, type: 'stop', src: t.src } });
        }));
        placeVehicle();
        if (firstDraw) {
          firstDraw = false;
          const target = ctx.body.querySelector('.stops li[data-i="' + Math.max(0, nextIdx - 1) + '"]');
          if (target) setTimeout(() => target.scrollIntoView({ block: 'start', behavior: 'smooth' }), 250);
        }
      }
      function placeVehicle() {
        const t = st.trip;
        if (!t) return;
        const prog = tripProgress(t, Date.now());
        const veh = ctx.body.querySelector('.stops .veh');
        const lis = ctx.body.querySelectorAll('.stops li');
        if (veh && lis.length && (prog.state === 'between' || prog.state === 'at')) {
          const a = lis[prog.idx], b = lis[Math.min(lis.length - 1, prog.idx + 1)];
          const ya = a.offsetTop + 10, yb = b.offsetTop + 10;
          veh.style.top = (ya + (yb - ya) * (prog.state === 'between' ? prog.f : 0)) + 'px';
          veh.hidden = false;
        } else if (veh) veh.hidden = true;
        idxs = idxs || stopCoordIdx(t);
        M.Map.setTripVehicle(prog.state === 'between' || prog.state === 'at' ? tripPos(t, idxs, prog) : null, t.line);
      }
      async function load(manual) {
        try {
          const t = await M.Transit.trip(p.tripId, p.src);
          if (!ctx.alive()) return;
          const wasNull = !st.trip;
          st.trip = t; st.updated = new Date(); idxs = null;
          if (wasNull || manual) M.Map.drawTrip(t); else M.Map.drawTrip(t, { fit: false });
          draw();
          if (manual) M.toast('Linienverlauf aktualisiert', { type: 'ok' });
        } catch (e) {
          if (!ctx.alive()) return;
          if (!st.trip) { ctx.body.innerHTML = ''; ctx.body.appendChild(C.error(e, () => load(true))); }
          else if (manual) M.toast(e.message, { type: 'err' });
        }
      }
      if (st.trip && ctx.restoring) { M.Map.drawTrip(st.trip); draw(); } else load(false);
      ctx.every(1000, placeVehicle);
      ctx.every(30000, () => load(false));
      ctx.cleanup(() => M.Map.setTripVehicle(null));
    }
  };

  /* =====================================================================
     Tickets & Preise
     ===================================================================== */
  V.tickets = {
    title: 'Tickets & Preise', snap: 'full',
    render(ctx) {
      const st = ctx.state;
      const T = M.Tariffs;
      ctx.head({ title: 'Tickets & Preise', sub: T.verbund + ' · Stand ' + T.stand });
      const card = (p) => '<div class="tix ' + p.cls + ' fade-in"><div class="tix-name">' + esc(p.name) + ' · ' + esc(p.zone) + '</div>' +
        '<div class="tix-price">' + (p.price != null ? M.money(p.price) + (p.unit ? '<small>' + esc(p.unit) + '</small>' : '') : 'Preis laut marego') +
        (p.app ? '<small>App: ' + M.money(p.app) + '</small>' : '') + '</div>' +
        (p.child ? '<div class="tix-note">Kind (6–14): ' + M.money(p.child) + (p.childApp ? ' · App ' + M.money(p.childApp) : '') + '</div>' : '') +
        '<div class="tix-note">' + esc(p.note) + '</div>' +
        '<div class="tix-tags">' + p.tags.map((t) => '<span>' + esc(t) + '</span>').join('') + '</div></div>';
      ctx.body.innerHTML =
        '<div class="section-title">Preis für deine Strecke</div>' +
        '<div class="card" style="padding:6px">' +
          '<button class="row" data-pick="from" style="box-shadow:none">' + '<span class="search-dot from" style="margin:0 12px"></span><div class="row-main"><div class="row-sub">Von</div><div class="row-title" data-v="from">' + esc(st.from ? st.from.name : 'Start wählen') + '</div></div></button>' +
          '<button class="row" data-pick="to" style="box-shadow:none">' + '<span class="search-dot to" style="margin:0 12px"></span><div class="row-main"><div class="row-sub">Nach</div><div class="row-title" data-v="to">' + esc(st.to ? st.to.name : 'Ziel wählen') + '</div></div></button>' +
        '</div>' +
        '<div class="btn-row"><button class="btn primary" data-calc>' + icon('euro') + 'Preis ermitteln</button></div><div data-res></div>' +
        '<div class="section-title">Tickets in Magdeburg</div>' + T.products.map(card).join('') +
        '<div class="note">' + icon('info') + '<div>Alle Preise ohne Gewähr (Stand ' + T.stand + '). Für Fernverkehr ruft Muvit die aktuellen Preise live bei der Deutschen Bahn ab. Frag gern auch die <b>Muvit KI</b> nach dem passenden Ticket.</div></div>' +
        '<div class="section-title">Offizielle Tarifinfos</div><div class="list">' +
        T.links.map((l) => '<a class="row" href="' + l.url + '" target="_blank" rel="noopener" style="text-decoration:none;color:inherit"><span class="row-ico">' + icon('external') + '</span><div class="row-main"><div class="row-title">' + esc(l.label) + '</div><div class="row-sub">' + esc(l.url.replace(/^https?:\/\//, '')) + '</div></div></a>').join('') + '</div>';
      ctx.body.querySelectorAll('[data-pick]').forEach((b) => b.addEventListener('click', () => {
        const k = b.dataset.pick;
        UI.open('places', { title: k === 'from' ? 'Start' : 'Ziel', allowMe: true, onPick: (pl) => { st[k] = pl; } });
      }));
      M.$('[data-calc]', ctx.body).addEventListener('click', calc);
      async function calc() {
        const res = M.$('[data-res]', ctx.body);
        if (!st.from || !st.to) { M.toast('Bitte Start und Ziel wählen', { type: 'err' }); return; }
        res.innerHTML = C.skeleton('row', 2);
        try {
          const r = await runJourneys({ from: st.from, to: st.to, via: [], time: null, arriveBy: false });
          if (!ctx.alive()) return;
          const j = r.list[0];
          if (!j) { res.innerHTML = C.empty('route', 'Keine Verbindung gefunden', ''); return; }
          const est = M.Tariffs.estimate(j);
          res.innerHTML = '<div class="price-box"><span class="pb-ico">' + icon('ticket') + '</span><div class="pb-main"><div class="pb-title">' + esc(est.title) + '</div><div class="pb-sub">' + esc(est.note) + '</div></div><div class="pb-val">' + (est.price != null ? M.money(est.price) : '–') + '</div></div>' +
            C.journeyCard(j, 0) + '<div data-db></div>';
          M.$('.jc', res).addEventListener('click', () => UI.open('journey', { j, query: { from: st.from, to: st.to, via: [], time: null, arriveBy: false } }));
          if (est.kind !== 'md' && est.kind !== 'walk') {
            const box = M.$('[data-db]', res);
            box.innerHTML = '<div class="updated">' + icon('euro') + 'Frage DB-Preise ab …</div>';
            const a = await M.concretePlace(st.from), b = await M.concretePlace(st.to);
            M.Transit.dbPrice(a, b, null).then((p) => {
              if (!ctx.alive()) return;
              box.innerHTML = p ? '<div class="price-box"><span class="pb-ico" style="background:var(--g-dep)">' + icon('euro') + '</span><div class="pb-main"><div class="pb-title">Günstigster DB-Preis heute</div><div class="pb-sub">Abfahrt ' + M.fmtTime(p.cheapest.dep) + ' · ' + M.fmtDur(p.cheapest.duration) + '</div></div><div class="pb-val">' + M.money(p.cheapest.price.amount) + '</div></div>' : '<div class="note">' + icon('info') + '<div>Kein Online-Preis der DB für diese Strecke verfügbar.</div></div>';
            }).catch(() => { if (ctx.alive()) box.innerHTML = '<div class="note warn">' + icon('alert') + '<div>DB-Preisauskunft gerade nicht erreichbar.</div></div>'; });
          }
        } catch (e) { res.innerHTML = ''; res.appendChild(C.error(e, calc)); }
      }
    }
  };

  /* =====================================================================
     Favoriten & Verlauf
     ===================================================================== */
  V.favorites = {
    title: 'Favoriten', snap: 'half',
    render(ctx) {
      ctx.head({ title: 'Favoriten & Verlauf' });
      const fr = M.favs.routes(), fs = M.favs.stops(), rr = M.recents.routes();
      const routeRow = (r, i, k) => '<button class="row" data-' + k + '="' + i + '"><span class="row-ico">' + icon(k === 'fr' ? 'star' : 'history') + '</span><div class="row-main"><div class="row-title">' + esc(M.isMe(r.from) ? 'Mein Standort' : r.from.name) + ' → ' + esc(r.to.name) + '</div><div class="row-sub">Verbindungen anzeigen</div></div><div class="row-end">' + icon('right') + '</div></button>';
      let html = '';
      if (fr.length) html += '<div class="section-title">Gemerkte Routen</div><div class="list">' + fr.map((r, i) => routeRow(r, i, 'fr')).join('') + '</div>';
      if (fs.length) html += '<div class="section-title">Lieblings-Haltestellen</div><div class="list">' + fs.map((s, i) => placeRow(s, i, 'Abfahrten anzeigen')).join('') + '</div>';
      if (rr.length) html += '<div class="section-title">Zuletzt gesucht</div><div class="list">' + rr.map((r, i) => routeRow(r, i, 'rr')).join('') + '</div>';
      ctx.body.innerHTML = html || C.empty('star', 'Noch keine Favoriten', 'Merke dir Routen und Haltestellen mit dem Stern – sie erscheinen dann hier.');
      const go = (r) => { M.state.from = r.from; M.state.to = r.to; M.state.via = []; M.emit('state'); UI.home(); M.App.search(); };
      ctx.body.querySelectorAll('[data-fr]').forEach((b) => b.addEventListener('click', () => go(fr[+b.dataset.fr])));
      ctx.body.querySelectorAll('[data-rr]').forEach((b) => b.addEventListener('click', () => go(rr[+b.dataset.rr])));
      bindRows(ctx.body, fs, (s) => UI.open('departures', { stop: s }));
    }
  };

  /* =====================================================================
     Kartenebenen
     ===================================================================== */
  function sw(id, on) { return '<label class="switch"><input type="checkbox" data-sw="' + id + '"' + (on ? ' checked' : '') + '><span></span></label>'; }
  V.layers = {
    title: 'Karte', snap: 'peek',
    render(ctx) {
      ctx.head({ title: 'Kartenebenen' });
      ctx.body.innerHTML = '<div class="set-group">' +
        '<div class="set-row">' + M.hSignSVG(30) + '<div class="sr-main"><div class="sr-title">Haltestellen</div><div class="sr-sub">„H“-Schilder ab Stadtteil-Zoom</div></div>' + sw('stops', M.Map.showStops) + '</div>' +
        '<div class="set-row"><span class="mode-ico" style="background:var(--late)">' + icon('live') + '</span><div class="sr-main"><div class="sr-title">Live-Fahrzeuge</div><div class="sr-sub">Trams, Busse & Züge in Echtzeit</div></div>' + sw('veh', M.Map.showVehicles) + '</div>' +
        '<div class="set-row"><span class="mode-ico" style="background:#262A36">' + icon('moon') + '</span><div class="sr-main"><div class="sr-title">Dunkles Design</div><div class="sr-sub">Karte & App</div></div>' + sw('dark', document.documentElement.dataset.theme === 'dark') + '</div>' +
        '</div>';
      ctx.body.querySelectorAll('[data-sw]').forEach((i) => i.addEventListener('change', () => {
        const on = i.checked;
        if (i.dataset.sw === 'stops') { M.Map.setShowStops(on); M.saveSettings({ showStops: on }); }
        if (i.dataset.sw === 'veh') { M.Map.setShowVehicles(on); M.saveSettings({ showVehicles: on }); }
        if (i.dataset.sw === 'dark') { M.saveSettings({ theme: on ? 'dark' : 'light' }); M.App.applyTheme(); }
      }));
    }
  };

  /* =====================================================================
     Einstellungen
     ===================================================================== */
  V.settings = {
    title: 'Einstellungen', snap: 'full',
    render(ctx) {
      const s = M.settings;
      ctx.head({ title: 'Einstellungen' });
      const seg = (key, opts) => '<div class="seg" data-seg="' + key + '">' + opts.map((o) => '<button data-v="' + o[0] + '" class="' + (String(s[key]) === String(o[0]) ? 'on' : '') + '">' + o[1] + '</button>').join('') + '</div>';
      ctx.body.innerHTML =
        '<div class="section-title">Darstellung</div><div class="set-group"><div class="set-row"><div class="sr-main"><div class="sr-title">Design</div></div>' + seg('theme', [['system', 'Auto'], ['light', 'Hell'], ['dark', 'Dunkel']]) + '</div>' +
        '<div class="set-row"><div class="sr-main"><div class="sr-title">Haltestellen auf der Karte</div></div>' + sw('stops', s.showStops) + '</div>' +
        '<div class="set-row"><div class="sr-main"><div class="sr-title">Live-Fahrzeuge</div></div>' + sw('veh', s.showVehicles) + '</div></div>' +

        '<div class="section-title">Muvit KI</div><div class="set-group" style="padding:12px 14px">' +
          '<div class="note" style="margin-top:0">' + icon('sparkles') + '<div>Die KI nutzt Claude von Anthropic. Hinterlege deinen eigenen API-Schlüssel – er wird nur lokal in diesem Browser gespeichert und direkt an api.anthropic.com gesendet. Ohne Schlüssel beantwortet Muvit typische Fragen (Route, Abfahrten, Preise, Linien) im Basis-Modus.</div></div>' +
          '<label class="field"><span>Anthropic API-Schlüssel</span><div class="input-wrap"><span class="i-left">' + icon('key') + '</span><input class="input" type="password" data-key placeholder="sk-ant-…" value="' + esc(s.apiKey || '') + '" autocomplete="off"><button class="i-right icon-btn flat" data-eye aria-label="Anzeigen">' + icon('eye') + '</button></div></label>' +
          '<label class="field"><span>Modell</span><select class="input" data-model>' + M.CONFIG.aiModels.map((m) => '<option value="' + m.id + '"' + (s.model === m.id ? ' selected' : '') + '>' + esc(m.label) + '</option>').join('') + '</select></label>' +
          '<label class="field"><span>Antwortstil</span>' + seg('effort', [['low', 'Schnell'], ['medium', 'Ausgewogen'], ['high', 'Gründlich']]) + '</label>' +
          '<div class="btn-row"><button class="btn soft" data-test>' + icon('check') + 'Schlüssel testen</button><button class="btn" data-clearkey>' + icon('trash') + 'Entfernen</button></div>' +
        '</div>' +

        '<div class="section-title">Datenquelle</div><div class="set-group"><div class="set-row"><div class="sr-main"><div class="sr-title">Primäre Fahrplanauskunft</div><div class="sr-sub">Bei Ausfall wird automatisch die andere Quelle genutzt.</div></div></div>' +
          '<div class="set-row">' + seg('provider', [['motis', 'Transitous (Echtzeit, MVB)'], ['db', 'Deutsche Bahn']]) + '</div>' +
          '<div class="set-row"><div class="sr-main"><div class="sr-title">Umkreis „In der Nähe“</div></div>' + seg('radius', [[500, '500 m'], [900, '900 m'], [1500, '1,5 km']]) + '</div></div>' +

        '<div class="section-title">Daten</div><div class="set-group"><div class="set-row"><div class="sr-main"><div class="sr-title">Verlauf & Favoriten löschen</div><div class="sr-sub">Entfernt gespeicherte Orte, Routen und Haltestellen</div></div><button class="btn sm" data-wipe>Löschen</button></div></div>' +

        '<div class="section-title">Über Muvit</div><div class="note">' + icon('info') + '<div><b>Muvit</b> – Mobilität für Magdeburg & ganz Deutschland.<br>Fahrplan & Echtzeit: <a href="https://transitous.org" target="_blank" rel="noopener">Transitous</a> (MOTIS, offene Daten inkl. DELFI/MVB) und <a href="https://v6.db.transport.rest" target="_blank" rel="noopener">db.transport.rest</a>. Karte: © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>-Mitwirkende, <a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a>, MapLibre. KI: Claude (Anthropic). Tarife ohne Gewähr.</div></div>';

      ctx.body.querySelectorAll('[data-seg]').forEach((g) => g.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
        const key = g.dataset.seg;
        let v = b.dataset.v; if (key === 'radius') v = +v;
        M.saveSettings({ [key]: v });
        g.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
        if (key === 'theme') M.App.applyTheme();
      })));
      ctx.body.querySelectorAll('[data-sw]').forEach((i) => i.addEventListener('change', () => {
        if (i.dataset.sw === 'stops') { M.saveSettings({ showStops: i.checked }); M.Map.setShowStops(i.checked); }
        if (i.dataset.sw === 'veh') { M.saveSettings({ showVehicles: i.checked }); M.Map.setShowVehicles(i.checked); }
      }));
      const key = M.$('[data-key]', ctx.body);
      key.addEventListener('change', () => M.saveSettings({ apiKey: key.value.trim() }));
      M.$('[data-eye]', ctx.body).addEventListener('click', () => { key.type = key.type === 'password' ? 'text' : 'password'; });
      M.$('[data-model]', ctx.body).addEventListener('change', (e) => M.saveSettings({ model: e.target.value }));
      M.$('[data-clearkey]', ctx.body).addEventListener('click', () => { key.value = ''; M.saveSettings({ apiKey: '' }); M.toast('API-Schlüssel entfernt', { type: 'ok' }); });
      M.$('[data-test]', ctx.body).addEventListener('click', async (e) => {
        M.saveSettings({ apiKey: key.value.trim() });
        const b = e.currentTarget; b.disabled = true;
        try { await M.Assistant.testKey(); M.toast('Verbindung zu Claude funktioniert', { type: 'ok' }); }
        catch (err) { M.toast(err.message || 'Test fehlgeschlagen', { type: 'err', ms: 6000 }); }
        finally { b.disabled = false; }
      });
      M.$('[data-wipe]', ctx.body).addEventListener('click', () => {
        ['recentPlaces', 'recentRoutes', 'favStops', 'favRoutes'].forEach((k) => M.store.del(k));
        M.emit('state'); M.toast('Verlauf & Favoriten gelöscht', { type: 'ok' });
      });
    }
  };
})(window.Muvit = window.Muvit || {});
