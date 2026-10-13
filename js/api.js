/* Muvit – Datenquellen
 *  1) Transitous (MOTIS 2, https://transitous.org) – Echtzeit-Fahrplandaten für ganz Europa,
 *     inkl. MVB/marego Magdeburg, Live-Fahrzeugpositionen, Linienverläufe.
 *  2) db.transport.rest (Deutsche Bahn) – Fallback + DB-Ticketpreise.
 *  Beide werden auf ein gemeinsames, schlankes Datenmodell normalisiert.
 */
(function (M) {
  'use strict';

  class ApiError extends Error {
    constructor(msg, status, extra) { super(msg); this.status = status || 0; Object.assign(this, extra || {}); }
  }
  M.ApiError = ApiError;

  /* ---------- HTTP mit Timeout, kleinem Cache und Nebenläufigkeitslimit ---------- */
  const cache = new Map();
  let active = 0;
  const queue = [];
  function slot() {
    if (active < 4) { active++; return Promise.resolve(); }
    return new Promise((r) => queue.push(r)).then(() => { active++; });
  }
  function release() { active--; const n = queue.shift(); if (n) n(); }

  async function getJSON(url, opts) {
    opts = opts || {};
    const ttl = opts.ttl == null ? 15000 : opts.ttl;
    const hit = cache.get(url);
    if (hit && Date.now() - hit.t < ttl) return hit.v;
    await slot();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), opts.timeout || 15000);
    if (opts.signal) opts.signal.addEventListener('abort', () => ctrl.abort());
    let res;
    try {
      res = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
    } catch (e) {
      throw new ApiError(e.name === 'AbortError' ? 'Zeitüberschreitung bei der Fahrplanauskunft' : 'Keine Verbindung zum Fahrplan-Server', 0, { network: true });
    } finally { clearTimeout(timer); release(); }
    const ctype = res.headers.get('content-type') || '';
    if (!res.ok) {
      let msg = '';
      try { const b = ctype.includes('json') ? await res.json() : await res.text(); msg = typeof b === 'string' ? b : (b.error || b.message || JSON.stringify(b)); } catch (e) { /* ignore */ }
      if (res.status === 429) throw new ApiError('Zu viele Anfragen – bitte kurz warten', 429);
      throw new ApiError(msg ? String(msg).slice(0, 200) : 'Fehler ' + res.status, res.status, { json: ctype.includes('json') });
    }
    const v = await res.json();
    if (ttl > 0) {
      cache.set(url, { t: Date.now(), v });
      if (cache.size > 300) cache.delete(cache.keys().next().value);
    }
    return v;
  }

  function qs(params) {
    const u = new URLSearchParams();
    Object.keys(params || {}).forEach((k) => {
      let v = params[k];
      if (v == null || v === '' || (Array.isArray(v) && !v.length)) return;
      if (v instanceof Date) v = v.toISOString().replace(/\.\d{3}Z$/, 'Z');
      else if (Array.isArray(v)) v = v.join(',');
      u.set(k, String(v));
    });
    return u.toString();
  }

  /* ---------- Gemeinsame Normalisierung ---------- */
  const d = (v) => (v ? new Date(v) : null);

  function fixMode(mode, name) {
    const n = String(name || '').trim();
    if (/^(ICE|ICD|IC|EC|ECE|EN|NJ|FLX|RJX?|TGV|D)\s?\d/i.test(n)) return 'fern';
    if ((mode === 'regio' || mode === 'other') && /^S\s?\d/i.test(n)) return 'sbahn';
    if (mode === 'other' && /^(RE|RB|IRE|MEX|HBX|RS)\s?\d/i.test(n)) return 'regio';
    return mode;
  }
  function shortName(name, mode) {
    let n = String(name || '').trim();
    n = n.replace(/^(STR|Str|Tram|TRAM|Straßenbahn)\s+/, '').replace(/^(Bus|BUS)\s+/, '');
    if (mode === 'sbahn') n = n.replace(/^S\s+(\d)/, 'S$1');
    return n || '?';
  }
  function mkLine(name, mode, color, textColor, extra) {
    mode = fixMode(mode, name);
    const short = shortName(name, mode);
    const c = M.lineColor(short, mode, color, textColor);
    return Object.assign({ name: short, full: String(name || short), mode, color: c.bg, text: c.fg }, extra || {});
  }
  M.mkLine = mkLine;

  function alertList(arr) {
    const seen = new Set(), out = [];
    (arr || []).forEach((a) => {
      if (!a) return;
      const title = (a.headerText || a.summary || a.title || '').trim();
      const text = (a.descriptionText || a.text || '').trim();
      const key = title + '|' + text.slice(0, 60);
      if ((!title && !text) || seen.has(key)) return;
      seen.add(key); out.push({ title: title || text.slice(0, 80), text: title ? text : '' });
    });
    return out.slice(0, 4);
  }

  /** Ortsnamen ohne „Magdeburg“ (Muvit ist eine Magdeburg-App) */
  const LN = (n) => M.localName(n);

  /** Hinweise aufteilen: Durchläufer („fährt weiter als …“, „kommt als …“) als Info, Baustellen/Umleitungen als Warnung */
  const THRU_RE = /(weiter\s+als|kommt\s+als|kommend\s+als|als\s+(?:Linie|Tram|Bus|STR)\s*\w+\s+weiter|Linienwechsel)/i;
  const WORK_RE = /(Umleitung|umgeleitet|Ersatzverkehr|\bSEV\b|Baustelle|Bauarbeiten|baubedingt|Haltausfall|entfällt|hält nicht|Sperrung|gesperrt)/i;
  function splitInfo(alerts, hints) {
    const out = { alerts: [], notes: [] };
    (alerts || []).forEach((a) => {
      if (THRU_RE.test(a.title + ' ' + (a.text || ''))) out.notes.push({ text: THRU_RE.test(a.title) ? a.title : (a.text || a.title) });
      else out.alerts.push(a);
    });
    (hints || []).forEach((h) => {
      const t = String(h || '').trim();
      if (!t) return;
      if (THRU_RE.test(t)) out.notes.push({ text: t });
      else if (WORK_RE.test(t) && !out.alerts.some((a) => a.title === t)) out.alerts.push({ title: t, text: '' });
    });
    out.notes = out.notes.filter((n, i, arr) => arr.findIndex((m) => m.text === n.text) === i).slice(0, 3);
    return out;
  }
  M.splitInfo = splitInfo;

  /* =====================================================================
     1) Transitous / MOTIS 2
     ===================================================================== */
  const Motis = (function () {
    const base = M.CONFIG.motisBase;
    const verPref = {};

    async function call(key, versions, path, params, opts) {
      const start = verPref[key] || 0;
      const order = versions.slice(start).concat(versions.slice(0, start));
      let lastErr;
      for (let i = 0; i < order.length; i++) {
        const v = order[i];
        try {
          const res = await getJSON(base + '/api/' + v + path + '?' + qs(params), opts);
          verPref[key] = versions.indexOf(v);
          return res;
        } catch (e) {
          lastErr = e;
          // nur bei "Pfad unbekannt" die nächste API-Version probieren
          if (!(e.status === 404 && !e.json) || i === order.length - 1) throw e;
        }
      }
      throw lastErr;
    }

    function modeKey(m) {
      switch (m) {
        case 'TRAM': case 'CABLE_CAR': case 'FUNICULAR': case 'AERIAL_LIFT': case 'AREAL_LIFT': return 'tram';
        case 'BUS': case 'COACH': case 'FLEX': case 'ODM': return 'bus';
        case 'SUBURBAN': return 'sbahn';
        case 'SUBWAY': case 'METRO': return 'ubahn';
        case 'REGIONAL_RAIL': case 'REGIONAL_FAST_RAIL': case 'RAIL': return 'regio';
        case 'HIGHSPEED_RAIL': case 'LONG_DISTANCE': case 'NIGHT_RAIL': return 'fern';
        case 'FERRY': return 'ferry';
        case 'WALK': return 'walk';
        case 'BIKE': case 'RENTAL': return 'bike';
        case 'CAR': case 'CAR_PARKING': case 'CAR_DROPOFF': case 'RIDE_SHARING': return 'other';
        default: return 'other';
      }
    }
    const MODE_OUT = {
      tram: ['TRAM', 'CABLE_CAR', 'FUNICULAR', 'AERIAL_LIFT'], bus: ['BUS', 'COACH'], sbahn: ['SUBURBAN'], ubahn: ['SUBWAY'],
      regio: ['REGIONAL_RAIL', 'REGIONAL_FAST_RAIL', 'RAIL'], fern: ['HIGHSPEED_RAIL', 'LONG_DISTANCE', 'NIGHT_RAIL'], ferry: ['FERRY']
    };
    const modesOut = (keys) => (keys && keys.length ? [].concat.apply([], keys.map((k) => MODE_OUT[k] || [])) : null);

    const lineOf = (o) => mkLine(o.displayName || o.routeShortName || o.tripShortName || '', modeKey(o.mode), o.routeColor, o.routeTextColor,
      { agency: o.agencyName || '', routeId: o.routeId || '', longName: o.routeLongName || '' });

    function placeParam(p) {
      if (p.src === 'motis' && p.type === 'stop' && p.id && !String(p.id).includes(',')) return p.id;
      return p.lat.toFixed(6) + ',' + p.lon.toFixed(6);
    }

    function nMatch(m) {
      const areas = (m.areas || []);
      const def = areas.find((a) => a.default) || areas[0];
      const uniq = areas.find((a) => a.unique && a !== def);
      const type = m.type === 'STOP' ? 'stop' : m.type === 'ADDRESS' ? 'address' : 'poi';
      let name = LN(m.name);
      if (type === 'address') name = (m.street || m.name) + (m.houseNumber ? ' ' + m.houseNumber : '');
      let area;
      if (areas.some((a) => M.isMagdeburgName(a.name))) {
        // in Magdeburg nur den Stadtteil zeigen: „Sudenburg“ statt „Magdeburg, Sudenburg“
        const sub = areas.filter((a) => !M.isMagdeburgName(a.name) && (a.adminLevel || 0) > 8).sort((a, b) => (b.adminLevel || 0) - (a.adminLevel || 0))[0];
        area = sub && sub.name !== name ? sub.name : '';
      } else {
        area = [def && def.name, uniq && uniq.name].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i && v !== name).join(', ');
      }
      return { id: m.id, name, lat: m.lat, lon: m.lon, type, area, zip: m.zip || '', modes: (m.modes || []).map(modeKey), category: m.category || '', src: 'motis' };
    }

    function evt(p, kind, leg) {
      const time = kind === 'dep' ? (p.departure || leg.startTime) : (p.arrival || leg.endTime);
      const planned = kind === 'dep' ? (p.scheduledDeparture || leg.scheduledStartTime) : (p.scheduledArrival || leg.scheduledEndTime);
      return {
        id: p.stopId || '', name: LN(p.name), lat: p.lat, lon: p.lon,
        time: d(time || planned), planned: d(planned || time),
        delay: leg.realTime ? M.delayMin(time, planned) : null,
        platform: p.track || p.scheduledTrack || '', plannedPlatform: p.scheduledTrack || '',
        cancelled: !!p.cancelled, alerts: alertList(p.alerts)
      };
    }

    function nLeg(l, ctx) {
      const mode = modeKey(l.mode);
      const walk = mode === 'walk' || mode === 'bike' || l.mode === 'CAR';
      const g = l.legGeometry;
      const leg = {
        mode: walk ? mode : fixMode(mode, l.displayName || l.routeShortName),
        walk,
        line: walk ? null : lineOf(l),
        headsign: LN(l.headsign || (l.tripTo && l.tripTo.name) || ''),
        tripId: l.tripId || '',
        from: evt(l.from, 'dep', l),
        to: evt(l.to, 'arr', l),
        stops: (l.intermediateStops || []).map((p) => ({
          id: p.stopId || '', name: LN(p.name), lat: p.lat, lon: p.lon,
          arr: d(p.arrival), arrPlanned: d(p.scheduledArrival), dep: d(p.departure), depPlanned: d(p.scheduledDeparture),
          platform: p.track || p.scheduledTrack || '', plannedPlatform: p.scheduledTrack || '', cancelled: !!p.cancelled,
          alerts: alertList(p.alerts)
        })),
        coords: g && g.points ? M.decodePolyline(g.points, g.precision == null ? 6 : g.precision) : [],
        distance: l.distance || (g && g.length) || null,
        duration: (l.duration || 0) / 60,
        realtime: !!l.realTime,
        cancelled: !!l.cancelled,
        alerts: alertList([].concat(l.alerts || [], l.from.alerts || [], l.to.alerts || [])),
        notes: [],
        interline: !!l.interlineWithPreviousLeg,
        wheelchair: l.wheelchairAccessible === 'ACCESSIBLE'
      };
      if (ctx) {
        if (/^(START|Start)$/.test(leg.from.name)) leg.from.name = ctx.fromName;
        if (/^(END|Ende|Ziel)$/.test(leg.to.name)) leg.to.name = ctx.toName;
      }
      if (!leg.coords.length) leg.coords = [[leg.from.lon, leg.from.lat]].concat(leg.stops.map((s) => [s.lon, s.lat]), [[leg.to.lon, leg.to.lat]]);
      const inf = splitInfo(leg.alerts);
      leg.alerts = inf.alerts; leg.notes = inf.notes;
      return leg;
    }

    function nItin(it, ctx) {
      const legs = (it.legs || []).map((l) => nLeg(l, ctx)).filter((l) => !(l.walk && l.duration < 0.5 && (l.distance || 0) < 30));
      if (!legs.length) return null;
      const first = legs[0], last = legs[legs.length - 1];
      const transit = legs.filter((l) => !l.walk);
      return {
        id: it.id || (first.from.planned && first.from.planned.getTime()) + '-' + transit.map((l) => l.line && l.line.name).join('-'),
        dep: d(it.startTime) || first.from.time, arr: d(it.endTime) || last.to.time,
        depPlanned: first.from.planned, arrPlanned: last.to.planned,
        duration: (it.duration || 0) / 60, transfers: it.transfers != null ? it.transfers : Math.max(0, transit.length - 1),
        legs, realtime: legs.some((l) => l.realtime), cancelled: legs.some((l) => l.cancelled),
        src: 'motis'
      };
    }

    function nStopTime(st) {
      const p = st.place || {};
      const planned = p.scheduledDeparture || p.scheduledArrival;
      const rt = p.departure || p.arrival || planned;
      const o = {
        tripId: st.tripId, line: lineOf(st),
        headsign: LN(st.headsign || (st.tripTo && st.tripTo.name) || ''),
        origin: st.tripFrom ? { id: st.tripFrom.stopId || '', name: LN(st.tripFrom.name) } : null,
        dest: st.tripTo ? { id: st.tripTo.stopId || '', name: LN(st.tripTo.name) } : null,
        time: d(rt), planned: d(planned || rt),
        delay: st.realTime ? M.delayMin(rt, planned) : null,
        realtime: !!st.realTime, cancelled: !!(st.cancelled || st.tripCancelled),
        platform: p.track || p.scheduledTrack || '', plannedPlatform: p.scheduledTrack || '',
        stop: { id: p.stopId, name: LN(p.name), lat: p.lat, lon: p.lon, src: 'motis', type: 'stop' },
        alerts: alertList(p.alerts), src: 'motis',
        noPickup: st.pickupDropoffType === 'NOT_ALLOWED',
        wheelchair: st.wheelchairAccessible === 'ACCESSIBLE'
      };
      const inf = splitInfo(o.alerts);
      o.alerts = inf.alerts; o.notes = inf.notes;
      return o;
    }

    return {
      name: 'Transitous',
      modesOut,
      async search(text, near) {
        const c = near || M.CONFIG.center;
        const res = await call('geocode', ['v1'], '/geocode', {
          text, language: 'de', numResults: 10, place: c.lat.toFixed(5) + ',' + c.lon.toFixed(5), placeBias: 3
        }, { ttl: 60000 });
        return (res || []).map(nMatch);
      },
      async reverse(lat, lon) {
        const res = await call('reverse', ['v1'], '/reverse-geocode', { place: lat.toFixed(6) + ',' + lon.toFixed(6) }, { ttl: 120000 });
        return (res || []).map(nMatch);
      },
      async stopsInBox(minLat, minLon, maxLat, maxLon) {
        const res = await call('mapstops', ['v1', 'v6'], '/map/stops', {
          min: minLat.toFixed(5) + ',' + maxLon.toFixed(5),  // unten rechts
          max: maxLat.toFixed(5) + ',' + minLon.toFixed(5)   // oben links
        }, { ttl: 600000 });
        return (res || []).filter((p) => p.stopId).map((p) => ({
          id: p.stopId, parentId: p.parentId || '', name: LN(p.name), lat: p.lat, lon: p.lon,
          importance: p.importance || 0, modes: (p.modes || []).map(modeKey), type: 'stop', src: 'motis'
        }));
      },
      async departures(stop, o) {
        o = o || {};
        const params = { n: o.n || 40, time: o.time || null, mode: modesOut(o.modes), language: 'de', arriveBy: o.arrivals ? true : null };
        if (stop.src === 'motis' && stop.id && stop.type !== 'coord') params.stopId = stop.id;
        else { params.center = stop.lat.toFixed(6) + ',' + stop.lon.toFixed(6); params.radius = 150; }
        const res = await call('stoptimes', ['v5', 'v6', 'v4', 'v1'], '/stoptimes', params, { ttl: 10000 });
        const list = (res.stopTimes || []).map(nStopTime);
        const pl = res.place;
        return { stop: pl ? { id: pl.stopId || stop.id, name: LN(pl.name || stop.name), lat: pl.lat || stop.lat, lon: pl.lon || stop.lon, src: 'motis', type: 'stop' } : stop, list, alerts: alertList(pl && pl.alerts) };
      },
      async journeys(q) {
        const ctx = { fromName: q.from.name, toName: q.to.name };
        const vias = (q.via || []).filter((v) => v.place).slice(0, 2);
        const params = {
          fromPlace: placeParam(q.from), toPlace: placeParam(q.to),
          time: q.time || null, arriveBy: q.arriveBy ? true : null,
          numItineraries: q.n || 5, language: 'de',
          transitModes: modesOut(q.modes), maxTransfers: q.maxTransfers != null ? q.maxTransfers : null,
          pageCursor: q.cursor || null
        };
        if (vias.length) {
          // MOTIS erlaubt als Zwischenhalt nur Haltestellen-IDs
          params.via = vias.map((v) => (v.place.src === 'motis' && v.place.type === 'stop' ? v.place.id : null));
          if (params.via.some((x) => !x)) throw new ApiError('Zwischenhalt muss eine Haltestelle sein', 0, { viaNeedsStop: true });
          params.viaMinimumStay = vias.map((v) => Math.max(0, Math.round(v.stay || 0)));
        }
        const res = await call('plan', ['v5', 'v6', 'v4', 'v3', 'v1'], '/plan', params, { ttl: 20000, timeout: 25000 });
        const list = (res.itineraries || []).map((it) => nItin(it, ctx)).filter(Boolean);
        const direct = (res.direct || []).map((it) => nItin(it, ctx)).filter(Boolean);
        return { list, direct, next: res.nextPageCursor || null, prev: res.previousPageCursor || null, src: 'motis' };
      },
      async trip(tripId) {
        const it = await call('trip', ['v5', 'v6', 'v4', 'v1'], '/trip', { tripId, language: 'de' }, { ttl: 15000 });
        const all = (it.legs || []).map((l) => nLeg(l)).filter((l) => !l.walk);
        if (!all.length) throw new ApiError('Fahrt nicht gefunden', 404);
        // genau eine Fahrt (ein Umlauf, z. B. Westerhüsen → City Carré) – und höchstens die direkt folgende Fahrt
        const mi = Math.max(0, all.findIndex((l) => l.tripId && l.tripId === tripId));
        const L = all[mi];
        const legs = [L];
        for (let k = mi + 1; k < all.length && L.tripId && all[k].tripId === L.tripId; k++) legs.push(all[k]);
        const cont = all[mi + legs.length] || null;
        const rest = [];
        if (cont) for (let k = mi + legs.length; k < all.length && (rest.length === 0 || (cont.tripId && all[k].tripId === cont.tripId)); k++) rest.push(all[k]);
        const stopsOf = (ls) => {
          const out = [];
          ls.forEach((leg, i) => {
            if (i === 0) out.push({ id: leg.from.id, name: leg.from.name, lat: leg.from.lat, lon: leg.from.lon, arr: null, arrPlanned: null, dep: leg.from.time, depPlanned: leg.from.planned, platform: leg.from.platform, plannedPlatform: leg.from.plannedPlatform, cancelled: leg.from.cancelled, alerts: leg.from.alerts });
            leg.stops.forEach((x) => out.push(x));
            out.push({ id: leg.to.id, name: leg.to.name, lat: leg.to.lat, lon: leg.to.lon, arr: leg.to.time, arrPlanned: leg.to.planned, dep: null, depPlanned: null, platform: leg.to.platform, plannedPlatform: leg.to.plannedPlatform, cancelled: leg.to.cancelled, alerts: leg.to.alerts });
          });
          return out;
        };
        const stops = [];
        legs.forEach((leg, i) => {
          if (i === 0) stops.push({ id: leg.from.id, name: leg.from.name, lat: leg.from.lat, lon: leg.from.lon, arr: null, arrPlanned: null, dep: leg.from.time, depPlanned: leg.from.planned, platform: leg.from.platform, plannedPlatform: leg.from.plannedPlatform, cancelled: leg.from.cancelled, alerts: leg.from.alerts });
          leg.stops.forEach((s) => stops.push(s));
          stops.push({ id: leg.to.id, name: leg.to.name, lat: leg.to.lat, lon: leg.to.lon, arr: leg.to.time, arrPlanned: leg.to.planned, dep: null, depPlanned: null, platform: leg.to.platform, plannedPlatform: leg.to.plannedPlatform, cancelled: leg.to.cancelled, alerts: leg.to.alerts });
        });
        return {
          tripId, line: L.line, headsign: L.headsign || stops[stops.length - 1].name, stops,
          wheelchair: legs.some((l) => l.wheelchair),
          coords: [].concat.apply([], legs.map((l) => l.coords)), realtime: legs.some((l) => l.realtime),
          alerts: alertList([].concat.apply([], legs.map((l) => l.alerts))),
          notes: [].concat.apply([], legs.map((l) => l.notes || [])).filter((n, i, a) => a.findIndex((m) => m.text === n.text) === i),
          continues: cont ? { line: cont.line, headsign: cont.headsign || cont.to.name, at: cont.from.name, tripId: cont.tripId || '', src: 'motis' } : null,
          next: cont ? { tripId: cont.tripId || '', line: cont.line, headsign: cont.headsign || cont.to.name, stops: stopsOf(rest), realtime: rest.some((l) => l.realtime), src: 'motis' } : null,
          src: 'motis'
        };
      },
      async vehicles(b, zoom) {
        const now = Date.now();
        const precision = 5;
        const res = await call('maptrips', ['v5', 'v6', 'v4', 'v1'], '/map/trips', {
          min: b.minLat.toFixed(4) + ',' + b.maxLon.toFixed(4), max: b.maxLat.toFixed(4) + ',' + b.minLon.toFixed(4),
          startTime: new Date(now - 60000), endTime: new Date(now + 4 * 60000), zoom: Math.max(1, Math.round(zoom)), precision
        }, { ttl: 8000, timeout: 20000 });
        return (res || []).map((s) => {
          const t = (s.trips && s.trips[0]) || {};
          let coords = M.decodePolyline(s.polyline, precision);
          // Plausibilitätsprüfung: falls der Server eine andere Genauigkeit liefert
          if (coords.length && s.from && Math.abs(coords[0][1] - s.from.lat) > 0.2) {
            for (const p of [6, 7]) {
              const c2 = M.decodePolyline(s.polyline, p);
              if (c2.length && Math.abs(c2[0][1] - s.from.lat) < 0.2) { coords = c2; break; }
            }
          }
          if (coords.length < 2 && s.from && s.to) coords = [[s.from.lon, s.from.lat], [s.to.lon, s.to.lat]];
          const name = t.displayName || t.routeShortName || '';
          return {
            tripId: t.tripId, line: mkLine(name, modeKey(s.mode), s.routeColor, null, { agency: M.lineAgency ? M.lineAgency(fixMode(modeKey(s.mode), name), shortName(name, fixMode(modeKey(s.mode), name))) : '' }),
            from: s.from && LN(s.from.name), to: s.to && LN(s.to.name),
            dep: +new Date(s.departure), arr: +new Date(s.arrival),
            delay: s.realTime ? M.delayMin(s.departure, s.scheduledDeparture) : null,
            realtime: !!s.realTime, coords
          };
        }).filter((s) => s.tripId && s.coords.length >= 2);
      }
    };
  })();

  /* =====================================================================
     2) Deutsche Bahn – db.transport.rest (FPTF)
     ===================================================================== */
  const DB = (function () {
    const base = M.CONFIG.dbBase;
    const get = (path, params, opts) => getJSON(base + path + '?' + qs(params), Object.assign({ timeout: 20000 }, opts));

    const PROD = { nationalExpress: 'fern', national: 'fern', regionalExpress: 'regio', regional: 'regio', suburban: 'sbahn', bus: 'bus', ferry: 'ferry', subway: 'ubahn', tram: 'tram', taxi: 'other' };
    const lineOf = (l) => (l ? mkLine(l.name || l.fahrtNr || '', PROD[l.product] || (l.mode === 'bus' ? 'bus' : 'regio'), null, null, { agency: (l.operator && l.operator.name) || '' }) : null);

    function nLoc(x) {
      if (!x) return null;
      const loc = x.location || x;
      const isStop = x.type === 'stop' || x.type === 'station';
      return {
        id: x.id || (loc.latitude + ',' + loc.longitude), name: LN(x.name || x.address || 'Ort'),
        lat: loc.latitude, lon: loc.longitude, type: isStop ? 'stop' : x.poi ? 'poi' : 'address',
        area: '', distance: x.distance, src: 'db',
        modes: x.products ? Object.keys(x.products).filter((k) => x.products[k]).map((k) => PROD[k]).filter((v, i, a) => v && a.indexOf(v) === i) : []
      };
    }
    function locParams(prefix, p) {
      const o = {};
      if (p.src === 'db' && p.type === 'stop') o[prefix] = p.id;
      else {
        o[prefix + '.latitude'] = p.lat; o[prefix + '.longitude'] = p.lon;
        o[prefix + '.address'] = p.name || 'Standort';
      }
      return o;
    }
    function stopover(s) {
      const st = nLoc(s.stop) || {};
      return {
        id: st.id, name: st.name, lat: st.lat, lon: st.lon,
        arr: d(s.arrival), arrPlanned: d(s.plannedArrival), dep: d(s.departure), depPlanned: d(s.plannedDeparture),
        platform: s.departurePlatform || s.arrivalPlatform || '', plannedPlatform: s.plannedDeparturePlatform || s.plannedArrivalPlatform || '', cancelled: !!s.cancelled
      };
    }
    function nLeg(l) {
      const o = nLoc(l.origin) || {}, t = nLoc(l.destination) || {};
      const walk = !!l.walking;
      const line = walk ? null : lineOf(l.line);
      const leg = {
        mode: walk ? 'walk' : line.mode, walk, line, headsign: LN(l.direction || ''), tripId: l.tripId || '',
        from: { id: o.id, name: o.name, lat: o.lat, lon: o.lon, time: d(l.departure || l.plannedDeparture), planned: d(l.plannedDeparture || l.departure), delay: l.departureDelay != null ? Math.round(l.departureDelay / 60) : null, platform: l.departurePlatform || l.plannedDeparturePlatform || '', plannedPlatform: l.plannedDeparturePlatform || '' },
        to: { id: t.id, name: t.name, lat: t.lat, lon: t.lon, time: d(l.arrival || l.plannedArrival), planned: d(l.plannedArrival || l.arrival), delay: l.arrivalDelay != null ? Math.round(l.arrivalDelay / 60) : null, platform: l.arrivalPlatform || l.plannedArrivalPlatform || '', plannedPlatform: l.plannedArrivalPlatform || '' },
        stops: (l.stopovers || []).slice(1, -1).map(stopover),
        coords: l.polyline && l.polyline.features ? l.polyline.features.map((f) => f.geometry.coordinates) : [],
        distance: l.distance || null,
        realtime: l.departureDelay != null || l.arrivalDelay != null,
        cancelled: !!l.cancelled,
        alerts: alertList((l.remarks || []).filter((r) => r.type === 'warning' || r.type === 'status').map((r) => ({ title: r.summary || '', text: r.text || '' }))),
        notes: []
      };
      if (!walk) {
        const inf = splitInfo(leg.alerts, (l.remarks || []).filter((r) => r.type === 'hint').map((r) => r.text));
        leg.alerts = inf.alerts; leg.notes = inf.notes;
      }
      leg.duration = leg.from.time && leg.to.time ? (leg.to.time - leg.from.time) / 60000 : 0;
      if (leg.coords.length < 2) leg.coords = [[leg.from.lon, leg.from.lat]].concat(leg.stops.map((s) => [s.lon, s.lat]), [[leg.to.lon, leg.to.lat]]);
      return leg;
    }
    function nJourney(j) {
      const legs = (j.legs || []).map(nLeg);
      const first = legs[0], last = legs[legs.length - 1];
      const transit = legs.filter((l) => !l.walk);
      return {
        id: j.refreshToken || String(first.from.planned && first.from.planned.getTime()),
        dep: first.from.time, arr: last.to.time, depPlanned: first.from.planned, arrPlanned: last.to.planned,
        duration: (last.to.time - first.from.time) / 60000, transfers: Math.max(0, transit.length - 1),
        legs, realtime: legs.some((l) => l.realtime), cancelled: legs.some((l) => l.cancelled),
        price: j.price && j.price.amount != null ? { amount: j.price.amount, currency: j.price.currency || 'EUR', hint: j.price.hint || '' } : null,
        src: 'db'
      };
    }
    async function resolveStop(p) {
      if (p.src === 'db' && p.type === 'stop') return p;
      const res = await get('/locations/nearby', { latitude: p.lat, longitude: p.lon, results: 5, distance: 400 }, { ttl: 300000 });
      const list = (res || []).map(nLoc).filter(Boolean);
      const norm = (s) => String(s || '').toLowerCase().replace(/[^a-zäöüß0-9]/g, '');
      return list.find((s) => norm(s.name).includes(norm(p.name)) || norm(p.name).includes(norm(s.name))) || list[0] || null;
    }

    return {
      name: 'Deutsche Bahn',
      async search(text) {
        const res = await get('/locations', { query: text, results: 10, stops: true, addresses: true, poi: true, language: 'de' }, { ttl: 60000 });
        return (res || []).map(nLoc).filter(Boolean);
      },
      async reverse(lat, lon) {
        const res = await get('/locations/nearby', { latitude: lat, longitude: lon, results: 1, distance: 300 }, { ttl: 120000 });
        return (res || []).map(nLoc).filter(Boolean);
      },
      async nearby(lat, lon, radius) {
        const res = await get('/locations/nearby', { latitude: lat, longitude: lon, results: 20, distance: radius || 1000 }, { ttl: 60000 });
        return (res || []).map(nLoc).filter(Boolean);
      },
      async departures(stop, o) {
        o = o || {};
        const s = await resolveStop(stop);
        if (!s) throw new ApiError('Haltestelle nicht gefunden', 404);
        const res = await get('/stops/' + encodeURIComponent(s.id) + (o.arrivals ? '/arrivals' : '/departures'), { when: o.time || null, duration: 90, results: o.n || 40, language: 'de' }, { ttl: 10000 });
        const arr = Array.isArray(res) ? res : (res.departures || res.arrivals || []);
        const list = arr.map((x) => ({
          tripId: x.tripId, line: lineOf(x.line), headsign: LN(x.direction || (x.provenance || '')),
          time: d(x.when || x.plannedWhen), planned: d(x.plannedWhen || x.when),
          delay: x.delay != null ? Math.round(x.delay / 60) : null, realtime: x.delay != null, cancelled: !!x.cancelled,
          platform: x.platform || x.plannedPlatform || '', plannedPlatform: x.plannedPlatform || '',
          stop: nLoc(x.stop) || s, src: 'db',
          ...splitInfo(alertList((x.remarks || []).filter((r) => r.type === 'warning').map((r) => ({ title: r.summary, text: r.text }))),
            (x.remarks || []).filter((r) => r.type === 'hint').map((r) => r.text))
        })).filter((x) => x.line);
        return { stop: s, list, alerts: [] };
      },
      async journeys(q) {
        const params = Object.assign({}, locParams('from', q.from), locParams('to', q.to), {
          results: q.n || 5, stopovers: true, polylines: true, language: 'de',
          transfers: q.maxTransfers != null ? q.maxTransfers : null
        });
        if (q.time) params[q.arriveBy ? 'arrival' : 'departure'] = q.time;
        if (q.cursor) { delete params.departure; delete params.arrival; params[q.cursor.dir === 'earlier' ? 'earlierThan' : 'laterThan'] = q.cursor.ref; }
        const vias = (q.via || []).filter((v) => v.place);
        if (vias.length) {
          const v = await resolveStop(vias[0].place);
          if (v) params.via = v.id;
          if (vias[0].stay) params.transferTime = Math.min(60, vias[0].stay);
        }
        const res = await get('/journeys', params, { ttl: 20000, timeout: 30000 });
        const list = (res.journeys || []).map(nJourney);
        return {
          list, direct: [],
          next: res.laterRef ? { dir: 'later', ref: res.laterRef } : null,
          prev: res.earlierRef ? { dir: 'earlier', ref: res.earlierRef } : null, src: 'db'
        };
      },
      async trip(tripId) {
        const res = await get('/trips/' + encodeURIComponent(tripId), { stopovers: true, polyline: true, language: 'de' }, { ttl: 15000 });
        const t = res.trip || res;
        const stops = (t.stopovers || []).map(stopover);
        const coords = t.polyline && t.polyline.features ? t.polyline.features.map((f) => f.geometry.coordinates) : stops.map((s) => [s.lon, s.lat]);
        return { tripId, line: lineOf(t.line), headsign: LN(t.direction || (stops.length ? stops[stops.length - 1].name : '')), stops, coords, realtime: stops.some((s) => s.dep && s.depPlanned && +s.dep !== +s.depPlanned), alerts: [], src: 'db' };
      },
      /** Günstigster DB-Preis für eine Relation (Fern-/Regionalverkehr), sofern verfügbar */
      async price(from, to, time) {
        const params = Object.assign({}, locParams('from', from), locParams('to', to), { results: 6, tickets: true, language: 'de', stopovers: false });
        if (time) params.departure = time;
        const res = await get('/journeys', params, { ttl: 120000, timeout: 30000 });
        const js = (res.journeys || []).map(nJourney).filter((j) => j.price && j.price.amount > 0);
        if (!js.length) return null;
        js.sort((a, b) => a.price.amount - b.price.amount);
        return { cheapest: js[0], all: js };
      }
    };
  })();

  /* =====================================================================
     Fassade mit automatischem Fallback
     ===================================================================== */
  function providers() {
    return M.settings.provider === 'db' ? [DB, Motis] : [Motis, DB];
  }
  async function withFallback(fn, args) {
    const [a, b] = providers();
    try {
      const r = await a[fn].apply(a, args);
      M.Transit.lastSource = a.name;
      return r;
    } catch (e) {
      if (!b[fn] || e.viaNeedsStop || (e.status && e.status !== 429 && e.status < 500 && e.status !== 404)) throw e;
      console.warn('[Muvit] ' + a.name + ' fehlgeschlagen, nutze ' + b.name, e);
      try {
        const r = await b[fn].apply(b, args);
        M.Transit.lastSource = b.name;
        if (r && typeof r === 'object') r.fallback = b.name;
        return r;
      } catch (e2) { throw e; }
    }
  }

  /* Linien je Haltestelle merken (für Listen wie „Abfahrten / Departure“) */
  const ORDER = { tram: 0, bus: 1, sbahn: 2, ubahn: 3, regio: 4, fern: 5, ferry: 6, other: 7 };
  M.sortLines = (lines) => lines.slice().sort((a, b) => (ORDER[a.mode] - ORDER[b.mode]) || String(a.name).localeCompare(String(b.name), 'de', { numeric: true }));
  function rememberLines(stop, list) {
    if (!stop || !stop.name || !list || !list.length) return;
    const all = M.store.get('stopLines', {});
    const seen = new Map();
    (all[stop.name] || []).concat(list.map((x) => x.line)).forEach((l) => { if (l && !seen.has(l.mode + '|' + l.name)) seen.set(l.mode + '|' + l.name, { name: l.name, full: l.full, mode: l.mode, color: l.color, text: l.text, agency: l.agency || '' }); });
    // Betreiber der Züge merken (die Live-Karte kennt ihn nicht – wichtig für das DB-Logo)
    list.forEach((x) => { if (x.line && x.line.agency && (x.line.mode === 'regio' || x.line.mode === 'fern')) AGENCY[x.line.mode + '|' + x.line.name] = x.line.agency; });
    all[stop.name] = M.sortLines(Array.from(seen.values())).slice(0, 24);
    const keys = Object.keys(all);
    if (keys.length > 120) delete all[keys[0]];
    M.store.set('stopLines', all);
  }
  M.linesForStop = (name) => (M.store.get('stopLines', {})[name] || []);

  const AGENCY = {};
  M.lineAgency = (mode, name) => AGENCY[mode + '|' + name] || '';

  /** Kleine Ergebnis-Ablage für Durchläufer (10 Minuten) */
  const MEMO = new Map();
  function memo(key, fn) {
    const hit = MEMO.get(key);
    if (hit && Date.now() - hit.at < 10 * 60000) return hit.p;
    const e = { at: Date.now(), value: undefined };
    e.p = fn().then((v) => { e.value = v || null; return e.value; }, () => { e.value = null; return null; });
    MEMO.set(key, e);
    return e.p;
  }
  const norm = (n) => M.localName(n || '').toLowerCase().replace(/[^a-z0-9äöüß]/g, '');
  const sameStop = (a, b) => !!(a && b) && ((a.id && b.id && a.id === b.id) || norm(a.name) === norm(b.name));
  const samePlatform = (a, b) => !a || !b || String(a) === String(b);
  /** Fährt das Fahrzeug über sein angezeigtes Ziel hinaus (Ziel ≠ letzter Halt)? → wechselt dort die Linie */
  const isThrough = (x) => !!(x.dest && x.headsign && norm(x.dest.name) !== norm(x.headsign));
  /** Halt, der dem angezeigten Ziel entspricht (vor dem letzten Halt) – dort wechselt die Linie */
  M.headIdx = function (t) {
    const h = norm(t.headsign);
    if (!h) return -1;
    for (let i = 1; i < t.stops.length - 1; i++) if (norm(t.stops[i].name) === h) return i;
    return -1;
  };
  /** Abfahrtstafel aufräumen:
      - Fahrten, die hier enden oder an denen man nicht einsteigen kann, sind keine Abfahrten
      - Ein Fahrzeug, das die Linie wechselt, erscheint in manchen Daten doppelt (alte und neue Linie
        gleichzeitig). Dann bleibt nur die neue Linie – mit „Kommt als …“.
      - nach tatsächlicher Abfahrtszeit sortieren */
  function cleanDepartures(r, stop, o) {
    if (!r || !r.list || (o && o.arrivals)) return r;
    const at = r.stop || stop;
    let list = r.list.filter((x) => !x.noPickup && !(x.dest && sameStop(x.dest, at) && !(x.origin && sameStop(x.origin, at))));
    const drop = new Set();
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j];
        if (!a.line || !b.line || a.line.mode !== b.line.mode || a.line.name === b.line.name) continue;
        if (!a.planned || !b.planned || Math.abs(a.planned - b.planned) > 90000 || !samePlatform(a.platform, b.platform)) continue;
        const ta = isThrough(a), tb = isThrough(b);
        if (ta === tb) continue;
        const ghost = ta ? a : b, real = ta ? b : a;
        drop.add(ghost);
        if (!real.comes) real.comes = { line: ghost.line, from: ghost.origin ? ghost.origin.name : '', tripId: ghost.tripId, src: ghost.src };
      }
    }
    list = list.filter((x) => !drop.has(x)).sort((a, b) => (a.time || 0) - (b.time || 0));
    return Object.assign({}, r, { list });
  }

  /** Zeit auf 10 Minuten abrunden, damit mehrere Abfragen dieselbe Antwort teilen */
  const bucket = (ms) => new Date(Math.floor(ms / 600000) * 600000);

  M.Transit = {
    Motis, DB, lastSource: 'Transitous',
    search: (text, near) => withFallback('search', [text, near]),
    reverse: (lat, lon) => withFallback('reverse', [lat, lon]),
    departures: (stop, o) => withFallback('departures', [stop, o]).then((r) => { r = cleanDepartures(r, stop, o); rememberLines(r.stop || stop, r.list); return r; }),
    journeys: (q) => withFallback('journeys', [q]),
    trip: (tripId, src) => (src === 'db' ? DB.trip(tripId) : withFallback('trip', [tripId])),
    vehicles: (b, z) => Motis.vehicles(b, z),
    stopsInBox: (a, b, c, e) => Motis.stopsInBox(a, b, c, e),
    dbPrice: (f, t, time) => DB.price(f, t, time),

    /** „Fährt weiter als …“: Endet die Fahrt, prüft Muvit, ob an der Endhaltestelle kurz danach
        am selben Bahnsteig eine andere Linie desselben Verkehrsmittels beginnt (Durchläufer). */
    continuation(x) {
      if (!x || !x.tripId || x.src !== 'motis' || !x.line || (x.line.mode !== 'tram' && x.line.mode !== 'bus')) return Promise.resolve(null);
      return memo('c|' + x.tripId, async () => {
        const t = await M.Transit.trip(x.tripId, 'motis');
        if (t.continues) return t.continues;
        const h = M.headIdx(t);
        const end = t.stops[h >= 0 ? h : t.stops.length - 1];
        const arr = end && (end.arrPlanned || end.arr || end.depPlanned || end.dep);
        if (!arr) return null;
        const depHere = end.depPlanned || end.dep || null;   // fährt das Fahrzeug selbst weiter (gleiche Fahrt)?
        const r = await M.Transit.departures({ id: end.id, name: end.name, lat: end.lat, lon: end.lon, type: 'stop', src: 'motis' }, { n: 60, time: bucket(arr.getTime() - 2 * 60000) });
        const c = r.list.filter((d) => d.line.mode === t.line.mode && d.line.name !== t.line.name && !d.cancelled && d.tripId !== x.tripId &&
          ((d.origin && sameStop(d.origin, end)) || (depHere && Math.abs(d.planned - depHere) <= 90000)) &&
          d.planned - arr >= -60000 && d.planned - arr <= 12 * 60000 && samePlatform(d.platform, end.platform))
          .sort((a, b) => a.planned - b.planned)[0];
        if (c) return { line: c.line, headsign: c.headsign, at: end.name, tripId: c.tripId, src: 'motis', time: c.time };
        // Linie der Weiterfahrt unbekannt, aber die Fahrt geht über das Ziel hinaus
        return h >= 0 ? { line: null, headsign: t.stops[t.stops.length - 1].name, at: end.name, tripId: '', src: 'motis' } : null;
      });
    },
    /** „Kommt als …“: Beginnt die Fahrt hier, endet dann kurz vorher am selben Bahnsteig eine andere Linie? */
    comesAs(x) {
      if (!x || !x.tripId || x.src !== 'motis' || !x.line || (x.line.mode !== 'tram' && x.line.mode !== 'bus') || !x.origin || !x.stop || !sameStop(x.origin, x.stop)) return Promise.resolve(null);
      return memo('k|' + x.tripId, async () => {
        const r = await M.Transit.departures(x.stop, { n: 60, arrivals: true, time: bucket(x.planned.getTime() - 14 * 60000) });
        const c = r.list.filter((a) => a.line.mode === x.line.mode && a.line.name !== x.line.name && !a.cancelled && a.dest && sameStop(a.dest, x.stop) &&
          x.planned - a.planned >= -60000 && x.planned - a.planned <= 12 * 60000 && samePlatform(a.platform, x.platform))
          .sort((a, b) => b.planned - a.planned)[0];
        return c ? { line: c.line, from: c.origin ? c.origin.name : '', tripId: c.tripId, src: 'motis' } : null;
      });
    },
    /** Anschlüsse an einem Halt: andere Linien, die 1–10 Minuten nach der Ankunft abfahren */
    connections(s, arr, line, skipTrip) {
      if (!s || !s.id || !arr) return Promise.resolve([]);
      const t0 = +arr;
      return memo('x|' + s.id + '|' + bucket(t0).getTime() + '|' + (line ? line.mode + line.name : ''), async () => {
        const r = await M.Transit.departures({ id: s.id, name: s.name, lat: s.lat, lon: s.lon, type: 'stop', src: 'motis' }, { n: 60, time: bucket(t0) });
        const seen = new Set();
        return r.list.filter((d) => !d.cancelled && d.line && d.tripId !== skipTrip && !(line && d.line.name === line.name && d.line.mode === line.mode) &&
            d.time - t0 >= 60000 && d.time - t0 <= 10 * 60000)
          .filter((d) => { const k = d.line.mode + d.line.name + d.headsign; if (seen.has(k)) return false; seen.add(k); return true; })
          .slice(0, 3).map((d) => ({ line: d.line, headsign: d.headsign, time: d.time, tripId: d.tripId }));
      });
    },
    /** Bekanntes Ergebnis ohne neue Anfrage (für sofortiges Zeichnen) */
    known: (key) => (MEMO.has(key) ? MEMO.get(key).value : undefined),

    /** Stadtteil einer Haltestelle (in Magdeburg), sonst der Ort – gespeichert */
    async district(s) {
      if (!s || s.lat == null) return '';
      const key = s.name + '@' + s.lat.toFixed(3) + ',' + s.lon.toFixed(3);
      const all = M.store.get('districts', {});
      if (key in all) return all[key];
      const r = await M.Transit.reverse(s.lat, s.lon).catch(() => []);
      const hit = (r || []).find((x) => x.area);
      const d = hit ? hit.area : '';
      const keys = Object.keys(all);
      if (keys.length > 400) keys.slice(0, 100).forEach((k) => delete all[k]);
      all[key] = d;
      M.store.set('districts', all);
      return d;
    },

    /** Haltestellen im Umkreis – Entfernung wird selbst ab Geräteposition berechnet */
    async nearby(lat, lon, radius) {
      radius = radius || M.settings.radius || 900;
      const dLat = radius / 111320, dLon = radius / (111320 * Math.cos((lat * Math.PI) / 180));
      let raw;
      try {
        raw = await Motis.stopsInBox(lat - dLat, lon - dLon, lat + dLat, lon + dLon);
      } catch (e) {
        raw = await DB.nearby(lat, lon, radius);
      }
      const groups = M.Transit.groupStops(raw);
      groups.forEach((g) => {
        g.distance = M.dist(lat, lon, g.lat, g.lon);
        g.bearing = M.bearing(lat, lon, g.lat, g.lon);
        g.walk = M.walkMin(g.distance);
      });
      return groups.filter((g) => g.distance <= radius * 1.05).sort((a, b) => a.distance - b.distance);
    },

    /** Bahnsteige/Masten gleichen Namens zu einer Haltestelle zusammenfassen */
    groupStops(list) {
      const out = [];
      (list || []).forEach((s) => {
        const g = out.find((x) => x.name === s.name && M.dist(x.lat, x.lon, s.lat, s.lon) < 250);
        if (g) {
          g.members.push(s);
          g.lat = (g.lat * (g.members.length - 1) + s.lat) / g.members.length;
          g.lon = (g.lon * (g.members.length - 1) + s.lon) / g.members.length;
          g.importance = Math.max(g.importance, s.importance || 0);
          (s.modes || []).forEach((m) => { if (!g.modes.includes(m)) g.modes.push(m); });
        } else {
          out.push({ id: s.parentId || s.id, name: s.name, lat: s.lat, lon: s.lon, importance: s.importance || 0, modes: (s.modes || []).slice(), members: [s], src: s.src, type: 'stop' });
        }
      });
      out.forEach((g) => { if (g.members.length && g.src === 'motis') g.id = g.members[0].id; });
      return out;
    },

    /** Linien in der Umgebung (aus Abfahrten der wichtigsten Haltestellen) */
    async linesNear(lat, lon) {
      let stops = await M.Transit.nearby(lat, lon, 1500).catch(() => []);
      if (!stops.length) throw new ApiError('Keine Haltestellen in der Umgebung gefunden', 404);
      stops = stops.slice().sort((a, b) => (b.importance - a.importance) || (a.distance - b.distance)).slice(0, 4);
      const lines = new Map();
      for (const s of stops) {
        try {
          const dep = await M.Transit.departures(s, { n: 60 });
          dep.list.forEach((x) => {
            const key = x.line.mode + '|' + x.line.name;
            let L = lines.get(key);
            if (!L) { L = { line: x.line, headsigns: new Map(), next: x, stops: new Set() }; lines.set(key, L); }
            L.headsigns.set(x.headsign, (L.headsigns.get(x.headsign) || 0) + 1);
            L.stops.add(s.name);
            if (x.time < L.next.time) L.next = x;
          });
        } catch (e) { /* einzelne Haltestelle überspringen */ }
      }
      const order = { tram: 0, sbahn: 1, ubahn: 2, bus: 3, regio: 4, fern: 5, ferry: 6, other: 7 };
      return Array.from(lines.values()).map((L) => ({
        line: L.line, next: L.next, stops: Array.from(L.stops),
        headsigns: Array.from(L.headsigns.entries()).sort((a, b) => b[1] - a[1]).map((x) => x[0]).slice(0, 3)
      })).sort((a, b) => (order[a.line.mode] - order[b.line.mode]) || a.line.name.localeCompare(b.line.name, 'de', { numeric: true }));
    },

    /** Alle Linien einer Stadt: Abfahrten wichtiger Haltestellen, über das ganze Stadtgebiet verteilt */
    async linesCity(lat, lon, onUpdate) {
      const box = M.cityBox(lat, lon);
      let groups = [];
      try { groups = M.Transit.groupStops(await M.Transit.stopsInBox(box.minLat, box.minLon, box.maxLat, box.maxLon)); } catch (e) { /* unten Fallback */ }
      if (!groups.length) groups = await M.Transit.nearby(lat, lon, 1500).catch(() => []);
      if (!groups.length) throw new ApiError('Keine Haltestellen gefunden', 404);
      // je Rasterfeld (4 × 4) die wichtigste Haltestelle, dazu die wichtigsten der ganzen Stadt
      const R = 4, pick = new Map();
      const cell = (v, a, b) => Math.max(0, Math.min(R - 1, Math.floor(((v - a) / (b - a || 1)) * R)));
      groups.forEach((g) => {
        const k = cell(g.lat, box.minLat, box.maxLat) + ':' + cell(g.lon, box.minLon, box.maxLon);
        const cur = pick.get(k);
        if (!cur || (g.importance || 0) > (cur.importance || 0)) pick.set(k, g);
      });
      const top = groups.slice().sort((a, b) => (b.importance || 0) - (a.importance || 0)).slice(0, 6);
      const seen = new Set(), list = [];
      top.concat(Array.from(pick.values())).forEach((g) => { if (!seen.has(g.name)) { seen.add(g.name); list.push(g); } });
      const lines = new Map();
      const order = { tram: 0, bus: 1, sbahn: 2, ubahn: 3, regio: 4, fern: 5, ferry: 6, other: 7 };
      const result = () => Array.from(lines.values()).map((L) => ({
        line: L.line, next: L.next, stops: Array.from(L.stops),
        headsigns: Array.from(L.headsigns.entries()).sort((a, b) => b[1] - a[1]).map((x) => x[0]).slice(0, 3)
      })).sort((a, b) => ((order[a.line.mode] ?? 9) - (order[b.line.mode] ?? 9)) || a.line.name.localeCompare(b.line.name, 'de', { numeric: true }));
      let i = 0;
      const worker = async () => {
        while (i < list.length) {
          const s = list[i++];
          try {
            const dep = await M.Transit.departures(s, { n: 100 });
            dep.list.forEach((x) => {
              const key = x.line.mode + '|' + x.line.name;
              let L = lines.get(key);
              if (!L) { L = { line: x.line, headsigns: new Map(), next: x, stops: new Set() }; lines.set(key, L); }
              L.headsigns.set(x.headsign, (L.headsigns.get(x.headsign) || 0) + 1);
              L.stops.add(s.name);
              if (x.time < L.next.time) L.next = x;
            });
            if (onUpdate) onUpdate(result());
          } catch (e) { /* einzelne Haltestelle überspringen */ }
        }
      };
      await Promise.all([worker(), worker(), worker()]);
      // Nachtlinien: Abfahrten der wichtigsten Haltestellen in der kommenden Nacht (ca. 1:30 Uhr)
      const bp = M.berlinParts(new Date());
      let night = M.fromBerlin(bp.y, bp.mo, bp.d, 1, 30);
      if (night.getTime() < Date.now() - 3 * 3600000) night = new Date(night.getTime() + 86400000);
      for (const s of top.slice(0, 3)) {
        try {
          const dep = await M.Transit.departures(s, { n: 60, time: night });
          dep.list.forEach((x) => {
            const key = x.line.mode + '|' + x.line.name;
            let L = lines.get(key);
            if (!L) { L = { line: x.line, headsigns: new Map(), next: x, stops: new Set() }; lines.set(key, L); }
            L.headsigns.set(x.headsign, (L.headsigns.get(x.headsign) || 0) + 1);
            L.stops.add(s.name);
          });
          if (onUpdate) onUpdate(result());
        } catch (e) { /* Nachtabfrage optional */ }
      }
      return result();
    },

    /** Freitext → Ort (bevorzugt Haltestellen) */
    async resolvePlace(text, near) {
      if (!text) throw new ApiError('Ort fehlt');
      const t = String(text).trim();
      if (/^(mein standort|hier|meine position|aktueller standort|my location|current location|standort)$/i.test(t)) {
        const p = await M.Geo.get(8000).catch(() => null);
        if (!p) throw new ApiError('Standort nicht verfügbar – bitte Standortfreigabe erlauben');
        return { id: '@me', name: 'Mein Standort', lat: p.lat, lon: p.lon, type: 'coord', src: 'device' };
      }
      const m = t.match(/^(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)$/);
      if (m) return { id: t, name: t, lat: +m[1], lon: +m[2], type: 'coord', src: 'device' };
      const res = await M.Transit.search(t, near || (M.Geo.pos || M.CONFIG.center));
      if (!res.length) throw new ApiError('Ort "' + t + '" nicht gefunden', 404);
      const stop = res.slice(0, 4).find((r) => r.type === 'stop');
      return stop || res[0];
    }
  };

  /** "Mein Standort" in Koordinaten auflösen */
  M.concretePlace = async function (p) {
    if (!p) return null;
    if (!M.isMe(p)) return p;
    const pos = await M.Geo.get(9000);
    return { id: '@me', name: 'Mein Standort', lat: pos.lat, lon: pos.lon, type: 'coord', src: 'device' };
  };
})(window.Muvit = window.Muvit || {});
