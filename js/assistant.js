/* Muvit KI – Mobilitätsassistent
 *  - Mit API-Schlüssel: Claude (Anthropic SDK, Streaming, Tool-Use) greift auf echte Fahrplan-,
 *    Echtzeit- und Tarifdaten der App zu.
 *  - Ohne Schlüssel: lokaler Assistent, der typische Fragen (Route, Abfahrten, Preise,
 *    Haltestellen in der Nähe, Linien) erkennt und mit denselben Datenquellen beantwortet.
 */
(function (M) {
  'use strict';

  const C = M.C, UI = M.UI, esc = M.esc, icon = M.icon;
  const A = M.Assistant = { history: [], log: [], busy: false };

  /* ---------------- Systemprompt (stabil → cachebar) ---------------- */
  const SYSTEM = [
    'Du bist „Muvit KI“, der Mobilitätsassistent in der App Muvit. Schwerpunkt: Magdeburg (MVB-Straßenbahnen und -Busse, marego-Verbund, S-Bahn Mittelelbe) sowie Bahnreisen in ganz Deutschland (Deutsche Bahn, Regional- und Fernverkehr).',
    '',
    'Wie du arbeitest',
    '- Fahrzeiten, Verbindungen, Abfahrten, Verspätungen, Gleise, Haltestellen und Linienverläufe holst du immer über die Tools – du erfindest nie Zeiten oder Linien. Liefert ein Tool nichts, sag das ehrlich und schlag eine Alternative vor (andere Uhrzeit, nahe Haltestelle).',
    '- Für „von A nach B“ nutzt du plan_journey. Zwischenhalte („über C“) mit Aufenthalt („20 Minuten Aufenthalt“) übergibst du als via mit stay_minutes. Bei mehr als zwei Stopps planst du die Etappen nacheinander: Die nächste Etappe startet zur Ankunftszeit plus Aufenthalt.',
    '- „Hier“, „mein Standort“ oder ein fehlender Start bedeutet den Gerätestandort: übergib dann „Mein Standort“.',
    '- Zeiten gelten in Europe/Berlin. Relative Angaben („morgen um 8“, „in 20 Minuten“) rechnest du mit dem mitgelieferten Kontext in eine konkrete Zeit im Format YYYY-MM-DDTHH:MM um.',
    '- Preise und Tickets: get_tariffs für marego/MVB und das Deutschlandticket, get_db_price für DB-Verbindungen (vor allem Fernverkehr). Nenne den Stand und „ohne Gewähr“. Ist ein Preis nicht hinterlegt, verweise auf die marego-Tarifauskunft statt zu schätzen.',
    '- Für Linienverläufe nutzt du get_trip (mit trip_id aus Abfahrten oder Verbindungen) oder find_line (Liniennummer).',
    '',
    'Antwortstil',
    '- Antworte in der Sprache des Nutzers (standardmäßig Deutsch), freundlich, kurz und konkret.',
    '- Die App zeigt Verbindungen, Abfahrten und Haltestellen aus deinen Tool-Aufrufen automatisch als Karten unter deiner Antwort an. Wiederhole daher keine langen Listen, sondern fasse die beste Option zusammen (Abfahrt, Linie, Umstiege, Ankunft) und ergänze hilfreiche Hinweise wie knappe Umstiege, Verspätungen, Gleise oder das passende Ticket.',
    '- Nutze einfaches Markdown (fett, kurze Listen), keine Tabellen.'
  ].join('\n');

  /* ---------------- Tools ---------------- */
  const MODE_ENUM = ['tram', 'bus', 'sbahn', 'ubahn', 'regio', 'fern', 'ferry'];
  const TOOLS = [
    {
      name: 'search_places',
      description: 'Sucht Haltestellen, Adressen und Orte (Geocoding). Liefert Name, Typ, Gebiet und Koordinaten.',
      input_schema: { type: 'object', properties: {
        query: { type: 'string', description: 'Suchtext, z. B. "Hasselbachplatz" oder "Breiter Weg 10 Magdeburg"' },
        limit: { type: 'integer', description: 'Max. Treffer (Standard 6)' }
      }, required: ['query'] }
    },
    {
      name: 'plan_journey',
      description: 'Sucht echte Verbindungen (inkl. Echtzeit) von A nach B, optional über bis zu 2 Zwischenhalte mit Mindestaufenthalt. Orte als Name, "Mein Standort" oder "lat,lon".',
      input_schema: { type: 'object', properties: {
        from: { type: 'string', description: 'Start, z. B. "Mein Standort" oder "Magdeburg Hbf"' },
        to: { type: 'string', description: 'Ziel' },
        via: { type: 'array', description: 'Zwischenhalte in Reihenfolge', items: { type: 'object', properties: {
          place: { type: 'string' }, stay_minutes: { type: 'integer', description: 'Mindestaufenthalt in Minuten' }
        }, required: ['place'] } },
        datetime: { type: 'string', description: 'Zeit in Europe/Berlin, Format YYYY-MM-DDTHH:MM. Weglassen = jetzt.' },
        arrive_by: { type: 'boolean', description: 'true = datetime ist die gewünschte Ankunftszeit' },
        max_transfers: { type: 'integer' },
        modes: { type: 'array', items: { type: 'string', enum: MODE_ENUM }, description: 'Nur diese Verkehrsmittel. Für Deutschlandticket: alles außer fern.' }
      }, required: ['from', 'to'] }
    },
    {
      name: 'get_departures',
      description: 'Echtzeit-Abfahrten an einer Haltestelle (Linie, Richtung, Zeit, Verspätung, Gleis, trip_id).',
      input_schema: { type: 'object', properties: {
        stop: { type: 'string', description: 'Haltestelle oder "Mein Standort" (nächste Haltestelle)' },
        datetime: { type: 'string', description: 'YYYY-MM-DDTHH:MM, weglassen = jetzt' },
        line: { type: 'string', description: 'Optional: nur diese Linie, z. B. "4" oder "RE1"' },
        limit: { type: 'integer', description: 'Max. Abfahrten (Standard 10)' }
      }, required: ['stop'] }
    },
    {
      name: 'nearby_stops',
      description: 'Haltestellen in der Nähe des Geräts mit selbst berechneter Entfernung, Gehzeit und Himmelsrichtung.',
      input_schema: { type: 'object', properties: {
        radius_m: { type: 'integer', description: 'Umkreis in Metern (Standard 800)' }
      } }
    },
    {
      name: 'get_trip',
      description: 'Linienverlauf einer konkreten Fahrt: alle Halte mit Echtzeit und aktueller Position.',
      input_schema: { type: 'object', properties: { trip_id: { type: 'string' } }, required: ['trip_id'] }
    },
    {
      name: 'find_line',
      description: 'Findet eine Linie (z. B. Straßenbahn 4, Bus 52, S1) in der Umgebung und liefert den Verlauf der nächsten Fahrt.',
      input_schema: { type: 'object', properties: {
        line: { type: 'string' }, near: { type: 'string', description: 'Optional: Ort/Haltestelle, sonst Standort bzw. Kartenmitte' }
      }, required: ['line'] }
    },
    {
      name: 'get_tariffs',
      description: 'Ticketpreise und Tarifinfos für Magdeburg (marego/MVB) und das Deutschlandticket inkl. Stand und Links.',
      input_schema: { type: 'object', properties: {} }
    },
    {
      name: 'get_db_price',
      description: 'Aktueller DB-Ticketpreis (günstigstes Angebot) für eine Relation, sofern online verfügbar.',
      input_schema: { type: 'object', properties: {
        from: { type: 'string' }, to: { type: 'string' }, datetime: { type: 'string' }
      }, required: ['from', 'to'] }
    }
  ];
  TOOLS.forEach((t) => { t.eager_input_streaming = true; });

  /* ---------------- Eingabeprüfung (Eager-Streaming liefert ungeprüfte Inputs) ---------------- */
  function validate(name, input) {
    const tool = TOOLS.find((t) => t.name === name);
    if (!tool) throw new Error('Unbekanntes Tool: ' + name);
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('INVALID_INPUT: Objekt erwartet');
    const sch = tool.input_schema;
    (sch.required || []).forEach((k) => { if (input[k] == null || input[k] === '') throw new Error('INVALID_INPUT: "' + k + '" fehlt'); });
    Object.keys(input).forEach((k) => {
      const p = sch.properties[k]; if (!p || input[k] == null) return;
      const v = input[k];
      const ok = p.type === 'string' ? typeof v === 'string' : p.type === 'integer' ? Number.isInteger(v) || (typeof v === 'number') :
        p.type === 'boolean' ? typeof v === 'boolean' : p.type === 'array' ? Array.isArray(v) : true;
      if (!ok) throw new Error('INVALID_INPUT: "' + k + '" hat falschen Typ');
    });
  }

  /* ---------------- Zusammenfassungen für das Modell ---------------- */
  const T = (d) => (d ? M.fmtTime(d) : null);
  function legSummary(l) {
    if (l.walk) return { fussweg_min: Math.max(1, Math.round(l.duration)), meter: l.distance ? Math.round(l.distance) : undefined, nach: l.to.name };
    return {
      verkehrsmittel: M.modeInfo(l.line.mode).label, linie: l.line.full, richtung: l.headsign,
      ab: l.from.name, abfahrt: T(l.from.time), plan_abfahrt: l.from.delay ? T(l.from.planned) : undefined,
      verspaetung_min: l.realtime ? l.from.delay : undefined, gleis: l.from.platform || undefined,
      an: l.to.name, ankunft: T(l.to.time), halte: l.stops.length + 1, trip_id: l.tripId || undefined,
      ausfall: l.cancelled || undefined, hinweise: l.alerts.length ? l.alerts.map((a) => a.title) : undefined
    };
  }
  function itinSummary(j, i) {
    const est = M.Tariffs.estimate(j);
    return {
      option: i + 1, datum: M.fmtDay(j.dep), abfahrt: T(j.dep), ankunft: T(j.arr), dauer_min: Math.round(j.duration),
      umstiege: j.transfers, echtzeit: j.realtime, ausfall: j.cancelled || undefined,
      ticket: est.title + (est.price != null ? ' (' + M.money(est.price) + ')' : ''),
      db_preis: j.price ? M.money(j.price.amount, j.price.currency) : undefined,
      etappen: j.legs.map(legSummary)
    };
  }
  function depSummary(x) {
    return {
      linie: x.line.full, verkehrsmittel: M.modeInfo(x.line.mode).label, richtung: x.headsign, zeit: T(x.time),
      plan: x.delay ? T(x.planned) : undefined, in_min: M.minsUntil(x.time), verspaetung_min: x.realtime ? x.delay : undefined,
      gleis: x.platform || undefined, ausfall: x.cancelled || undefined, trip_id: x.tripId
    };
  }
  function tripSummary(t) {
    return {
      linie: t.line.full, verkehrsmittel: M.modeInfo(t.line.mode).label, richtung: t.headsign, echtzeit: t.realtime,
      halte: t.stops.map((s) => ({ name: s.name, an: T(s.arr), ab: T(s.dep), verspaetung_min: M.delayMin(s.dep || s.arr, s.depPlanned || s.arrPlanned) || undefined, ausfall: s.cancelled || undefined })),
      hinweise: t.alerts.map((a) => a.title)
    };
  }

  async function toStop(text) {
    const p = await M.Transit.resolvePlace(text, M.Geo.pos || M.Map.center());
    if (p.type === 'stop') return p;
    const near = await M.Transit.nearby(p.lat, p.lon, 700);
    if (!near.length) throw new Error('Keine Haltestelle nahe "' + text + '" gefunden');
    return near[0];
  }

  /* ---------------- Tool-Ausführung (gemeinsam für Claude & lokal) ---------------- */
  async function runTool(name, inp, view) {
    switch (name) {
      case 'search_places': {
        const r = await M.Transit.search(inp.query, M.Geo.pos || M.Map.center());
        return { data: r.slice(0, inp.limit || 6).map((p) => ({ name: p.name, typ: p.type, gebiet: p.area || undefined, lat: +p.lat.toFixed(5), lon: +p.lon.toFixed(5) })) };
      }
      case 'plan_journey': {
        const near = M.Geo.pos || M.Map.center();
        const from = await M.Transit.resolvePlace(inp.from || 'Mein Standort', near);
        const to = await M.Transit.resolvePlace(inp.to, near);
        const vias = [];
        for (const v of (inp.via || [])) {
          const s = await toStop(v.place);
          vias.push({ place: s, stay: Math.max(0, Math.round(v.stay_minutes || 0)) });
        }
        const time = M.parseWhen(inp.datetime);
        const modes = Array.isArray(inp.modes) && inp.modes.length ? inp.modes.filter((m) => MODE_ENUM.includes(m)) : null;
        let res, legsChain = null;
        if (vias.length <= 2) {
          res = await M.Transit.journeys({ from, to, via: vias, time, arriveBy: !!inp.arrive_by, modes, maxTransfers: inp.max_transfers });
        } else {
          // Mehr als 2 Zwischenhalte: Etappen nacheinander planen
          legsChain = [];
          const pts = [from].concat(vias.map((v) => v.place), [to]);
          let t = time;
          for (let i = 0; i < pts.length - 1; i++) {
            const r = await M.Transit.journeys({ from: pts[i], to: pts[i + 1], via: [], time: t, modes });
            const best = r.list[0];
            if (!best) throw new Error('Keine Verbindung für Etappe ' + (i + 1));
            legsChain.push(best);
            t = new Date(best.arr.getTime() + ((vias[i] && vias[i].stay) || 0) * 60000);
          }
          res = { list: legsChain };
        }
        const query = { from, to, via: vias, time, arriveBy: !!inp.arrive_by };
        const list = res.list.slice(0, legsChain ? res.list.length : 4);
        if (view) view.cards({ kind: 'journeys', list, query });
        if (list[0] && view) M.Map.drawJourney(list[0]);
        return {
          data: {
            start: from.name, ziel: to.name,
            zwischenhalte: vias.map((v) => ({ name: v.place.name, aufenthalt_min: v.stay })),
            modus: legsChain ? 'Etappen nacheinander geplant' : undefined,
            verbindungen: list.map(itinSummary),
            zu_fuss: res.direct && res.direct[0] ? { dauer_min: Math.round(res.direct[0].duration) } : undefined,
            quelle: res.fallback || M.Transit.lastSource
          }
        };
      }
      case 'get_departures': {
        const stop = await toStop(inp.stop);
        const r = await M.Transit.departures(stop, { n: 40, time: M.parseWhen(inp.datetime) });
        const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, '');
        let list = r.list.filter((x) => M.minsUntil(x.time) > -1);
        if (inp.line) list = list.filter((x) => norm(x.line.name) === norm(inp.line) || norm(x.line.full) === norm(inp.line));
        list = list.slice(0, inp.limit || 10);
        if (view) view.cards({ kind: 'departures', list: list.slice(0, 6), stop: r.stop || stop });
        return { data: { haltestelle: (r.stop || stop).name, abfahrten: list.map(depSummary), hinweise: (r.alerts || []).map((a) => a.title) } };
      }
      case 'nearby_stops': {
        const pos = await M.Geo.get(9000).catch(() => { throw new Error('Standort nicht verfügbar – bitte Standortfreigabe erlauben'); });
        const list = (await M.Transit.nearby(pos.lat, pos.lon, inp.radius_m || 800)).slice(0, 8);
        if (view) view.cards({ kind: 'nearby', list });
        return { data: list.map((s) => ({ name: s.name, entfernung_m: Math.round(s.distance), gehzeit_min: s.walk, richtung: M.compass(s.bearing) })) };
      }
      case 'get_trip': {
        const t = await M.Transit.trip(inp.trip_id);
        if (view) view.cards({ kind: 'trip', trip: t });
        return { data: tripSummary(t) };
      }
      case 'find_line': {
        const c = inp.near ? await M.Transit.resolvePlace(inp.near) : (M.Geo.pos || M.Map.center());
        const lines = await M.Transit.linesNear(c.lat, c.lon);
        const norm = (s) => String(s || '').toLowerCase().replace(/^(linie|tram|straßenbahn|bus|str)\s*/, '').replace(/\s+/g, '');
        const hit = lines.find((x) => norm(x.line.name) === norm(inp.line) || norm(x.line.full) === norm(inp.line));
        if (!hit) return { data: { gefunden: false, linien_in_der_naehe: lines.slice(0, 25).map((x) => x.line.full + ' (' + M.modeInfo(x.line.mode).label + ')') } };
        const t = await M.Transit.trip(hit.next.tripId, hit.next.src);
        if (view) view.cards({ kind: 'trip', trip: t });
        return { data: Object.assign({ gefunden: true, naechste_abfahrt: { haltestelle: hit.next.stop.name, zeit: T(hit.next.time) }, richtungen: hit.headsigns }, tripSummary(t)) };
      }
      case 'get_tariffs':
        if (view) view.cards({ kind: 'tariffs' });
        return { data: M.Tariffs.forAI() };
      case 'get_db_price': {
        const a = await M.Transit.resolvePlace(inp.from), b = await M.Transit.resolvePlace(inp.to);
        const r = await M.Transit.dbPrice(a, b, M.parseWhen(inp.datetime));
        if (!r) return { data: { verfuegbar: false, hinweis: 'Kein Online-Preis der DB (z. B. reiner Verbundtarif).' } };
        if (view) view.cards({ kind: 'price', price: r.cheapest, from: a.name, to: b.name });
        return { data: { verfuegbar: true, guenstigster: { preis: M.money(r.cheapest.price.amount, r.cheapest.price.currency), abfahrt: T(r.cheapest.dep), ankunft: T(r.cheapest.arr), dauer_min: Math.round(r.cheapest.duration), hinweis: r.cheapest.price.hint || undefined }, weitere: r.all.slice(1, 4).map((j) => ({ preis: M.money(j.price.amount), abfahrt: T(j.dep) })) } };
      }
      default: throw new Error('Unbekanntes Tool');
    }
  }
  const TOOL_LABEL = {
    search_places: 'Suche Orte', plan_journey: 'Suche Verbindungen', get_departures: 'Lade Abfahrten', nearby_stops: 'Finde Haltestellen',
    get_trip: 'Lade Linienverlauf', find_line: 'Suche Linie', get_tariffs: 'Lese Tarife', get_db_price: 'Frage DB-Preis ab'
  };

  /* ---------------- Kontext pro Nachricht (volatil, nach dem Cache-Präfix) ---------------- */
  function contextText() {
    const now = new Date();
    const p = M.Geo.pos;
    const lines = ['[Kontext der App – automatisch]', 'Jetzt: ' + new Intl.DateTimeFormat('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: M.CONFIG.tz }).format(now) + ' (Europe/Berlin, ISO ' + M.toLocalInput(now) + ')'];
    lines.push(p ? 'Gerätestandort: ' + p.lat.toFixed(4) + ', ' + p.lon.toFixed(4) + (M.inMagdeburg(p.lat, p.lon) ? ' (in Magdeburg)' : '') : 'Gerätestandort: unbekannt (Kartenmitte ' + M.Map.center().lat.toFixed(3) + ', ' + M.Map.center().lon.toFixed(3) + ')');
    if (M.state.to) lines.push('Aktuelle Suche in der App: ' + (M.isMe(M.state.from) ? 'Mein Standort' : M.state.from.name) + ' → ' + M.state.to.name);
    return lines.join('\n');
  }

  /* ---------------- SDK laden ---------------- */
  let sdkPromise = null;
  function loadSDK() {
    if (window.AnthropicSDK) return Promise.resolve(window.AnthropicSDK.default || window.AnthropicSDK);
    if (!sdkPromise) {
      sdkPromise = new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = M.CONFIG.sdkPath; s.async = true;
        s.onload = () => res(window.AnthropicSDK.default || window.AnthropicSDK);
        s.onerror = () => { sdkPromise = null; rej(new Error('Claude-SDK konnte nicht geladen werden')); };
        document.head.appendChild(s);
      });
    }
    return sdkPromise;
  }
  function makeClient(Anthropic) {
    return new Anthropic({ apiKey: M.settings.apiKey, dangerouslyAllowBrowser: true, maxRetries: 2 });
  }
  function errMsg(e, S) {
    if (S) {
      if (e instanceof S.AuthenticationError) return 'Der API-Schlüssel ist ungültig. Bitte in den Einstellungen prüfen.';
      if (e instanceof S.PermissionDeniedError) return 'Keine Berechtigung für dieses Modell bzw. diesen Schlüssel.';
      if (e instanceof S.NotFoundError) return 'Modell nicht verfügbar – bitte in den Einstellungen ein anderes Modell wählen.';
      if (e instanceof S.RateLimitError) return 'Zu viele Anfragen an Claude – bitte einen Moment warten.';
      if (e instanceof S.APIConnectionError) return 'Keine Verbindung zu Claude (Netzwerk).';
      if (e instanceof S.APIError) return 'Claude meldet einen Fehler' + (e.status ? ' (' + e.status + ')' : '') + '. Bitte später erneut versuchen.';
    }
    return (e && e.message) || String(e);
  }
  A.testKey = async function () {
    if (!M.settings.apiKey) throw new Error('Bitte zuerst einen API-Schlüssel eingeben');
    const S = await loadSDK();
    try { await makeClient(S).models.retrieve(M.settings.model); } catch (e) { throw new Error(errMsg(e, S)); }
  };
  A.reset = function () { A.history = []; A.log = []; };

  /* ---------------- Claude-Agentenschleife ---------------- */
  async function runClaude(text, view) {
    const S = await loadSDK();
    const client = makeClient(S);
    const model = M.settings.model || 'claude-opus-5-5';
    const histLen = A.history.length;
    A.history.push({ role: 'user', content: [{ type: 'text', text: contextText() }, { type: 'text', text }] });
    let jsonRetries = 0;
    try {
      for (let turn = 0; turn < 10; turn++) {
        const bubble = view.botBubble();
        const params = {
          model, max_tokens: 64000,
          system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
          tools: TOOLS, messages: A.history,
          thinking: { type: 'adaptive' },
          output_config: { effort: M.settings.effort || 'low' }
        };
        // Server-seitiger Fallback bei Ablehnung (Opus/Sonnet auf der Claude API)
        const useFallback = model === 'claude-opus-5-5' || model === 'claude-sonnet-5-5';
        if (useFallback) { params.betas = ['server-side-fallback-2026-07-01']; params.fallbacks = 'default'; }
        const stream = useFallback ? client.beta.messages.stream(params) : client.messages.stream(params);
        let streamed = '';
        stream.on('text', (d) => { streamed += d; bubble.set(streamed); });
        let msg;
        try {
          msg = await stream.finalMessage();
          jsonRetries = 0;
        } catch (err) {
          bubble.remove();
          if (err instanceof S.APIError || jsonRetries++ >= 2) throw err;
          continue; // Tool-Input nicht parsebar → Zug neu anfordern
        }
        if (!streamed.trim()) bubble.remove(); else bubble.done(streamed);
        if (msg.stop_reason === 'refusal') { view.error('Dabei kann ich leider nicht helfen. Frag mich gern etwas zu Verbindungen, Abfahrten oder Tickets.'); A.history.length = histLen; return; }
        A.history.push({ role: 'assistant', content: msg.content });
        if (msg.stop_reason === 'pause_turn') continue;
        const uses = msg.content.filter((b) => b.type === 'tool_use');
        if (!uses.length || msg.stop_reason !== 'tool_use') {
          if (msg.stop_reason === 'max_tokens') view.note('Antwort wurde gekürzt.');
          return;
        }
        const results = await Promise.all(uses.map(async (u) => {
          const chip = view.toolChip(TOOL_LABEL[u.name] || u.name);
          try {
            validate(u.name, u.input);
            const out = await runTool(u.name, u.input, view);
            chip.done();
            return { type: 'tool_result', tool_use_id: u.id, content: JSON.stringify(out.data) };
          } catch (e) {
            chip.fail();
            return { type: 'tool_result', tool_use_id: u.id, is_error: true, content: String((e && e.message) || e) };
          }
        }));
        A.history.push({ role: 'user', content: results });
      }
    } catch (e) {
      // Verlauf konsistent halten: unvollständigen Zug verwerfen
      A.history.length = histLen;
      throw new Error(errMsg(e, S));
    }
  }

  /* ---------------- Lokaler Assistent (ohne API-Schlüssel) ---------------- */
  function cleanPlace(s) {
    return String(s || '').replace(/\b(bitte|heute|morgen|jetzt|sofort|gleich|danke)\b/gi, '')
      .replace(/\b(um|ab|gegen)\s+\d{1,2}([:.]\d{2})?\s*(uhr)?/gi, '').replace(/[?!.]+$/g, '').replace(/\s{2,}/g, ' ').trim();
  }
  function parseTime(lower) {
    const m = lower.match(/\b(?:um|ab|gegen|bis)\s+(\d{1,2})(?:[:.](\d{2}))?\s*(?:uhr)?/);
    const rel = lower.match(/\bin\s+(\d{1,3})\s*(?:min|minuten)\b/);
    if (rel) return new Date(Date.now() + +rel[1] * 60000);
    if (!m) return /\bmorgen\b/.test(lower) ? (() => { const p = M.berlinParts(new Date(Date.now() + 864e5)); return M.fromBerlin(p.y, p.mo, p.d, 8, 0); })() : null;
    const base = /\bmorgen\b/.test(lower) ? new Date(Date.now() + 864e5) : new Date();
    const p = M.berlinParts(base);
    return M.fromBerlin(p.y, p.mo, p.d, +m[1], m[2] ? +m[2] : 0);
  }
  function parseStay(lower) {
    const m = lower.match(/(\d{1,3})\s*(min|minuten|std|stunden?|h)\b[^.?!]*?(aufenthalt|pause|bleiben|halt|stopp|zeit)|(aufenthalt|pause)\s*(?:von)?\s*(\d{1,3})\s*(min|minuten|std|stunden?|h)\b/);
    if (!m) return 0;
    const n = +(m[1] || m[5]), u = m[2] || m[6];
    return /^(std|stunde|stunden|h)$/.test(u) ? n * 60 : n;
  }
  async function runLocal(text, view) {
    const lower = text.toLowerCase();
    let m;
    const arriveBy = /\b(ankunft|ankommen|da sein|spätestens)\b/.test(lower);
    // Route mit optionalem Zwischenhalt
    m = text.match(/(?:von|ab)\s+(.+?)\s+(?:nach|zum|zur|zu|bis)\s+(.+?)(?:\s+(?:über|via)\s+(.+?))?(?:\s+(?:mit|und|inkl\.?)\s+.*?(?:aufenthalt|pause).*)?[?.!]*$/i);
    let from, to, via;
    if (m) { from = cleanPlace(m[1]); to = cleanPlace(m[2]); via = m[3] ? cleanPlace(m[3]) : null; }
    else {
      m = text.match(/(?:wie\s+komme\s+ich|wie\s+komm\s+ich|route|weg|verbindung)\s+(?:nach|zum|zur|zu|in\s+die|in\s+den|ins|bis)\s+(.+?)(?:\s+(?:über|via)\s+(.+?))?(?:\s+(?:mit|und)\s+.*?(?:aufenthalt|pause).*)?[?.!]*$/i);
      if (m) { from = 'Mein Standort'; to = cleanPlace(m[1]); via = m[2] ? cleanPlace(m[2]) : null; }
    }
    if (from && to) {
      const stay = parseStay(lower);
      const time = parseTime(lower);
      const inp = { from, to };
      if (via) inp.via = [{ place: via, stay_minutes: stay }];
      if (time) inp.datetime = M.toLocalInput(time);
      if (time && arriveBy) inp.arrive_by = true;
      const chip = view.toolChip(TOOL_LABEL.plan_journey);
      try {
        const out = await runTool('plan_journey', inp, view);
        chip.done();
        const v = out.data.verbindungen[0];
        if (!v) return 'Ich habe leider keine Verbindung von **' + esc(out.data.start) + '** nach **' + esc(out.data.ziel) + '** gefunden. Probier eine andere Uhrzeit oder Haltestelle.';
        const tl = v.etappen.filter((e) => e.linie).map((e) => '**' + esc(e.linie) + '** ab ' + esc(e.ab) + ' um ' + e.abfahrt + (e.gleis ? ' (Gl. ' + esc(e.gleis) + ')' : '')).join(', dann ');
        return 'Beste Verbindung von **' + esc(out.data.start) + '** nach **' + esc(out.data.ziel) + '**' +
          (out.data.zwischenhalte.length ? ' über **' + esc(out.data.zwischenhalte[0].name) + '**' + (out.data.zwischenhalte[0].aufenthalt_min ? ' (' + out.data.zwischenhalte[0].aufenthalt_min + ' Min Aufenthalt)' : '') : '') + ':\n' +
          '- Abfahrt **' + v.abfahrt + '**, Ankunft **' + v.ankunft + '** (' + M.fmtDur(v.dauer_min) + ', ' + (v.umstiege ? v.umstiege + '× umsteigen' : 'ohne Umstieg') + ')\n' +
          (tl ? '- ' + tl + '\n' : '') + '- Ticket: ' + esc(v.ticket) + '\n\nTippe auf eine Karte für alle Details.';
      } catch (e) { chip.fail(); throw e; }
    }
    // Preise & Tickets
    if (/(preis|kost|ticket|fahrkarte|fahrschein|tarif|deutschlandticket|d-ticket|einzelfahrt|kurzstrecke|tageskarte|24.?stunden|abo)/.test(lower)) {
      const t = M.Tariffs;
      view.cards({ kind: 'tariffs' });
      const e = t.products[0], k = t.products[1], dt = t.products.find((p) => p.id === 'dt');
      return '**Tickets in Magdeburg** (marego, Stand ' + t.stand + ', ohne Gewähr):\n' +
        '- Einzelfahrt (Preisstufe MD): **' + M.money(e.price) + '**, per App ' + M.money(e.app) + ' · Kind ' + M.money(e.child) + '\n' +
        '- Kurzstrecke: **' + M.money(k.price) + '**, per App ' + M.money(k.app) + '\n' +
        '- 24-Stunden-Karte: lohnt sich ab der 2. Fahrt – Preis siehe marego-Tarifauskunft\n' +
        '- Deutschlandticket: **' + M.money(dt.price) + ' im Monat**, bundesweit im Nahverkehr (nicht ICE/IC/EC)\n\nFür DB-Fernverkehr kann ich dir mit einer konkreten Strecke den Live-Preis abfragen.';
    }
    // Haltestellen in der Nähe
    if (/(in der nähe|nächste haltestelle|naechste haltestelle|haltestellen?\s+(hier|um mich|in meiner nähe)|wo ist die nächste)/.test(lower)) {
      const chip = view.toolChip(TOOL_LABEL.nearby_stops);
      const out = await runTool('nearby_stops', {}, view).catch((e) => { chip.fail(); throw e; });
      chip.done();
      if (!out.data.length) return 'In deiner Nähe habe ich keine Haltestelle gefunden.';
      const n = out.data[0];
      return 'Die nächste Haltestelle ist **' + esc(n.name) + '** – ' + M.fmtDist(n.entfernung_m) + ' Richtung ' + n.richtung + ', etwa ' + n.gehzeit_min + ' Min zu Fuß.' +
        (out.data.length > 1 ? ' Außerdem in der Nähe: ' + out.data.slice(1, 4).map((s) => esc(s.name) + ' (' + M.fmtDist(s.entfernung_m) + ')').join(', ') + '.' : '');
    }
    // Linie
    m = lower.match(/\b(?:linie|tram|straßenbahn|strassenbahn|bus|s-?bahn)\s*([a-z]{0,3}\s?\d{1,4})\b/);
    if (m && !/abfahrt/.test(lower)) {
      const chip = view.toolChip(TOOL_LABEL.find_line);
      const out = await runTool('find_line', { line: m[1].replace(/\s+/g, '') }, view).catch((e) => { chip.fail(); throw e; });
      chip.done();
      if (!out.data.gefunden) return 'Die Linie **' + esc(m[1]) + '** habe ich in der Umgebung nicht gefunden. Hier fahren z. B.: ' + esc(out.data.linien_in_der_naehe.slice(0, 12).join(', ')) + '.';
      return '**' + esc(out.data.linie) + '** → ' + esc(out.data.richtung) + ': nächste Abfahrt um **' + out.data.naechste_abfahrt.zeit + '** ab ' + esc(out.data.naechste_abfahrt.haltestelle) + '. Die Fahrt hat ' + out.data.halte.length + ' Halte – öffne den Linienverlauf für die Live-Position.';
    }
    // Abfahrten
    m = text.match(/(?:abfahrten?|abfahrtszeiten|wann\s+fährt|was\s+fährt|nächste\s+(?:bahn|tram|straßenbahn|bus|zug))\s*(?:(?:an|am|ab|von|in|vom|der|die|beim)\s+)*(?:haltestelle\s+)?(.+?)[?.!]*$/i);
    const depStop = m ? cleanPlace(m[1])
      .replace(/^(?:(?:die|der|das|den)\s+)?(?:nächsten?\s+)?(?:(?:bahn|tram|straßenbahn|strassenbahn|bus|zug|s-?bahn)(?![\wäöüß]))?\s*(?:(?:an|am|ab|von|vom|beim|in|der|die)\s+)*/i, '')
      .replace(/^haltestelle\s+/i, '').trim() : '';
    if (depStop.length > 1) {
      const chip = view.toolChip(TOOL_LABEL.get_departures);
      const out = await runTool('get_departures', { stop: depStop, limit: 8 }, view).catch((e) => { chip.fail(); throw e; });
      chip.done();
      const d = out.data.abfahrten;
      if (!d.length) return 'An **' + esc(out.data.haltestelle) + '** fährt in nächster Zeit nichts ab.';
      return 'Nächste Abfahrten an **' + esc(out.data.haltestelle) + '**:\n' + d.slice(0, 4).map((x) => '- **' + esc(x.linie) + '** → ' + esc(x.richtung) + ': ' + (x.in_min <= 0 ? 'jetzt' : 'in ' + x.in_min + ' Min') + (x.verspaetung_min > 0 ? ' (+' + x.verspaetung_min + ')' : '')).join('\n');
    }
    return 'Ich bin gerade im **Basis-Modus** (ohne Claude-API-Schlüssel) und verstehe vor allem diese Fragen:\n' +
      '- „Von **Hasselbachplatz** nach **Hauptbahnhof** über **Alter Markt** mit 20 Min Aufenthalt“\n' +
      '- „Wie komme ich zum **Elbauenpark** um 18 Uhr?“\n- „Abfahrten am **Alten Markt**“\n- „Was kostet ein Ticket?“\n- „Haltestellen in der Nähe“ · „Linie 4“\n\n' +
      'Für freie Fragen aller Art hinterlege in den **Einstellungen** einen Anthropic-API-Schlüssel – dann antwortet Claude.';
  }

  /* ---------------- Markdown (klein & sicher) ---------------- */
  function md(src) {
    let s = esc(src);
    s = s.replace(/`([^`\n]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>')
      .replace(/(^|[^*\w])\*([^*\n]+)\*(?!\w)/g, '$1<i>$2</i>')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    let out = '', list = null;
    s.split('\n').forEach((line) => {
      const ul = line.match(/^\s*[-•*]\s+(.*)/), ol = line.match(/^\s*\d+[.)]\s+(.*)/), h = line.match(/^#{1,4}\s+(.*)/);
      if (ul || ol) {
        const tag = ul ? 'ul' : 'ol';
        if (list !== tag) { if (list) out += '</' + list + '>'; out += '<' + tag + '>'; list = tag; }
        out += '<li>' + (ul || ol)[1] + '</li>'; return;
      }
      if (list) { out += '</' + list + '>'; list = null; }
      if (h) out += '<h4>' + h[1] + '</h4>';
      else if (line.trim()) out += '<p>' + line + '</p>';
    });
    if (list) out += '</' + list + '>';
    return out;
  }
  // Markdown der lokalen Antworten ist bereits escaped → ohne erneutes Escaping rendern
  function mdTrusted(src) { return md(src.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")); }

  /* =====================================================================
     Ansicht: Assistance (Chat im Sheet – Karte bleibt im Hintergrund sichtbar)
     ===================================================================== */
  const SUGGEST = [
    ['route', 'Wie komme ich jetzt zum Hauptbahnhof?'],
    ['transfer', 'Von Hasselbachplatz nach Barleber See über Alter Markt mit 20 Min Aufenthalt'],
    ['busFront', 'Nächste Abfahrten am Alten Markt'],
    ['ticketV', 'Was kostet eine Fahrt in Magdeburg – lohnt sich das Deutschlandticket?'],
    ['train', 'Schnellste Verbindung von Magdeburg nach Berlin morgen um 8 Uhr inkl. Preis']
  ];

  M.Views.assistant = {
    height: 0.95,
    render(ctx) {
      const hasKey = !!M.settings.apiKey;
      ctx.head({
        title: 'Assistance',
        actions: [{ icon: 'trash', label: 'Chat leeren', onClick: () => { A.reset(); UI.refresh(); } }, { icon: 'settings', label: 'Einstellungen', onClick: () => UI.open('settings') }]
      });
      ctx.flexBody();
      ctx.body.innerHTML =
        '<div class="chat-log" data-log></div>' +
        '<div class="chat-mode' + (hasKey ? '' : ' local') + '"><span class="dot"></span>' + (hasKey ? 'Muvit KI · ' + esc(((M.CONFIG.aiModels.find((m) => m.id === M.settings.model) || {}).label || M.settings.model).split(' – ')[0]) : 'Basis-Modus · <button data-set>API-Schlüssel hinterlegen</button>') + '</div>' +
        '<div class="chat-in"><button class="mic" data-mic aria-label="Spracheingabe" hidden>' + icon('mic') + '</button>' +
        '<textarea rows="1" data-in placeholder="Frag die Assistance …" enterkeyhint="send"></textarea>' +
        '<button class="send" data-send aria-label="Senden">' + icon('send') + '</button></div>';
      const log = M.$('[data-log]', ctx.body), input = M.$('[data-in]', ctx.body), send = M.$('[data-send]', ctx.body);
      ctx.scroller(log);
      const setBtn = M.$('[data-set]', ctx.body);
      if (setBtn) setBtn.addEventListener('click', () => UI.open('settings'));

      const scroll = () => { log.scrollTop = log.scrollHeight; };
      const add = (el) => { log.appendChild(el); scroll(); return el; };
      function userMsg(text) { return add(M.h('<div class="msg user">' + esc(text) + '</div>')); }
      function botMsg(html, cls) { return add(M.h('<div class="msg bot' + (cls ? ' ' + cls : '') + '">' + html + '</div>')); }
      function chipEl(label, state) { return add(M.h('<div class="tool ' + (state || '') + '">' + icon(state === 'busy' ? 'refresh' : state === 'fail' ? 'alert' : 'check') + esc(label) + '</div>')); }
      function cardsEl(c) {
        const wrap = M.h('<div class="chat-cards"></div>');
        if (c.kind === 'journeys') {
          wrap.innerHTML = c.list.map((j, i) => C.jrow(j, i)).join('');
          wrap.querySelectorAll('.jrow').forEach((b) => b.addEventListener('click', () => UI.open('journey', { j: c.list[+b.dataset.i], query: c.query && c.query.from ? c.query : null })));
        } else if (c.kind === 'departures') {
          wrap.innerHTML = '<div class="hd">' + esc(c.stop.name) + '</div>' + c.list.map((x, i) => C.depRow(x, i, { alerts: false })).join('') +
            '<button class="pager" data-all>Alle Abfahrten</button>';
          wrap.querySelectorAll('.dep').forEach((b) => b.addEventListener('click', () => { const x = c.list[+b.dataset.i]; UI.open('trip', { tripId: x.tripId, src: x.src, line: x.line, focusStop: c.stop.name }); }));
          M.$('[data-all]', wrap).addEventListener('click', () => UI.open('stop', { stop: c.stop }));
        } else if (c.kind === 'nearby') {
          wrap.innerHTML = c.list.slice(0, 5).map((s, i) => C.stopRow(s, i, { star: false, end: M.fmtDist(s.distance) + ' · ' + M.compass(s.bearing) })).join('');
          wrap.querySelectorAll('.stop-row').forEach((b) => b.addEventListener('click', () => UI.open('stop', { stop: c.list[+b.dataset.i] })));
        } else if (c.kind === 'trip') {
          const t = c.trip;
          wrap.innerHTML = C.lrow({ cls: 'lines', lead: C.badges(t.line), title: M.icon('arrow', 'to-ar') + esc(t.headsign), sub: t.stops.length + ' Halte · Fahrtverlauf & Live-Position' }, 0);
          M.$('.lrow', wrap).addEventListener('click', () => UI.open('trip', { tripId: t.tripId, src: t.src, line: t.line }));
        } else if (c.kind === 'tariffs') {
          wrap.innerHTML = C.lrow({ icon: 'ticketV', title: 'Ticket kaufen', sub: 'marego · Stand ' + M.Tariffs.stand }, 0) + C.lrow({ icon: 'idCard', title: 'Abonnements', sub: 'Deutschlandticket & Abo' }, 1);
          wrap.querySelectorAll('.lrow').forEach((b) => b.addEventListener('click', () => UI.open(b.dataset.i === '0' ? 'tickets' : 'abos')));
        } else if (c.kind === 'price') {
          wrap.innerHTML = '<div class="kv" style="border-bottom:0"><div class="k">' + esc(c.from) + ' → ' + esc(c.to) + '<small>Günstigster DB-Preis · Abfahrt ' + M.fmtTime(c.price.dep) + '</small></div><div class="v">' + M.money(c.price.price.amount, c.price.price.currency) + '</div></div>';
        }
        return add(wrap);
      }
      function renderEntry(e) {
        if (e.type === 'user') userMsg(e.text);
        else if (e.type === 'bot') botMsg(e.trusted ? mdTrusted(e.text) : md(e.text));
        else if (e.type === 'err') botMsg(icon('alert') + ' ' + esc(e.text), 'err');
        else if (e.type === 'tool') chipEl(e.label, e.state);
        else if (e.type === 'cards') cardsEl(e.c);
      }
      const view = {
        botBubble() {
          const el = botMsg('<span class="typing"><span></span><span></span><span></span></span>');
          return { set(t) { el.innerHTML = md(t); scroll(); }, done(t) { A.log.push({ type: 'bot', text: t }); }, remove() { el.remove(); } };
        },
        toolChip(label) {
          const entry = { type: 'tool', label, state: 'busy' };
          A.log.push(entry);
          const el = ctx.alive() ? chipEl(label, 'busy') : null;
          const fin = (state) => { entry.state = state; if (el) { el.className = 'tool ' + state; el.innerHTML = icon(state === 'fail' ? 'alert' : 'check') + esc(label); } };
          return { done: () => fin('done'), fail: () => fin('fail') };
        },
        cards(c) { A.log.push({ type: 'cards', c }); if (ctx.alive()) cardsEl(c); },
        error(t) { A.log.push({ type: 'err', text: t }); if (ctx.alive()) botMsg(icon('alert') + ' ' + esc(t), 'err'); },
        note(t) { A.log.push({ type: 'err', text: t }); if (ctx.alive()) botMsg(esc(t), 'err'); }
      };
      function intro() {
        log.innerHTML = '<div class="chat-hello"><h3>Hallo! Wie kann ich helfen?</h3><p>Frag nach Verbindungen – auch über Zwischenhalte mit Aufenthalt –, Abfahrten in Echtzeit, Fahrtverläufen oder Ticketpreisen. Zieh das Fenster nach unten, um die Karte zu sehen.</p>' +
          '<div class="sugg">' + SUGGEST.map((x, i) => '<button data-s="' + i + '">' + icon(x[0]) + esc(x[1]) + '</button>').join('') + '</div></div>';
        log.querySelectorAll('[data-s]').forEach((b) => b.addEventListener('click', () => submit(SUGGEST[+b.dataset.s][1])));
      }
      async function submit(text) {
        text = (text || '').trim();
        if (!text || A.busy) return;
        if (!A.log.length) log.innerHTML = '';
        A.busy = true; send.disabled = true;
        input.value = ''; input.style.height = '';
        A.log.push({ type: 'user', text });
        userMsg(text);
        try {
          if (M.settings.apiKey) await runClaude(text, view);
          else {
            const typing = botMsg('<span class="typing"><span></span><span></span><span></span></span>');
            let answer;
            try { answer = await runLocal(text, view); } finally { typing.remove(); }
            A.log.push({ type: 'bot', text: answer, trusted: true });
            if (ctx.alive()) botMsg(mdTrusted(answer));
          }
        } catch (e) { view.error(e.message || String(e)); }
        finally { A.busy = false; if (ctx.alive()) { send.disabled = false; scroll(); } }
      }
      if (A.log.length) A.log.forEach(renderEntry); else intro();
      setTimeout(scroll, 50);
      input.addEventListener('input', () => { input.style.height = ''; input.style.height = Math.min(120, input.scrollHeight) + 'px'; });
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(input.value); } });
      send.addEventListener('click', () => submit(input.value));
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      const mic = M.$('[data-mic]', ctx.body);
      if (SR) {
        mic.hidden = false;
        let rec = null;
        mic.addEventListener('click', () => {
          if (rec) { rec.stop(); return; }
          rec = new SR(); rec.lang = 'de-DE'; rec.interimResults = true; rec.maxAlternatives = 1;
          mic.classList.add('rec');
          rec.onresult = (ev) => { input.value = Array.from(ev.results).map((r) => r[0].transcript).join(' '); };
          rec.onend = () => { mic.classList.remove('rec'); const v = input.value; rec = null; if (v.trim()) submit(v); };
          rec.onerror = () => { mic.classList.remove('rec'); rec = null; };
          rec.start();
        });
        ctx.cleanup(() => { if (rec) rec.abort(); });
      }
      if (ctx.params.prompt && !ctx.state.sent) { ctx.state.sent = true; submit(ctx.params.prompt); }
    }
  };
})(window.Muvit = window.Muvit || {});
