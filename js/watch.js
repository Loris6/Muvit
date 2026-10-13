/* Muvit – Verbindung überwachen: meldet verpasste Anschlüsse und Ausfälle und schlägt die schnellsten Alternativen vor */
(function (M) {
  'use strict';

  const KEY = 'watch';
  const W = M.Watch = { data: null, alert: null };
  let timer = null, busy = false;

  const fmt = (t) => M.fmtTime(new Date(t));
  const lineTxt = (l) => (l ? (l.mode === 'tram' ? 'Tram ' : l.mode === 'bus' ? 'Bus ' : '') + l.name : '');

  function pack(j, q) {
    const last = j.legs[j.legs.length - 1].to;
    const to = q && q.to && !M.isMe(q.to) ? q.to : last;
    return {
      id: j.id, src: j.src, dep: +j.dep, arr: +j.arr,
      to: { id: to.id, name: to.name, lat: to.lat, lon: to.lon, type: to.type || 'stop', src: to.src || j.src },
      legs: j.legs.map((l) => ({
        walk: !!l.walk, duration: l.duration || 0, tripId: l.tripId || '', line: l.line, headsign: l.headsign || '',
        from: { id: l.from.id, name: l.from.name, lat: l.from.lat, lon: l.from.lon, time: +l.from.time },
        to: { id: l.to.id, name: l.to.name, lat: l.to.lat, lon: l.to.lon, time: +l.to.time }
      })),
      notified: {}
    };
  }
  function save() { if (W.data) M.store.set(KEY, W.data); else M.store.del(KEY); }
  function schedule(now) {
    clearTimeout(timer);
    if (!W.data) return;
    timer = setTimeout(check, now ? 300 : 60000);
  }
  const findStop = (stops, s) => stops.findIndex((x) => (s.id && x.id === s.id) || x.name === s.name);

  W.isWatching = (j) => !!(W.data && j && W.data.id === j.id);

  /** Überwachung starten (im Tipp des Nutzers, damit iOS/Browser die Erlaubnis abfragen dürfen) */
  W.start = async function (j, q) {
    if ('Notification' in window && Notification.permission === 'default') {
      try { await Notification.requestPermission(); } catch (e) { /* ignore */ }
    }
    W.data = pack(j, q); W.alert = null; save();
    M.toast('Verbindung wird überwacht – Muvit meldet sich, wenn ein Anschluss nicht klappt.', { type: 'ok', ms: 5000 });
    if ('Notification' in window && Notification.permission === 'denied') M.toast('Mitteilungen sind blockiert – Hinweise erscheinen nur in der App.', { type: 'err', ms: 6000 });
    M.emit('watch');
    schedule(true);
  };
  W.stop = function () {
    W.data = null; W.alert = null; save(); clearTimeout(timer);
    M.emit('watch');
  };

  /** Echtzeit der Teilstrecken holen und Umstiege prüfen */
  async function check() {
    const d = W.data;
    if (!d || busy) { schedule(); return; }
    if (document.hidden && !('Notification' in window && Notification.permission === 'granted')) { schedule(); return; }
    const now = Date.now();
    if (now > d.arr + 15 * 60000) { W.stop(); return; }
    busy = true;
    try {
      for (const l of d.legs) {
        if (l.walk || !l.tripId) continue;
        try {
          const t = await M.Transit.trip(l.tripId, d.src);
          const fi = findStop(t.stops, l.from), ti = findStop(t.stops, l.to);
          if (fi >= 0) { const s = t.stops[fi]; l.from.time = +(s.dep || s.depPlanned || l.from.time); l.from.cancelled = !!s.cancelled; }
          if (ti >= 0) { const s = t.stops[ti]; l.to.time = +(s.arr || s.arrPlanned || l.to.time); l.to.cancelled = !!s.cancelled; }
        } catch (e) { /* nächster Versuch in einer Minute */ }
      }
      let p = null;
      const tr = d.legs.map((l, i) => ({ l, i })).filter((x) => !x.l.walk);
      for (let k = 0; k < tr.length && !p; k++) {
        const A = tr[k].l;
        if ((A.from.cancelled || A.to.cancelled) && A.to.time > now) { p = { kind: 'cancel', leg: A, at: A.from.time > now ? A.from : A.to, key: 'c' + k }; break; }
        if (k + 1 < tr.length) {
          const B = tr[k + 1].l;
          const walk = d.legs.slice(tr[k].i + 1, tr[k + 1].i).reduce((s, w) => s + (w.walk ? w.duration * 60000 : 0), 0);
          const slack = B.from.time - A.to.time - walk;
          if (slack < 0 && B.from.time > now - 60000) p = { kind: 'miss', leg: B, prev: A, at: A.to, slack, key: 'm' + k };
        }
      }
      if (p) {
        p.time = Math.max(now, p.kind === 'miss' ? p.prev.to.time : now);
        p.from = { id: p.at.id, name: p.at.name, lat: p.at.lat, lon: p.at.lon, type: 'stop', src: d.src };
        if (!d.notified[p.key]) {
          d.notified[p.key] = true; save();
          await alternatives(p);
          notify(p);
        } else if (W.alert && W.alert.key === p.key) p.alts = W.alert.alts;
      }
      W.alert = p;
      M.emit('watch');
    } finally { busy = false; schedule(); }
  }

  /** Schnellste Alternativen ab dem Umstiegshalt (bzw. dem Halt der ausgefallenen Fahrt) zum Ziel */
  async function alternatives(p) {
    try {
      const r = await M.Transit.journeys({ from: p.from, to: W.data.to, via: [], time: new Date(p.time), arriveBy: false });
      p.alts = (r.list || []).filter((j) => +j.dep >= p.time - 60000).sort((a, b) => a.arr - b.arr).slice(0, 3);
    } catch (e) { p.alts = []; }
  }

  function texts(p) {
    const alt = p.alts && p.alts[0];
    const altTxt = alt ? ' Schnellste Alternative: ab ' + fmt(alt.dep) + ' mit ' + alt.legs.filter((l) => !l.walk).map((l) => lineTxt(l.line)).join(' → ') + ', Ankunft ' + fmt(alt.arr) + '.' : ' Muvit sucht Alternativen.';
    if (p.kind === 'miss') {
      return {
        title: 'Anschluss wird nicht erreicht', short: 'Anschluss in Gefahr',
        body: lineTxt(p.leg.line) + ' → ' + p.leg.headsign + ' ab ' + p.at.name + ' um ' + fmt(p.leg.from.time) + ' ist nicht mehr zu schaffen (' + Math.max(1, Math.round(-p.slack / 60000)) + ' Min. zu knapp).' + altTxt
      };
    }
    return { title: 'Fahrt fällt aus', short: 'Fahrt fällt aus', body: lineTxt(p.leg.line) + ' → ' + p.leg.headsign + ' fällt aus.' + altTxt };
  }
  W.texts = texts;

  async function notify(p) {
    const t = texts(p);
    M.toast(t.title, { type: 'err', ms: 8000 });
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const opt = { body: t.body, tag: 'muvit-watch', renotify: true, icon: 'assets/icon-192.png?v=2', data: { url: './?view=alternativen' } };
    try {
      const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration();
      if (reg) await reg.showNotification(t.title, opt);
      else new Notification(t.title, opt);
    } catch (e) { /* Mitteilung nicht möglich – Hinweis steht in der App */ }
  }

  /** Alternativen in Muvit öffnen (aus der Leiste oder der Mitteilung) */
  W.openAlternatives = function () {
    const p = W.alert;
    if (!p || !W.data) { M.toast('Keine aktuelle Störung der überwachten Verbindung.'); return; }
    M.state.from = p.from; M.state.to = W.data.to; M.state.via = [];
    M.state.time = new Date(p.time); M.state.arriveBy = false;
    M.emit('state');
    M.App.search();
  };

  /* ---------- Leiste oben über der Karte ---------- */
  function renderBar() {
    const bar = document.getElementById('watchBar');
    if (!bar) return;
    const d = W.data;
    if (!d) { bar.hidden = true; bar.innerHTML = ''; return; }
    bar.hidden = false;
    const p = W.alert;
    bar.className = 'watch-bar' + (p ? ' alarm' : '');
    bar.innerHTML = p
      ? M.icon('warnFill', 'wb-i') + '<div class="wb-t"><b>' + M.esc(texts(p).short) + '</b><span>' + M.esc(p.at.name) + (p.alts && p.alts[0] ? ' · Alternative ab ' + fmt(p.alts[0].dep) + ', an ' + fmt(p.alts[0].arr) : '') + '</span></div>' +
        '<button class="wb-b" data-alt>Alternativen</button><button class="wb-x" data-stop aria-label="Überwachung beenden">' + M.icon('close') + '</button>'
      : M.icon('bellRing', 'wb-i') + '<div class="wb-t"><b>Verbindung wird überwacht</b><span>ab ' + fmt(d.legs[0].from.time) + ' · an ' + fmt(d.legs[d.legs.length - 1].to.time) + ' · ' + M.esc(d.to.name) + '</span></div>' +
        '<button class="wb-x" data-stop aria-label="Überwachung beenden">' + M.icon('close') + '</button>';
    const a = bar.querySelector('[data-alt]'); if (a) a.addEventListener('click', W.openAlternatives);
    bar.querySelector('[data-stop]').addEventListener('click', () => { W.stop(); M.toast('Überwachung beendet'); });
  }

  W.init = function () {
    const d = M.store.get(KEY, null);
    if (d && d.arr && Date.now() < d.arr + 15 * 60000) { W.data = d; schedule(true); } else if (d) M.store.del(KEY);
    M.on('watch', renderBar);
    renderBar();
    document.addEventListener('visibilitychange', () => { if (!document.hidden && W.data) schedule(true); });
  };
})(window.Muvit = window.Muvit || {});
