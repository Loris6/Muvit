/* Muvit – Start & Verdrahtung */
(function (M) {
  'use strict';

  const UI = M.UI, icon = M.icon;
  const App = M.App = {};

  App.search = function () {
    const s = M.state;
    if (!s.to) { App.pickTo(); return; }
    if (!s.from) s.from = M.MY_LOCATION;
    if (!M.isMe(s.from) && !M.isMe(s.to) && s.from.name === s.to.name) { M.toast('Start und Ziel sind identisch', { type: 'err' }); return; }
    if (M.isMe(s.from) && M.isMe(s.to)) { M.toast('Bitte ein Ziel eingeben', { type: 'err' }); return; }
    UI.home();
    UI.open('journeys', { query: M.queryFromState() });
  };
  App.pickFrom = function () {
    UI.open('places', { title: 'Start', allowMe: true, onPick: (p) => { M.state.from = p; M.emit('state'); if (M.state.to) App.search(); } });
  };
  App.pickTo = function () {
    UI.open('places', { title: 'Ziel', allowMe: true, onPick: (p) => { M.state.to = p; M.emit('state'); App.search(); } });
  };

  function bindEvents() {
    M.on('geo:status', (s) => {
      if (s === 'denied' && !App._geoWarned) {
        App._geoWarned = true;
        M.toast('Standort gesperrt – Muvit zeigt Magdeburg. Freigabe in den Browser-Einstellungen aktivieren.', { type: 'err', ms: 6000 });
      }
    });
    M.on('place:action', ({ action, place }) => {
      if (action === 'from') { M.state.from = place; M.emit('state'); if (M.state.to) App.search(); else UI.home(); }
      else if (action === 'to') { M.state.to = place; M.emit('state'); App.search(); }
      else if (action === 'dep') {
        // Haltestelle auf der Karte: Abfahrten direkt zeigen (ersetzt eine schon offene Haltestelle)
        const top = UI.stack[UI.stack.length - 1];
        const same = top && top.id === 'stop' && top.params.stop && top.params.stop.name === place.name;
        if (!same) UI.open('stop', { stop: place }, top && top.id === 'stop' ? { replace: true } : undefined);
      }
      else if (action === 'nearby') UI.open('departures', { tab: 'near' });
    });
    M.on('vehicle:select', (v) => UI.open('trip', { tripId: v.tripId }));
    document.getElementById('locateBtn').innerHTML = icon('locate');
    document.getElementById('locateBtn').addEventListener('click', () => M.Map.locate());

    // Escape / Hardware-Zurück (Android, iOS-Wischgeste)
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !UI.isRoot() && !e.target.closest('textarea, input')) UI.back(); });
    let guard = false;
    const open = UI.open;
    UI.open = function () {
      open.apply(UI, arguments);
      if (!guard) { try { history.pushState({ muvit: 1 }, ''); guard = true; } catch (e) { /* file:// */ } }
    };
    window.addEventListener('popstate', () => {
      guard = false;
      if (!UI.isRoot()) {
        UI.back();
        if (!UI.isRoot()) { try { history.pushState({ muvit: 1 }, ''); guard = true; } catch (e) { /* ignore */ } }
      }
    });
  }

  function init() {
    document.documentElement.dataset.theme = 'dark';
    UI.init();
    bindEvents();
    UI.home();
    M.Map.init(!!M.settings.mapDark).then(() => {
      M.Geo.start();
      UI.layout();
    });
    try {
      const v = new URLSearchParams(location.search).get('view');
      if (v && M.Views[v] && v !== 'home') setTimeout(() => UI.open(v, {}), 500);
    } catch (e) { /* ignore */ }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(window.Muvit = window.Muvit || {});
