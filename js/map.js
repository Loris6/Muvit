/* Muvit – Karte (MapLibre GL + OpenFreeMap / CARTO als Fallback)
 *  - Haltestellen als „H“-Schilder (Zeichen 224)
 *  - Live-Fahrzeuge (Transitous) mit flüssiger Interpolation entlang der Strecke
 *  - Verbindungen & Linienverläufe in Linienfarbe
 */
(function (M) {
  'use strict';

  const DPR = 2;
  const Mp = {
    map: null, ready: false, theme: 'light',
    stopGroups: new Map(), loadedCells: new Set(),
    vehSegs: new Map(), vehModes: null, vehVisible: [], vehAbort: 0,
    showStops: true, showVehicles: true,
    _route: null, _routeMarkers: [], _me: null, _pick: null, _popup: null, _tripVeh: null
  };
  M.Map = Mp;

  /* ---------------- Stil ---------------- */
  function rasterStyle(dark) {
    const v = dark ? 'dark_all' : 'light_all';
    return {
      version: 8, glyphs: M.CONFIG.glyphs,
      sources: {
        carto: {
          type: 'raster', tileSize: 256, maxzoom: 20,
          tiles: ['a', 'b', 'c', 'd'].map((s) => 'https://' + s + '.basemaps.cartocdn.com/' + v + '/{z}/{x}/{y}@2x.png'),
          attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · © <a href="https://carto.com/attributions">CARTO</a>'
        }
      },
      layers: [
        { id: 'bg', type: 'background', paint: { 'background-color': dark ? '#0b0c14' : '#eef0f5' } },
        { id: 'carto', type: 'raster', source: 'carto', paint: dark ? { 'raster-brightness-min': 0.07 } : {} }
      ]
    };
  }
  /** Farben im Stil leicht aufhellen (auch in Ausdrücken wie interpolate/match) */
  function parseColor(v) {
    let m;
    if ((m = /^#([0-9a-f]{3})$/i.exec(v))) return [0, 1, 2].map((i) => parseInt(m[1][i] + m[1][i], 16)).concat(1);
    if ((m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(v))) return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)).concat(m[2] ? parseInt(m[2], 16) / 255 : 1);
    if ((m = /^rgba?\(([^)]+)\)$/i.exec(v))) { const p = m[1].split(/[\s,\/]+/).filter(Boolean).map(parseFloat); return [p[0], p[1], p[2], p[3] == null ? 1 : p[3]]; }
    if ((m = /^hsla?\(([^)]+)\)$/i.exec(v))) {
      const p = m[1].split(/[\s,\/]+/).filter(Boolean).map(parseFloat), h = p[0] / 360, sa = p[1] / 100, l = p[2] / 100;
      const q = l < 0.5 ? l * (1 + sa) : l + sa - l * sa, pp = 2 * l - q;
      const f = (t) => { t = (t + 1) % 1; return 255 * (t < 1 / 6 ? pp + (q - pp) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? pp + (q - pp) * (2 / 3 - t) * 6 : pp); };
      return [f(h + 1 / 3), f(h), f(h - 1 / 3), p[3] == null ? 1 : p[3]];
    }
    return null;
  }
  function lighten(v, k) {
    if (Array.isArray(v)) return v.map((x) => lighten(x, k));
    if (v && typeof v === 'object' && Array.isArray(v.stops)) return Object.assign({}, v, { stops: v.stops.map((st) => [st[0], lighten(st[1], k)]) });
    if (typeof v !== 'string') return v;
    const c = parseColor(v.trim());
    if (!c) return v;
    const ch = c.slice(0, 3).map((x) => Math.round(x + (255 - x) * k));
    return 'rgba(' + ch.join(',') + ',' + c[3] + ')';
  }
  async function loadStyle(dark) {
    const url = dark ? M.CONFIG.styles.dark : M.CONFIG.styles.light;
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 8000);
      const res = await fetch(url, { signal: ctrl.signal });
      clearTimeout(t);
      if (!res.ok) throw new Error('style ' + res.status);
      const style = await res.json();
      style.glyphs = style.glyphs || M.CONFIG.glyphs;
      // dezenter: POI-Icons ausblenden, damit Haltestellen & Fahrzeuge im Vordergrund stehen
      style.layers = (style.layers || []).filter((l) => !/^poi/.test(l.id));
      // dunkle Karte passend zum Sheet – etwas aufgehellt, damit Straßen und Flächen besser zu erkennen sind
      if (dark) style.layers.forEach((l) => {
        if (l.type === 'background') l.paint = Object.assign({}, l.paint, { 'background-color': '#202227' });
        else if ((l.type === 'fill' || l.type === 'line') && l.paint) Object.keys(l.paint).forEach((k) => { if (/color$/.test(k)) l.paint[k] = lighten(l.paint[k], 0.08); });
      });
      return style;
    } catch (e) {
      console.warn('[Muvit] Vektorstil nicht ladbar, nutze Raster-Fallback', e);
      return rasterStyle(dark);
    }
  }
  Mp.setTheme = async function (dark) {
    Mp.theme = dark ? 'dark' : 'light';
    if (!Mp.map) return;
    const style = await loadStyle(dark);
    Mp.map.setStyle(style, { diff: false });
  };

  /* ---------------- Bilder ---------------- */
  function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function hSignImage(size) {
    const s = size * DPR, c = canvas(s, s), x = c.getContext('2d'), r = s / 2;
    x.beginPath(); x.arc(r, r, r - 1, 0, Math.PI * 2); x.fillStyle = '#fff'; x.fill();
    x.beginPath(); x.arc(r, r, r * 0.84, 0, Math.PI * 2); x.fillStyle = '#FFD500'; x.fill();
    x.lineWidth = s * 0.075; x.strokeStyle = '#00843D'; x.stroke();
    x.strokeStyle = '#00843D'; x.lineWidth = s * 0.1; x.lineCap = 'round';
    const a = s * 0.345, b = s * 0.655, t = s * 0.28, u = s * 0.72;
    x.beginPath(); x.moveTo(a, t); x.lineTo(a, u); x.moveTo(b, t); x.lineTo(b, u); x.moveTo(a, r); x.lineTo(b, r); x.stroke();
    return { width: s, height: s, data: x.getImageData(0, 0, s, s).data };
  }
  function arrowImage() {
    const s = 20 * DPR, c = canvas(s, s), x = c.getContext('2d');
    x.fillStyle = '#000';
    x.beginPath(); x.moveTo(s / 2, 2); x.lineTo(s - 6, s - 6); x.lineTo(s / 2, s - 12); x.lineTo(6, s - 6); x.closePath(); x.fill();
    return { width: s, height: s, data: x.getImageData(0, 0, s, s).data };
  }
  function roundRect(x, X, Y, W, H, R) {
    x.beginPath(); x.moveTo(X + R, Y); x.arcTo(X + W, Y, X + W, Y + H, R); x.arcTo(X + W, Y + H, X, Y + H, R);
    x.arcTo(X, Y + H, X, Y, R); x.arcTo(X, Y, X + W, Y, R); x.closePath();
  }
  /** Fahrzeug-Plakette im Haltestellen-Stil: [Tram][4] bzw. (Bus)(73), z. B. veh|4|#8EC33B|#FFFFFF|tram */
  function vehicleImage(id) {
    const [, label, bg, fg, mode, op, rt] = id.split('|');
    const B = 20 * DPR, gap = 3 * DPR, padP = 3 * DPR, pad = 4 * DPR, bw = 1.2 * DPR;
    const meas = canvas(10, 10).getContext('2d');
    const numFont = '700 ' + (11 * DPR) + 'px Rubik, system-ui, sans-serif';
    meas.font = numFont;
    const isTrain = mode === 'regio' || mode === 'fern';
    // Tram und Bus: nur die Liniennummer (kein „Tram“/„Bus“-Zeichen auf der Karte)
    const modeW = isTrain && op === 'db' ? Math.round(B * 34 / 24) : ['sbahn', 'ubahn', 'ferry', 'regio', 'fern'].includes(mode) ? B : 0;
    const lineW = Math.max(B, Math.ceil(meas.measureText(label).width) + 8 * DPR);
    const W = (modeW ? modeW + gap : 0) + lineW + padP * 2, H = B + padP * 2;
    // Platz oben rechts für das Echtzeit-Zeichen
    const ex = 6 * DPR;
    const c = canvas(W + pad * 2 + ex, H + pad * 2 + ex), x = c.getContext('2d');
    x.translate(0, ex);
    const top = pad + padP;
    // dunkle Plakette als Hintergrund (Kontrast auf heller Karte)
    x.shadowColor = 'rgba(0,0,0,.35)'; x.shadowBlur = 3 * DPR; x.shadowOffsetY = 1 * DPR;
    roundRect(x, pad, pad, W, H, mode === 'bus' ? H / 2 : 7 * DPR); x.fillStyle = '#131418'; x.fill();
    x.shadowColor = 'transparent';
    const badge = (X, w, fill, round, text, font, color) => {
      roundRect(x, X, top, w, B, round ? B / 2 : 4 * DPR); x.fillStyle = fill; x.fill();
      x.lineWidth = bw; x.strokeStyle = 'rgba(255,255,255,.8)'; x.stroke();
      if (!text) return;
      x.fillStyle = color; x.font = font; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText(text, X + w / 2, top + B / 2 + DPR * 0.6);
    };
    const glyph = (X, name) => {
      const path = M.icons[name]; if (!path || !window.Path2D) return;
      const s = (B * 0.66) / 24;
      x.save(); x.translate(X + B * 0.17, top + B * 0.17); x.scale(s, s); x.fillStyle = '#FFFFFF'; x.fill(new Path2D(path)); x.restore();
    };
    const small = '700 ' + (6.6 * DPR) + 'px Rubik, system-ui, sans-serif', big = '700 ' + (13 * DPR) + 'px Rubik, system-ui, sans-serif';
    let X = pad + padP;
    if (mode === 'sbahn') badge(X, B, M.DB_COLORS.sbahn, true, 'S', big, '#FFFFFF');
    else if (mode === 'ubahn') badge(X, B, M.DB_COLORS.ubahn, false, 'U', big, '#FFFFFF');
    else if (isTrain && op === 'db') {
      // DB-Logo: weiß, roter Rahmen, rote Buchstaben
      const u = B / 24;
      roundRect(x, X + u, top + u, modeW - 2 * u, B - 2 * u, 3.6 * u); x.fillStyle = '#FFFFFF'; x.fill();
      x.lineWidth = 2 * u; x.strokeStyle = '#EC0016'; x.stroke();
      x.fillStyle = '#EC0016'; x.font = '700 ' + (14 * u) + 'px Arial, Helvetica, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText('DB', X + modeW / 2, top + B / 2 + u);
    } else if (isTrain) { badge(X, B, '#2B2C31', false, '', small, ''); glyph(X, 'train'); }
    else if (mode === 'ferry') { badge(X, B, M.DB_COLORS.ship, false, '', small, ''); glyph(X, 'ferry'); }
    if (modeW) X += modeW + gap;
    badge(X, lineW, bg, mode === 'bus', label, numFont, fg);
    // Echtzeit: dunkler runder Punkt oben rechts mit weißem Funk-Zeichen und weißem Rand (wie in den Listen)
    if (rt === '1') {
      // weiß umrandet, etwas nach links unten versetzt (nicht an der oberen Kante)
      const r = 7.5 * DPR, cx = pad + W - 2.5 * DPR, cy = pad + 1 * DPR;
      x.beginPath(); x.arc(cx, cy, r + 1.6 * DPR, 0, Math.PI * 2); x.fillStyle = '#FFFFFF'; x.fill();
      x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fillStyle = 'rgb(50,50,50)'; x.fill();
      if (window.Path2D && M.icons.rt) {
        const g = (16 * DPR) / 24;
        x.save(); x.translate(cx - 12 * g, cy - 12 * g); x.scale(g, g); x.fillStyle = '#FFFFFF'; x.fill(new Path2D(M.icons.rt)); x.restore();
      }
    }
    return { width: c.width, height: c.height, data: x.getImageData(0, 0, c.width, c.height).data };
  }
  function addImages() {
    const m = Mp.map;
    if (!m.hasImage('h-sign')) m.addImage('h-sign', hSignImage(30), { pixelRatio: DPR });
    if (!m.hasImage('veh-arrow')) m.addImage('veh-arrow', arrowImage(), { pixelRatio: DPR, sdf: true });
  }

  /* ---------------- Quellen & Ebenen ---------------- */
  const EMPTY = { type: 'FeatureCollection', features: [] };
  function addLayers() {
    const m = Mp.map;
    addImages();
    ['me-acc', 'route', 'route-pts', 'stops', 'stations', 'vehicles'].forEach((id) => {
      if (!m.getSource(id)) m.addSource(id, { type: 'geojson', data: EMPTY });
    });
    m.addLayer({ id: 'me-acc', type: 'fill', source: 'me-acc', paint: { 'fill-color': '#3D7BFF', 'fill-opacity': 0.12 } });
    m.addLayer({ id: 'route-glow', type: 'line', source: 'route', filter: ['!', ['get', 'walk']],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': ['get', 'color'], 'line-width': 16, 'line-opacity': 0.22, 'line-blur': 6 } });
    m.addLayer({ id: 'route-casing', type: 'line', source: 'route', filter: ['!', ['get', 'walk']],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#ffffff', 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 5, 16, 10] } });
    m.addLayer({ id: 'route-line', type: 'line', source: 'route', filter: ['!', ['get', 'walk']],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': ['get', 'color'], 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 3, 16, 6.5], 'line-opacity': ['coalesce', ['get', 'opacity'], 1] } });
    m.addLayer({ id: 'route-walk', type: 'line', source: 'route', filter: ['get', 'walk'],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#7C8199', 'line-width': 4, 'line-dasharray': [0.1, 1.8] } });
    m.addLayer({ id: 'route-pts', type: 'circle', source: 'route-pts',
      paint: {
        'circle-radius': ['case', ['get', 'major'], 6.5, 4],
        'circle-color': '#ffffff',
        'circle-stroke-color': ['get', 'color'], 'circle-stroke-width': ['case', ['get', 'major'], 3.5, 2.5]
      } });
    m.addLayer({ id: 'stops', type: 'symbol', source: 'stops', minzoom: 13.5,
      layout: {
        'icon-image': 'h-sign', 'icon-allow-overlap': true, 'icon-ignore-placement': false,
        'icon-size': ['interpolate', ['linear'], ['zoom'], 13.5, 0.55, 15, 0.8, 17, 1.05],
        'symbol-sort-key': ['-', 0, ['get', 'importance']],
        'text-field': ['step', ['zoom'], '', 15.6, ['get', 'name']],
        'text-font': ['Noto Sans Regular'], 'text-size': 12, 'text-offset': [0, 1.35], 'text-anchor': 'top',
        'text-optional': true, 'text-max-width': 9
      },
      paint: {
        'text-color': Mp.theme === 'dark' ? '#E7E9F3' : '#2A2E40',
        'text-halo-color': Mp.theme === 'dark' ? '#0b0c14' : '#ffffff', 'text-halo-width': 1.6
      } });
    // Bahnhöfe: immer sichtbar (auch in der Stadtübersicht), mit Haltestellenschild und Namen
    m.addLayer({ id: 'stations', type: 'symbol', source: 'stations', minzoom: 10,
      layout: {
        'icon-image': 'h-sign', 'icon-allow-overlap': true, 'icon-ignore-placement': false,
        'icon-size': ['interpolate', ['linear'], ['zoom'], 10, 0.5, 12, 0.62, 13.5, 0.75, 15, 0.9, 17, 1.12],
        'symbol-sort-key': ['-', 0, ['get', 'importance']],
        'text-field': ['step', ['zoom'], '', 12.2, ['get', 'name']],
        'text-font': ['Noto Sans Regular'], 'text-size': ['interpolate', ['linear'], ['zoom'], 12, 11, 16, 13],
        'text-offset': [0, 1.3], 'text-anchor': 'top', 'text-optional': true, 'text-max-width': 9
      },
      paint: {
        'text-color': Mp.theme === 'dark' ? '#F2F3F7' : '#1E2233',
        'text-halo-color': Mp.theme === 'dark' ? '#0b0c14' : '#ffffff', 'text-halo-width': 1.6
      } });
    m.addLayer({ id: 'veh-arrow', type: 'symbol', source: 'vehicles', minzoom: 12.5,
      layout: {
        'icon-image': 'veh-arrow', 'icon-size': 0.6, 'icon-rotate': ['get', 'bearing'], 'icon-rotation-alignment': 'map',
        'icon-offset': [0, -27], 'icon-allow-overlap': true, 'icon-ignore-placement': true
      },
      paint: { 'icon-color': ['get', 'color'], 'icon-opacity': ['case', ['get', 'moving'], 1, 0] } });
    m.addLayer({ id: 'vehicles', type: 'symbol', source: 'vehicles',
      layout: {
        'icon-image': ['get', 'icon'], 'icon-allow-overlap': true, 'icon-ignore-placement': true,
        'icon-size': ['interpolate', ['linear'], ['zoom'], 5.5, 0.34, 8.5, 0.42, 10, 0.55, 12, 0.72, 14, 0.9, 16, 1],
        'symbol-sort-key': ['get', 'rank']
      } });
    refreshStopsSource();
    loadStations();
    if (Mp._route) setRouteData(Mp._route);
    updateMeAccuracy();
  }

  /* ---------------- Initialisierung ---------------- */
  Mp.init = async function (dark) {
    Mp.theme = dark ? 'dark' : 'light';
    Mp.showStops = M.settings.showStops !== false;
    Mp.showVehicles = M.settings.showVehicles !== false;
    if (!window.maplibregl) {
      M.toast('Kartenbibliothek konnte nicht geladen werden', { type: 'err' });
      return;
    }
    const style = await loadStyle(dark);
    const m = new maplibregl.Map({
      container: 'map', style, center: [M.CONFIG.center.lon, M.CONFIG.center.lat], zoom: M.CONFIG.zoom,
      attributionControl: false, dragRotate: false, pitchWithRotate: false, maxPitch: 0, fadeDuration: 150
    });
    Mp.map = m;
    m.touchZoomRotate.disableRotation();
    m.addControl(new maplibregl.AttributionControl({
      compact: true,
      customAttribution: 'Fahrplan: <a href="https://transitous.org" target="_blank" rel="noopener">Transitous</a> · <a href="https://v6.db.transport.rest" target="_blank" rel="noopener">DB</a>'
    }), 'top-right');

    m.on('style.load', () => { addLayers(); Mp.ready = true; M.emit('map:ready'); });
    m.once('load', () => {
      // Quellenangabe eingeklappt starten (Info-Button), damit sie keine Bedienelemente verdeckt
      const a = m.getContainer().querySelector('.maplibregl-ctrl-attrib');
      if (a) a.classList.remove('maplibregl-compact-show');
    });
    m.on('styleimagemissing', (e) => {
      if (e.id && e.id.startsWith('veh|') && !m.hasImage(e.id)) {
        try { m.addImage(e.id, vehicleImage(e.id), { pixelRatio: DPR }); } catch (err) { /* doppelt */ }
      }
    });
    m.on('moveend', M.debounce(() => { loadStopsInView(); scheduleVehicles(true); }, 450));
    m.on('dragstart', () => { Mp._userMoved = true; });
    m.on('error', (e) => { if (e && e.error && /style/i.test(String(e.error.message))) console.warn(e.error); });

    // Klicks
    m.on('click', (e) => {
      if (Mp._pick) { const r = Mp._pick; Mp._pick = null; r({ lat: e.lngLat.lat, lon: e.lngLat.lng }); return; }
      const feats = m.queryRenderedFeatures(e.point, { layers: ['vehicles', 'stations', 'stops'].filter((l) => m.getLayer(l)) });
      if (!feats.length) return;
      const f = feats[0];
      if (f.layer.id === 'vehicles') {
        M.emit('vehicle:select', { tripId: f.properties.tripId, name: f.properties.name, mode: f.properties.mode, headsign: f.properties.to });
      } else if (f.layer.id === 'stops' || f.layer.id === 'stations') {
        const g = (f.layer.id === 'stations' ? Mp.stations : Mp.stopGroups).get(f.properties.id);
        if (g) M.emit('place:action', { action: 'dep', place: { id: g.id, name: g.name, lat: g.lat, lon: g.lon, type: 'stop', src: g.src, area: g.area } });
      }
    });
    ['vehicles', 'stops', 'stations'].forEach((l) => {
      m.on('mouseenter', l, () => { m.getCanvas().style.cursor = 'pointer'; });
      m.on('mouseleave', l, () => { m.getCanvas().style.cursor = ''; });
    });
    // Langes Drücken / Rechtsklick → Ort-Aktionen
    m.on('contextmenu', (e) => placePopup(e.lngLat.lat, e.lngLat.lng));
    let pressT = null, pressPt = null;
    m.on('touchstart', (e) => {
      if (e.originalEvent.touches.length !== 1) return;
      pressPt = e.point;
      pressT = setTimeout(() => { placePopup(e.lngLat.lat, e.lngLat.lng); pressT = null; }, 600);
    });
    const cancel = (e) => { if (pressT && (!e || !e.point || !pressPt || Math.hypot(e.point.x - pressPt.x, e.point.y - pressPt.y) > 8)) { clearTimeout(pressT); pressT = null; } };
    m.on('touchend', () => { clearTimeout(pressT); pressT = null; });
    m.on('touchmove', cancel); m.on('movestart', () => cancel());

    startVehicleLoop();
    M.on('geo:update', onGeo);
  };

  /* ---------------- Padding passend zu den Overlays ---------------- */
  Mp.padding = function () {
    const p = (M.UI && M.UI.mapPadding) ? M.UI.mapPadding() : { top: 80, bottom: 80, left: 40, right: 40 };
    return p;
  };
  Mp.flyTo = function (lat, lon, zoom, opts) {
    if (!Mp.map) return;
    Mp.map.easeTo(Object.assign({ center: [lon, lat], zoom: zoom || Math.max(Mp.map.getZoom(), 15), padding: Mp.padding(), duration: 900 }, opts || {}));
  };
  Mp.fitCoords = function (coords, opts) {
    if (!Mp.map || !coords || !coords.length) return;
    const b = new maplibregl.LngLatBounds(coords[0], coords[0]);
    coords.forEach((c) => b.extend(c));
    // MapLibre addiert den bereits gesetzten Kartenrand (Sheet) – deshalb nur die Differenz übergeben
    const want = Mp.padding(), cur = Mp.map.getPadding();
    const pad = {};
    ['top', 'bottom', 'left', 'right'].forEach((k) => { pad[k] = Math.max(0, (want[k] || 0) - (cur[k] || 0)); });
    const o = Object.assign({ padding: pad, duration: 900, maxZoom: 16.5 }, opts || {});
    if (!Mp.map.cameraForBounds(b, o)) { Mp.map.setPadding(want); o.padding = 0; }
    Mp.map.fitBounds(b, o);
  };
  Mp.bounds = function (grow) {
    const b = Mp.map.getBounds(); const g = grow || 0;
    const dLat = (b.getNorth() - b.getSouth()) * g, dLon = (b.getEast() - b.getWest()) * g;
    return { minLat: b.getSouth() - dLat, maxLat: b.getNorth() + dLat, minLon: b.getWest() - dLon, maxLon: b.getEast() + dLon };
  };
  Mp.center = function () { const c = Mp.map ? Mp.map.getCenter() : null; return c ? { lat: c.lat, lon: c.lng } : M.CONFIG.center; };
  Mp.resize = function () { if (Mp.map) Mp.map.resize(); };

  /* ---------------- Mein Standort ---------------- */
  function circlePoly(lat, lon, r) {
    const pts = [], n = 48;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      pts.push([lon + (r / (111320 * Math.cos((lat * Math.PI) / 180))) * Math.cos(a), lat + (r / 111320) * Math.sin(a)]);
    }
    return { type: 'Feature', geometry: { type: 'Polygon', coordinates: [pts] }, properties: {} };
  }
  function updateMeAccuracy() {
    const p = M.Geo.pos, src = Mp.map && Mp.map.getSource('me-acc');
    if (!src) return;
    src.setData(p && p.acc && p.acc < 1500 ? { type: 'FeatureCollection', features: [circlePoly(p.lat, p.lon, p.acc)] } : EMPTY);
  }
  function onGeo(ev) {
    const p = ev.pos;
    if (!Mp.map) return;
    if (!Mp._me) {
      const el = M.h('<div class="me-marker" title="Mein Standort"></div>');
      Mp._me = new maplibregl.Marker({ element: el }).setLngLat([p.lon, p.lat]).addTo(Mp.map);
    } else Mp._me.setLngLat([p.lon, p.lat]);
    updateMeAccuracy();
    if (ev.first && !Mp._route && !Mp._userMoved && (!M.UI || M.UI.isRoot())) Mp.flyTo(p.lat, p.lon, 14.8, { duration: 1400 });
  }
  Mp.locate = async function () {
    try {
      const p = await M.Geo.get(10000);
      Mp.flyTo(p.lat, p.lon, Math.max(15.5, Mp.map.getZoom()));
      return p;
    } catch (e) {
      M.toast('Standort nicht verfügbar. Bitte Standortfreigabe im Browser erlauben.', { type: 'err', ms: 5000 });
      return null;
    }
  };

  /* ---------------- Haltestellen (H-Schilder) ---------------- */
  const CELL_LAT = 0.02, CELL_LON = 0.03;
  async function loadStopsInView() {
    const m = Mp.map;
    if (!m || !Mp.showStops || m.getZoom() < 13.5) return;
    const b = Mp.bounds(0.1);
    const cells = [];
    for (let la = Math.floor(b.minLat / CELL_LAT); la <= Math.floor(b.maxLat / CELL_LAT); la++) {
      for (let lo = Math.floor(b.minLon / CELL_LON); lo <= Math.floor(b.maxLon / CELL_LON); lo++) {
        const k = la + ':' + lo;
        if (!Mp.loadedCells.has(k)) cells.push([la, lo, k]);
      }
    }
    for (const [la, lo, k] of cells.slice(0, 9)) {
      Mp.loadedCells.add(k);
      try {
        const raw = await M.Transit.stopsInBox(la * CELL_LAT, lo * CELL_LON, (la + 1) * CELL_LAT, (lo + 1) * CELL_LON);
        Mp.addStops(raw);
      } catch (e) { Mp.loadedCells.delete(k); break; }
    }
  }
  Mp.addStops = function (raw) {
    // nur Haltestellen im Bediengebiet der MVB
    M.Transit.groupStops((raw || []).filter((x) => M.inService(x.lat, x.lon))).forEach((g) => {
      const key = g.name + '@' + g.lat.toFixed(3) + ',' + g.lon.toFixed(3);
      g.key = key;
      Mp.stopGroups.set(key, g);
    });
    refreshStopsSource();
  };
  /* ---------------- Bahnhöfe (immer sichtbar) ---------------- */
  Mp.stations = new Map();
  let stationsP = null;
  function loadStations() {
    if (stationsP) return stationsP;
    stationsP = M.Transit.stations().then((list) => {
      list.forEach((g) => { const key = 'bf:' + g.name + '@' + g.lat.toFixed(3) + ',' + g.lon.toFixed(3); g.key = key; Mp.stations.set(key, g); });
      refreshStopsSource();
    }).catch((e) => { console.warn('[Muvit] Bahnhöfe nicht geladen', e); stationsP = null; });
    return stationsP;
  }
  /** Haltestelle gehört zu einem Bahnhof (gleicher Name, in der Nähe) – dann zeigt nur der Bahnhof sein Schild */
  const atStation = (g) => { for (const b of Mp.stations.values()) if (M.normStop(b.name) === M.normStop(g.name) && M.dist(b.lat, b.lon, g.lat, g.lon) < 400) return true; return false; };
  const feature = (g, key) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [g.lon, g.lat] }, properties: { id: key, name: g.name, importance: g.importance || 0 } });
  function refreshStopsSource() {
    const src = Mp.map && Mp.map.getSource('stops'), bsrc = Mp.map && Mp.map.getSource('stations');
    if (!src) return;
    const feats = [], bfeats = [];
    if (Mp.showStops) {
      Mp.stopGroups.forEach((g, key) => { if (!atStation(g)) feats.push(feature(g, key)); });
      Mp.stations.forEach((g, key) => bfeats.push(feature(g, key)));
    }
    src.setData({ type: 'FeatureCollection', features: feats });
    if (bsrc) bsrc.setData({ type: 'FeatureCollection', features: bfeats });
  }
  Mp.setShowStops = function (on) { Mp.showStops = on; refreshStopsSource(); if (on) loadStopsInView(); };

  /* ---------------- Popups ---------------- */
  function popup(lat, lon, html, bind) {
    if (Mp._popup) Mp._popup.remove();
    const el = M.h('<div>' + html + '</div>');
    Mp._popup = new maplibregl.Popup({ offset: 16, closeButton: false, maxWidth: '280px' }).setLngLat([lon, lat]).setDOMContent(el).addTo(Mp.map);
    if (bind) bind(el, () => Mp._popup && Mp._popup.remove());
  }
  function placePopup(lat, lon) {
    const place = { id: lat.toFixed(6) + ',' + lon.toFixed(6), name: 'Markierter Ort', lat, lon, type: 'coord', src: 'device' };
    popup(lat, lon,
      '<div class="pop-title" data-name>Markierter Ort</div>' +
      '<div class="pop-actions"><button class="p" data-a="to">Nach hier</button><button data-a="from">Von hier</button><button data-a="nearby">Haltestellen</button></div>',
      (el, close) => {
        el.addEventListener('click', (e) => {
          const a = e.target.closest('button'); if (!a) return;
          close(); M.emit('place:action', { action: a.dataset.a, place });
        });
        M.Transit.reverse(lat, lon).then((r) => {
          if (r && r[0]) { place.name = r[0].name + (r[0].area ? ', ' + r[0].area.split(',')[0] : ''); const t = el.querySelector('[data-name]'); if (t) t.textContent = place.name; }
        }).catch(() => {});
      });
  }
  Mp.closePopup = () => { if (Mp._popup) Mp._popup.remove(); };
  Mp.pickPoint = function () {
    M.toast('Tippe auf die Karte, um einen Ort zu wählen');
    return new Promise((res) => { Mp._pick = res; });
  };

  /* ---------------- Live-Fahrzeuge ---------------- */
  let vehTimer = null, lastFetch = 0;
  function scheduleVehicles(now, force) {
    clearTimeout(vehTimer);
    if (!Mp.showVehicles || !Mp.map) return;
    vehTimer = setTimeout(() => fetchVehicles(force), now ? 50 : 30000);
  }
  /** Muvit zeigt nur Fahrzeuge in Magdeburg (keine Straßenbahnen in Halle, Leipzig usw.) */
  const MD = M.CONFIG.mdBBox;
  const inMd = (p) => p.lat >= MD.minLat && p.lat <= MD.maxLat && p.lon >= MD.minLon && p.lon <= MD.maxLon;
  async function fetchVehicles(force) {
    const m = Mp.map;
    if (!m || !Mp.showVehicles) return;
    if (document.hidden) { scheduleVehicles(); return; }
    const z = m.getZoom();
    if (z < 8.5) { Mp.vehSegs.clear(); Mp.vehVisible = []; Mp._vehBox = null; M.emit('vehicles:update', { list: [], tooFar: true }); scheduleVehicles(); return; }
    // Kartenbewegung innerhalb des schon geladenen Gebiets: nichts neu laden
    // Magdeburg ist immer komplett geladen – Kartenbewegungen brauchen keine neue Abfrage
    if (!force && Mp._vehBox && Date.now() - lastFetch < 25000) { scheduleVehicles(); return; }
    const token = ++Mp.vehAbort;
    const box = Object.assign({ name: 'Magdeburg' }, MD);
    try {
      const segs = await M.Transit.vehicles(box, 14);
      if (token !== Mp.vehAbort) return;
      const byTrip = new Map();
      segs.forEach((s) => {
        let cum = [0];
        for (let i = 1; i < s.coords.length; i++) cum.push(cum[i - 1] + M.dist(s.coords[i - 1][1], s.coords[i - 1][0], s.coords[i][1], s.coords[i][0]));
        s.cum = cum;
        if (!byTrip.has(s.tripId)) byTrip.set(s.tripId, []);
        byTrip.get(s.tripId).push(s);
      });
      byTrip.forEach((arr) => arr.sort((a, b) => a.dep - b.dep));
      Mp.vehSegs = byTrip;
      Mp._vehBox = box; Mp.vehArea = box.name;
      lastFetch = Date.now();
      M.emit('vehicles:loaded', { count: byTrip.size });
    } catch (e) {
      if (e.status === 429) M.toast('Live-Daten: kurze Pause (zu viele Anfragen)', { type: 'err' });
    }
    scheduleVehicles();
  }
  /** Haltezeit an jeder Haltestelle: Die Daten haben oft Ankunft = Abfahrt. Muvit lässt die Bahn kurz vor der
      Ankunftszeit halten und erst kurz nach der Abfahrtszeit losfahren – mit Anfahren und Bremsen. */
  const segDwell = (s) => Math.min(15000, Math.max(0, (s.arr - s.dep) * 0.22));
  function segFrac(s, t) {
    const dw = segDwell(s), span = Math.max(1, s.arr - s.dep - 2 * dw);
    const f = Math.min(1, Math.max(0, (t - s.dep - dw) / span));
    return f * f * (3 - 2 * f);
  }
  function posOnSeg(s, t) {
    const f = segFrac(s, t);
    const total = s.cum[s.cum.length - 1];
    const target = f * total;
    let i = 1;
    while (i < s.cum.length - 1 && s.cum[i] < target) i++;
    const a = s.coords[i - 1], b = s.coords[i];
    const segLen = s.cum[i] - s.cum[i - 1] || 1;
    const r = Math.min(1, Math.max(0, (target - s.cum[i - 1]) / segLen));
    return { lon: a[0] + (b[0] - a[0]) * r, lat: a[1] + (b[1] - a[1]) * r, bearing: M.bearing(a[1], a[0], b[1], b[0]) };
  }
  function vehiclePositions(t) {
    const out = [];
    Mp.vehSegs.forEach((arr, tripId) => {
      let pos = null, seg = arr[0], moving = false;
      for (let i = 0; i < arr.length; i++) {
        const s = arr[i];
        if (t >= s.dep && t <= s.arr) { const f = segFrac(s, t); pos = posOnSeg(s, t); seg = s; moving = f > 0 && f < 1; break; }
        if (t < s.dep) {
          if (i === 0 && s.dep - t > 90000) break;           // fährt erst später los
          const c = s.coords[0], n = s.coords[1] || c;      // steht an der Haltestelle
          pos = { lon: c[0], lat: c[1], bearing: M.bearing(c[1], c[0], n[1], n[0]) }; seg = s; break;
        }
      }
      if (!pos) {
        const last = arr[arr.length - 1];
        if (t > last.arr && t - last.arr < 45000) {
          const c = last.coords[last.coords.length - 1], p = last.coords[last.coords.length - 2] || c;
          pos = { lon: c[0], lat: c[1], bearing: M.bearing(p[1], p[0], c[1], c[0]) }; seg = last;
        }
      }
      if (!pos || !inMd(pos)) return;
      if (Mp.vehModes && !Mp.vehModes.has(seg.line.mode)) return;
      out.push({ tripId, pos, moving, seg });
    });
    return out;
  }
  const RANK = { fern: 6, regio: 5, sbahn: 4, ubahn: 4, tram: 3, bus: 2, ferry: 2, other: 1 };
  function startVehicleLoop() {
    let lastDraw = 0;
    const tick = (ts) => {
      requestAnimationFrame(tick);
      if (ts - lastDraw < 120 || !Mp.map || !Mp.ready) return;
      lastDraw = ts;
      const src = Mp.map.getSource('vehicles');
      if (!src) return;
      if (!Mp.showVehicles) { if (Mp.vehVisible.length) { Mp.vehVisible = []; src.setData(EMPTY); } return; }
      const list = vehiclePositions(Date.now());
      Mp.vehVisible = list;
      src.setData({
        type: 'FeatureCollection',
        features: list.map((v) => {
          const L = v.seg.line;
          return {
            type: 'Feature', geometry: { type: 'Point', coordinates: [v.pos.lon, v.pos.lat] },
            properties: {
              tripId: v.tripId, name: L.name, mode: L.mode, color: L.color, to: v.seg.to || '',
              icon: 'veh|' + L.name.slice(0, 7) + '|' + L.color + '|' + L.text + '|' + L.mode + '|' + (M.isDBLine(L) ? 'db' : '') + '|' + (v.seg.realtime ? '1' : '0'),
              bearing: v.pos.bearing, moving: v.moving, rank: RANK[L.mode] || 1
            }
          };
        })
      });
      if (ts - (Mp._lastEmit || 0) > 1500) { Mp._lastEmit = ts; M.emit('vehicles:update', { list }); }
    };
    requestAnimationFrame(tick);
    document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() - lastFetch > 25000) scheduleVehicles(true); });
  }
  Mp.setShowVehicles = function (on) {
    Mp.showVehicles = on;
    if (on) scheduleVehicles(true, true); else { Mp.vehSegs.clear(); Mp._vehBox = null; clearTimeout(vehTimer); }
  };
  Mp.setVehicleModes = function (set) { Mp.vehModes = set && set.size ? set : null; };
  Mp.refreshVehicles = () => scheduleVehicles(true, true);
  Mp.reloadView = () => { loadStopsInView(); scheduleVehicles(true); };

  /* ---------------- Routen & Linienverläufe ---------------- */
  function setRouteData(r) {
    const m = Mp.map; if (!m) return;
    const s1 = m.getSource('route'), s2 = m.getSource('route-pts');
    if (s1) s1.setData(r ? r.lines : EMPTY);
    if (s2) s2.setData(r ? r.pts : EMPTY);
  }
  function clearMarkers() { Mp._routeMarkers.forEach((mk) => mk.remove()); Mp._routeMarkers = []; }
  function addPin(lat, lon, cls) {
    const el = M.h('<div class="pin ' + cls + '"><span class="pd"></span></div>');
    const mk = new maplibregl.Marker({ element: el, anchor: 'bottom', offset: [0, 4] }).setLngLat([lon, lat]).addTo(Mp.map);
    Mp._routeMarkers.push(mk);
  }
  Mp.clearRoute = function () {
    Mp._route = null; setRouteData(null); clearMarkers();
    if (Mp._tripVeh) { Mp._tripVeh.remove(); Mp._tripVeh = null; }
  };
  Mp.drawJourney = function (j, opts) {
    if (!Mp.map) return;
    opts = opts || {};
    Mp.clearRoute();
    const lines = [], pts = [], all = [];
    j.legs.forEach((l, i) => {
      const color = l.walk ? '#7A7A7E' : M.routeColor(l.line);
      lines.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: l.coords }, properties: { color, walk: l.walk } });
      l.coords.forEach((c) => all.push(c));
      if (!l.walk) {
        pts.push(pt(l.from, color, true), pt(l.to, color, true));
        l.stops.forEach((s) => pts.push(pt(s, color, false)));
      }
    });
    Mp._route = { lines: fc(lines), pts: fc(pts) };
    setRouteData(Mp._route);
    const a = j.legs[0].from, b = j.legs[j.legs.length - 1].to;
    addPin(a.lat, a.lon, 'from'); addPin(b.lat, b.lon, 'to');
    if (opts.fit !== false) Mp.fitCoords(all);
  };
  Mp.drawTrip = function (trip, opts) {
    if (!Mp.map) return;
    opts = opts || {};
    Mp.clearRoute();
    const color = M.routeColor(trip.line);
    const lines = [{ type: 'Feature', geometry: { type: 'LineString', coordinates: trip.coords }, properties: { color, walk: false } }];
    const pts = trip.stops.map((s, i) => pt(s, color, i === 0 || i === trip.stops.length - 1));
    Mp._route = { lines: fc(lines), pts: fc(pts) };
    setRouteData(Mp._route);
    if (opts.fit !== false) Mp.fitCoords(trip.coords.length ? trip.coords : trip.stops.map((s) => [s.lon, s.lat]));
  };
  /** Liniennetz: alle Verläufe in Linienfarbe (Netzplan in der App) */
  Mp.drawNetwork = function (lines, opts) {
    if (!Mp.map) return;
    opts = opts || {};
    Mp.clearRoute();
    const feats = [], all = [], pts = new Map();
    lines.forEach((L) => {
      const color = M.routeColor(L.line);
      (L.variants || [L.main]).slice(0, 3).forEach((v) => {
        if (!v || !v.coords || v.coords.length < 2) return;
        feats.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: v.coords }, properties: { color, walk: false } });
        v.coords.forEach((c) => all.push(c));
        [v.stops[0], v.stops[v.stops.length - 1]].forEach((s) => { if (s) pts.set(s.name, pt(s, color, true)); });
      });
    });
    Mp._route = { lines: fc(feats), pts: fc(Array.from(pts.values())) };
    setRouteData(Mp._route);
    if (opts.fit !== false && all.length) Mp.fitCoords(all);
  };
  /** Fahrzeugmarker für den Linienverlauf */
  Mp.setTripVehicle = function (pos, line) {
    if (!Mp.map) return;
    if (!pos) { if (Mp._tripVeh) { Mp._tripVeh.remove(); Mp._tripVeh = null; } return; }
    if (!Mp._tripVeh) {
      // Karte: Tram und Bus nur mit Liniennummer, Züge mit S-Bahn-/DB-Zeichen
      const el = M.h('<div class="veh-marker">' + (line.mode === 'tram' || line.mode === 'bus' ? '<span class="bds">' + M.C.lineBadge(line) + '</span>' : M.C.badges(line)) + '</div>');
      Mp._tripVeh = new maplibregl.Marker({ element: el }).setLngLat([pos.lon, pos.lat]).addTo(Mp.map);
    } else Mp._tripVeh.setLngLat([pos.lon, pos.lat]);
  };
  function pt(s, color, major) {
    return { type: 'Feature', geometry: { type: 'Point', coordinates: [s.lon, s.lat] }, properties: { color, major } };
  }
  function fc(f) { return { type: 'FeatureCollection', features: f }; }

  /** Haltestellen hervorheben (z. B. „In der Nähe“) */
  Mp.showStopList = function (stops) {
    Mp.addStops(stops.map((g) => ({ id: g.id, name: g.name, lat: g.lat, lon: g.lon, importance: g.importance || 0, src: g.src })));
  };
})(window.Muvit = window.Muvit || {});
