/* Muvit – Start & Verdrahtung des Startframes */
(function (M) {
  'use strict';

  const $ = M.$, UI = M.UI, icon = M.icon, esc = M.esc;
  const App = M.App = {};

  /* ---------------- Theme ---------------- */
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  App.isDark = function () {
    const t = M.settings.theme;
    return t === 'dark' || (t === 'system' && mq.matches);
  };
  App.applyTheme = function () {
    const dark = App.isDark();
    const was = document.documentElement.dataset.theme === 'dark';
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = dark ? '#090A12' : '#5B45FF';
    if (M.Map.map && was !== dark) M.Map.setTheme(dark);
    return dark;
  };

  /* ---------------- Startframe ---------------- */
  function renderHome() {
    const s = M.state;
    const fv = $('#fromValue'), tv = $('#toValue');
    if (M.isMe(s.from)) {
      fv.innerHTML = '<span class="loc-ico">' + icon('locate') + '</span>Mein Standort' + (M.Geo.status === 'denied' ? ' <small style="color:var(--late)">(gesperrt)</small>' : '');
      fv.classList.remove('placeholder');
    } else if (s.from) { fv.textContent = s.from.name; fv.classList.remove('placeholder'); }
    else { fv.textContent = 'Startpunkt wählen'; fv.classList.add('placeholder'); }
    if (s.to) { tv.textContent = s.to.name; tv.classList.remove('placeholder'); }
    else { tv.textContent = 'Wohin soll\'s gehen?'; tv.classList.add('placeholder'); }

    $('#timeBtn').innerHTML = icon('clock') + '<span>' + esc(s.time ? (s.arriveBy ? 'An ' : 'Ab ') + M.fmtDayTime(s.time) : 'Jetzt') + '</span>';
    $('#timeBtn').classList.toggle('on', !!s.time);
    const vias = s.via;
    $('#viaBtn').innerHTML = icon('route') + '<span>' + (vias.length ? esc('über ' + vias[0].place.name + (vias.length > 1 ? ' +1' : '')) : 'Über …') + '</span>';
    $('#viaBtn').classList.toggle('on', vias.length > 0);
    $('#viaBtn').title = vias.length ? vias.map((v) => v.place.name + (v.stay ? ' (' + v.stay + ' Min)' : '')).join(', ') : 'Zwischenhalt hinzufügen';

    // Schnellzugriff: gemerkte & letzte Routen
    const routes = M.favs.routes().map((r) => Object.assign({ fav: true }, r)).concat(M.recents.routes()).filter((r, i, a) => a.findIndex((x) => x.key === r.key) === i).slice(0, 6);
    const row = $('#recentRow');
    row.innerHTML = routes.map((r, i) => '<button class="chip" data-r="' + i + '">' + icon(r.fav ? 'star' : 'history') + esc(r.to.name) + '</button>').join('');
    row.querySelectorAll('[data-r]').forEach((b) => b.addEventListener('click', () => {
      const r = routes[+b.dataset.r];
      M.state.from = r.from; M.state.to = r.to; M.state.via = [];
      renderHome(); App.search();
    }));
    requestAnimationFrame(UI.layout);
  }
  App.renderHome = renderHome;

  App.search = function () {
    const s = M.state;
    if (!s.to) { pickTo(); return; }
    if (!s.from) { pickFrom(); return; }
    if (!M.isMe(s.from) && !M.isMe(s.to) && s.from.name === s.to.name) { M.toast('Start und Ziel sind identisch', { type: 'err' }); return; }
    if (M.isMe(s.from) && M.isMe(s.to)) { M.toast('Bitte ein Ziel wählen', { type: 'err' }); return; }
    UI.open('journeys', { query: M.queryFromState() });
  };
  function pickFrom() {
    UI.open('places', { title: 'Woher?', sub: 'Startpunkt wählen', allowMe: true, onPick: (p) => { M.state.from = p; renderHome(); if (M.state.to) App.search(); } });
  }
  function pickTo() {
    UI.open('places', { title: 'Wohin?', sub: 'Ziel wählen', allowMe: true, onPick: (p) => { M.state.to = p; renderHome(); App.search(); } });
  }

  function bindHome() {
    $('#favBtn').innerHTML = icon('star');
    $('#settingsBtn').innerHTML = icon('settings');
    $('#swapBtn').innerHTML = icon('swap');
    $('#layersBtn').innerHTML = icon('layers');
    $('#locateBtn').innerHTML = icon('locate');
    $('#goBtn').innerHTML = '<span>Los</span>' + icon('arrow');
    const ICONS = { departures: 'board', nearby: 'radar', live: 'live', lines: 'lines', tickets: 'ticket', assistant: 'sparkles' };
    M.$$('.tile').forEach((t) => {
      const ico = t.querySelector('.tile-ico');
      ico.innerHTML = icon(ICONS[t.dataset.view]) + (t.dataset.view === 'live' ? '<span class="pulse-dot"></span>' : '');
      t.addEventListener('click', () => UI.open(t.dataset.view, {}));
    });

    $('#fromBtn').addEventListener('click', pickFrom);
    $('#toBtn').addEventListener('click', pickTo);
    $('#swapBtn').addEventListener('click', (e) => {
      const s = M.state; const f = s.from; s.from = s.to; s.to = f;
      e.currentTarget.classList.toggle('spin');
      renderHome();
    });
    $('#timeBtn').addEventListener('click', () => UI.open('time', {}));
    $('#viaBtn').addEventListener('click', () => UI.open('via', {}));
    $('#goBtn').addEventListener('click', App.search);
    $('#settingsBtn').addEventListener('click', () => UI.open('settings', {}));
    $('#favBtn').addEventListener('click', () => UI.open('favorites', {}));
    $('#brandBtn').addEventListener('click', () => UI.home());
    $('#layersBtn').addEventListener('click', () => UI.open('layers', {}));
    $('#locateBtn').addEventListener('click', () => M.Map.locate());
    $('#liveBadge').addEventListener('click', () => UI.open('live', {}));
  }

  /* ---------------- Ereignisse ---------------- */
  function bindEvents() {
    M.on('state', renderHome);
    M.on('home', renderHome);
    M.on('settings', () => {});
    M.on('geo:status', (s) => {
      renderHome();
      if (s === 'denied' && !App._geoWarned) {
        App._geoWarned = true;
        M.toast('Standort gesperrt – Muvit zeigt Magdeburg. Freigabe in den Browser-Einstellungen aktivieren.', { type: 'err', ms: 6000 });
      }
    });
    M.on('place:action', ({ action, place }) => {
      if (action === 'from') { M.state.from = place; renderHome(); if (M.state.to) { UI.home(); App.search(); } else UI.home(); }
      else if (action === 'to') { M.state.to = place; renderHome(); UI.home(); App.search(); }
      else if (action === 'dep') UI.open('departures', { stop: place });
      else if (action === 'nearby') UI.open('nearby', { center: { lat: place.lat, lon: place.lon } });
    });
    M.on('vehicle:select', (v) => UI.open('trip', { tripId: v.tripId }));
    M.on('vehicles:update', (ev) => {
      const b = $('#liveBadge');
      const n = ev && ev.list ? ev.list.length : 0;
      const show = n > 0 && !UI.cur && M.Map.showVehicles;
      b.hidden = !show;
      if (show) b.innerHTML = '<span class="dot"></span>' + n + ' Fahrzeuge live';
    });
    M.on('map:ready', () => { if (M.Map.reloadView) M.Map.reloadView(); });
    mq.addEventListener && mq.addEventListener('change', () => { if (M.settings.theme === 'system') App.applyTheme(); });

    // Escape / Hardware-Zurück
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && UI.cur && !e.target.closest('textarea')) UI.back(); });
    let guard = false;
    const open = UI.open;
    UI.open = function () {
      open.apply(UI, arguments);
      if (!guard) { try { history.pushState({ muvit: 1 }, ''); guard = true; } catch (e) { /* file:// */ } }
    };
    window.addEventListener('popstate', () => {
      guard = false;
      if (UI.stack.length) {
        UI.back();
        if (UI.stack.length) { try { history.pushState({ muvit: 1 }, ''); guard = true; } catch (e) { /* ignore */ } }
      }
    });
  }

  /* ---------------- Start ---------------- */
  function init() {
    const dark = App.applyTheme();
    bindHome();
    bindEvents();
    UI.init();
    renderHome();
    M.Map.init(dark).then(() => {
      M.Geo.start();
      requestAnimationFrame(UI.layout);
    });
    // Deep-Links: ?to=Name / ?view=assistant
    try {
      const q = new URLSearchParams(location.search);
      if (q.get('view') && M.Views[q.get('view')]) setTimeout(() => UI.open(q.get('view'), {}), 600);
    } catch (e) { /* ignore */ }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(window.Muvit = window.Muvit || {});
