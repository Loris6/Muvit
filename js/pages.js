/* Muvit – Seiten der unteren Leiste: Tickets, D-Ticket, Mehr (Profil, Reise-Optionen, Favoriten, Pläne, Abos) */
(function (M) {
  'use strict';

  const V = M.Views, C = M.C, UI = M.UI;
  const esc = M.esc, icon = M.icon;
  const bindAll = (root, sel, fn) => root.querySelectorAll(sel).forEach((el) => el.addEventListener('click', (e) => fn(el, e)));
  const SHOP = 'https://www.mvbnet.de/fahrkarten/';
  const DT_INFO = 'https://www.bahn.de/angebot/regio/deutschland-ticket';
  const MAREGO = 'https://www.marego-heimat.de/';

  /* ---------------- Profil & D-Ticket (nur auf diesem Gerät gespeichert) ---------------- */
  const profile = {
    get: () => M.store.get('profile', null),
    set: (p) => M.store.set('profile', p),
    del: () => M.store.del('profile'),
    name: (p) => (p ? [p.first, p.last].filter(Boolean).join(' ') : '')
  };
  M.profile = profile;
  const PROVIDERS = {
    mvb: { label: 'MVB (Magdeburger Verkehrsbetriebe)', short: 'MVB', url: SHOP },
    db: { label: 'Deutsche Bahn', short: 'DB', url: DT_INFO },
    other: { label: 'Anderer Anbieter', short: 'Anbieter', url: '' }
  };
  const dticket = {
    get: () => M.store.get('dticket', null),
    set(t) {
      M.store.set('dticket', t);
      // Speicher voll? (z. B. zu großes Bild)
      return JSON.stringify(M.store.get('dticket', null)) === JSON.stringify(t);
    },
    del: () => M.store.del('dticket')
  };
  M.dticket = dticket;
  const TZ = 'Europe/Berlin';
  const monthFmt = new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric', timeZone: TZ });
  const dateFmt = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
  const ym = (d) => { const p = M.berlinParts(d || new Date()); return p.y + '-' + String(p.mo).padStart(2, '0'); };
  const monthLabel = (v) => { const [y, m] = String(v || '').split('-').map(Number); return y && m ? monthFmt.format(new Date(Date.UTC(y, m - 1, 15))) : ''; };
  const dateLabel = (v) => { const [y, m, d] = String(v || '').split('-').map(Number); return y && m && d ? dateFmt.format(new Date(Date.UTC(y, m - 1, d))) : ''; };
  /** Gilt das hinterlegte Abo im laufenden Monat? */
  function dtValid(t) {
    if (!t || t.active === false) return false;
    return !t.since || t.since <= ym();
  }
  function dtRange() {
    const p = M.berlinParts(new Date());
    const last = new Date(Date.UTC(p.y, p.mo, 0)).getUTCDate();
    return '01.' + String(p.mo).padStart(2, '0') + '. – ' + last + '.' + String(p.mo).padStart(2, '0') + '.' + p.y;
  }

  /** Ticket-Karte im Muvit-Stil */
  function ticketCard(p, opts) {
    opts = opts || {};
    return '<div class="card-o"><div class="top"><div class="n">' + esc(p.name) + '</div><div class="p">' + (p.price != null ? M.money(p.price) + (p.unit ? '<small>' + esc(p.unit) + '</small>' : '') : '<small style="margin:0">' + esc(opts.noPrice || 'Preis laut marego') + '</small>') + '</div></div>' +
      '<div class="z">' + esc(p.zone) + '</div>' +
      (p.app || p.child ? '<div class="sub2">' + (p.app ? '<span>App/online: <b>' + M.money(p.app) + '</b></span>' : '') + (p.child ? '<span>Kind 6–14: <b>' + M.money(p.child) + '</b>' + (p.childApp ? ' (App ' + M.money(p.childApp) + ')' : '') + '</span>' : '') + '</div>' : '') +
      '<div class="d">' + esc(p.note) + '</div>' +
      (p.tags ? '<div class="tags">' + p.tags.map((t) => '<span>' + esc(t) + '</span>').join('') + '</div>' : '') +
      (opts.link ? '<a class="btn-o acc" href="' + opts.link + '" target="_blank" rel="noopener">' + icon(opts.linkIcon || 'external') + esc(opts.linkText || 'Mehr erfahren') + '</a>' : '') + '</div>';
  }
  M.ticketCard = ticketCard;
  const product = (id) => M.Tariffs.products.find((p) => p.id === id);

  /* =====================================================================
     Tickets – alle verfügbaren Tickets
     ===================================================================== */
  V.tickets = {
    height: 'full',
    render(ctx) {
      const T = M.Tariffs, st = ctx.state;
      ctx.head({ title: 'Tickets' });
      const buy = (id) => ticketCard(product(id), { link: SHOP, linkIcon: 'ticketR', linkText: 'Bei der MVB kaufen' });
      const group = (title, html) => '<div class="lbl">' + esc(title) + '</div>' + html;
      ctx.body.innerHTML = '<div class="lbl" style="padding-top:6px">Magdeburg · marego · MVB · Stand ' + T.stand + '</div>' +
        group('Einzelne Fahrten', buy('einzel') + buy('kurz')) +
        group('Tages- & Zeitkarten', buy('24h') + buy('woche') + buy('monat')) +
        group('Abos & Deutschlandticket',
          ticketCard(product('dt'), { link: DT_INFO, linkText: 'Deutschlandticket abschließen' }) +
          ticketCard(product('dtjob'), { link: DT_INFO, linkText: 'Mehr zum Jobticket', noPrice: 'mit Arbeitgeber' }) +
          ticketCard(product('dtsem'), { link: DT_INFO, linkText: 'Mehr zum Semesterticket', noPrice: 'über die Hochschule' }) +
          ticketCard(product('abo'), { link: MAREGO, linkText: 'marego-Abo ansehen' })) +
        group('Fernverkehr & Deutschland', ticketCard({ name: 'DB-Tickets', zone: 'ICE · IC · RE · bundesweit', price: null, note: 'Spar- und Flexpreise für Fahrten mit der Deutschen Bahn. Muvit zeigt dir den aktuellen Bestpreis direkt bei deiner Verbindung.' }, { link: 'https://www.bahn.de/', linkText: 'Auf bahn.de buchen', noPrice: 'Preis je Verbindung' })) +
        '<div class="lbl">Preis für deine Strecke</div>' +
        '<div class="od"><button class="od-row" data-pick="from"><span class="radio on"></span><span class="v' + (st.from ? '' : ' ph') + '">' + esc(st.from ? M.placeName(st.from) : 'Start eingeben') + '</span></button><div class="od-div"></div>' +
        '<button class="od-row" data-pick="to"><span class="radio off"></span><span class="v' + (st.to ? '' : ' ph') + '">' + esc(st.to ? M.placeName(st.to) : 'Ziel eingeben') + '</span></button></div>' +
        '<button class="btn-a full" data-calc style="margin-top:14px">' + icon('euro') + 'Preis ermitteln</button><div data-res></div>' +
        '<div class="hint" style="padding-top:18px">' + icon('infoFill') + '<span>Alle Preise ohne Gewähr. Muvit verkauft keine Fahrkarten – gekauft wird beim jeweiligen Anbieter. Den aktuellen Tarif findest du in der <a href="' + MAREGO + '" target="_blank" rel="noopener">marego-Tarifauskunft</a>.</span></div>';
      bindAll(ctx.body, '[data-pick]', (b) => { const k = b.dataset.pick; UI.open('places', { title: k === 'from' ? 'Start' : 'Ziel', onPick: (pl) => { st[k] = pl; } }); });
      bindAll(ctx.body, '[data-calc]', async () => {
        const res = M.$('[data-res]', ctx.body);
        if (!st.to) { M.toast('Bitte ein Ziel wählen', { type: 'err' }); return; }
        const q = { from: st.from || M.MY_LOCATION, to: st.to, via: [], time: null, arriveBy: false };
        res.innerHTML = C.skel(2);
        try {
          const r = await M.runJourneys(q);
          if (!ctx.alive()) return;
          const j = r.list[0];
          if (!j) { res.innerHTML = C.empty('Keine Verbindung gefunden', ''); return; }
          const est = M.Tariffs.estimate(j);
          res.innerHTML = '<div style="margin-top:14px" class="hr"></div><div class="kv"><div class="k">' + esc(est.title) + '<small>' + esc(est.note) + '</small></div><div class="v">' + (est.price != null ? M.money(est.price) : '–') + '</div></div>' + C.jrow(j, 0) + '<div data-db></div>';
          bindAll(res, '.jrow', () => { UI.toAuskunft(); UI.open('journey', { j, query: q }); });
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
     D-Ticket – das eigene Deutschlandticket zeigen (an die Gerätegröße angepasst)
     ===================================================================== */
  /** Infos zum Deutschlandticket im aufgeklappten Extra-Frame */
  function dtInfo() {
    UI.panel({
      title: 'Deutschlandticket', icon: '<span class="dt-logo sm">' + M.DT_ICON + '</span>',
      html: ticketCard(product('dt'), {}) +
        '<div class="kv"><div class="k">Wo gilt es?<small>Bundesweit in Bus, Straßenbahn, U- und S-Bahn sowie RE/RB. Nicht in ICE, IC und EC.</small></div></div>' +
        '<div class="kv"><div class="k">Kontrolle<small>Barcode zeigen und einen amtlichen Lichtbildausweis dabeihaben.</small></div></div>' +
        '<div class="kv"><div class="k">Kündigen<small>Monatlich kündbar – meist bis zum 10. eines Monats zum Monatsende, beim Anbieter.</small></div></div>' +
        '<div class="kv"><div class="k">Apple Wallet & Google Wallet<small>Liegt dein Ticket in der Wallet oder in der App deines Anbieters, mach dort einen Screenshot vom Code und wähle ihn unter „Bearbeiten“ aus. Muvit liest den Code und zeigt ihn im Muvit-Design.</small></div></div>'
    });
  }
  /** Ticket-Code zeichnen: Muvit-Design (geprüft), sonst schwarz-weiß, sonst Originalbild */
  async function drawCode(box, t, size, prefer) {
    if (t.code) {
      const c = document.createElement('canvas');
      c.className = 'dt-canvas';
      box.innerHTML = '<div class="dt-wait">' + icon('qrcode') + '</div>';
      try {
        const style = await M.DTCode.render(c, t.code, size, prefer);
        if (style) { box.innerHTML = ''; box.appendChild(c); return style; }
      } catch (e) { /* unten: Bild */ }
    }
    if (t.img) { box.innerHTML = '<img class="dt-img" src="' + t.img + '" alt="Code deines Deutschlandtickets" style="max-width:' + size + 'px;max-height:' + size + 'px">'; return 'image'; }
    box.innerHTML = '<div class="dt-nocode">' + icon('qrcode') + '<span>Noch kein Code hinterlegt. Unter „Bearbeiten“ einen Screenshot aus der Wallet oder der App deines Anbieters wählen.</span></div>';
    return null;
  }
  /** Vollbild zum Vorzeigen: weiß, großer Code, Bildschirm bleibt an */
  function dtFullscreen(t) {
    const p = profile.get();
    const el = M.h('<div class="dt-fs" role="dialog" aria-label="Deutschlandticket"><button class="dt-fs-x" aria-label="Schließen">' + icon('close') + '</button>' +
      '<div class="dt-fs-t"><span class="dt-logo">' + M.DT_ICON + '</span><div><b>Deutschlandticket</b><span>' + esc(monthLabel(ym())) + ' · ' + esc(t.name || profile.name(p) || '') + '</span></div></div>' +
      '<div class="dt-fs-code" data-box></div>' +
      '<div class="dt-fs-b"><button class="dt-fs-mode" data-mode>' + icon('brightness') + '<span>Kontrollansicht</span></button></div>' +
      '<div class="dt-fs-h">Bildschirmhelligkeit hochstellen · Lichtbildausweis bereithalten</div></div>');
    document.getElementById('app').appendChild(el);
    let lock = null, plain = false;
    try { if (navigator.wakeLock) navigator.wakeLock.request('screen').then((l) => { lock = l; }).catch(() => {}); } catch (e) { /* ignore */ }
    const box = el.querySelector('[data-box]');
    const size = () => Math.floor(Math.min(window.innerWidth - 40, window.innerHeight - 260, 560));
    const paint = () => drawCode(box, t, size(), plain ? 'plain' : 'design');
    paint();
    el.querySelector('[data-mode]').addEventListener('click', (e) => { plain = !plain; e.currentTarget.classList.toggle('on', plain); e.currentTarget.querySelector('span').textContent = plain ? 'Muvit-Design' : 'Kontrollansicht'; paint(); });
    const close = () => { try { if (lock) lock.release(); } catch (e) { /* ignore */ } el.remove(); window.removeEventListener('keydown', onKey); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    el.querySelector('.dt-fs-x').addEventListener('click', close);
  }

  V.dticket = {
    height: 'full',
    render(ctx) {
      const t = dticket.get(), p = profile.get();
      ctx.head({ title: 'Deutschlandticket', actions: [{ icon: 'infoFill', label: 'Infos zum Deutschlandticket', onClick: dtInfo }].concat(t ? [{ icon: 'settings', label: 'Ticket bearbeiten', onClick: () => UI.open('dtedit', {}) }] : []) });
      const dt = product('dt');
      ctx.flexBody();
      if (!t) {
        ctx.body.innerHTML = '<div class="dt-screen"><div class="dt-empty">' + '<span class="dt-logo big">' + M.DT_ICON + '</span>' +
          '<b>Noch kein Deutschlandticket hinterlegt</b><span>Füge dein Ticket aus Apple Wallet, Google Wallet oder der App deines Anbieters hinzu – per Screenshot vom Code. Muvit zeigt es dann im Muvit-Design, auch ohne Internet.</span>' +
          '<div class="btn-row" style="justify-content:center;padding:18px 0 0"><button class="btn-a" data-add>' + icon('plus') + 'Mein Ticket hinzufügen</button></div>' +
          '<a class="btn-o" href="' + DT_INFO + '" target="_blank" rel="noopener" style="margin-top:10px">' + icon('ticketR') + 'Deutschlandticket kaufen</a></div></div>';
        bindAll(ctx.body, '[data-add]', () => UI.open('dtedit', {}));
        return;
      }
      const ok = dtValid(t), pv = PROVIDERS[t.provider] || PROVIDERS.other;
      const holder = t.name || profile.name(p), born = t.born || (p && p.born);
      ctx.body.innerHTML = '<div class="dt-screen"><div class="dt-card' + (ok ? '' : ' off') + '">' +
          '<div class="dt-top"><span class="dt-logo">' + M.DT_ICON + '</span><div style="min-width:0"><div class="dt-t">Deutschlandticket</div><div class="dt-s">' + esc(pv.short) + ' · ' + (dt.price != null ? M.money(dt.price) + ' / Monat' : 'Monatsabo') + '</div></div>' +
          '<span class="dt-state">' + (ok ? icon('check') + 'Abo aktiv' : 'Nicht aktiv') + '</span></div>' +
          '<div class="dt-grid">' +
            '<div><small>Monat</small><b>' + esc(ok ? monthLabel(ym()) : t.since ? 'ab ' + monthLabel(t.since) : '–') + '</b>' + (ok ? '<span>' + dtRange() + '</span>' : '') + '</div>' +
            '<div><small>Inhaber/in</small><b>' + esc(holder || '–') + '</b>' + (born ? '<span>geb. ' + esc(dateLabel(born)) + '</span>' : '') + '</div>' +
          '</div>' +
          '<button class="dt-codebox" data-codebox aria-label="Code im Vollbild zeigen"></button>' +
          '<div class="dt-cap" data-cap>Antippen für Vollbild</div>' +
        '</div>' +
        '<div class="dt-actions"><button class="btn-o acc" data-fs>' + icon('expand') + 'Vollbild</button>' +
          (pv.url ? '<a class="btn-o" href="' + pv.url + '" target="_blank" rel="noopener">' + icon('external') + 'Anbieter</a>' : '') +
          '<button class="btn-o" data-edit>' + icon('settings') + 'Bearbeiten</button></div></div>';
      const box = M.$('[data-codebox]', ctx.body), cap = M.$('[data-cap]', ctx.body);
      const fit = () => {
        const r = box.getBoundingClientRect();
        const size = Math.floor(Math.max(120, Math.min(r.width - 16, r.height - 16, 460)));
        drawCode(box, t, size).then((style) => {
          if (!ctx.alive()) return;
          cap.textContent = style === 'design' ? 'Muvit-Design · Daten geprüft · antippen für Vollbild' : style === 'plain' ? 'Antippen für Vollbild' : style === 'image' ? 'Bild deines Anbieters · antippen für Vollbild' : '';
        });
      };
      requestAnimationFrame(() => { if (ctx.alive()) fit(); });
      const onResize = M.debounce(() => { if (ctx.alive()) fit(); }, 200);
      window.addEventListener('resize', onResize);
      ctx.cleanup(() => window.removeEventListener('resize', onResize));
      bindAll(ctx.body, '[data-codebox], [data-fs]', () => dtFullscreen(t));
      bindAll(ctx.body, '[data-edit]', () => UI.open('dtedit', {}));
    }
  };

  /** Bild für den Speicher verkleinern (Codes bleiben scharf: PNG, notfalls JPEG) */
  async function shrinkImage(src) {
    const img = await M.DTCode.loadImage(src);
    const k = Math.min(1, 1100 / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(img, 0, 0, c.width, c.height);
    let url = c.toDataURL('image/png');
    if (url.length > 1500000) url = c.toDataURL('image/jpeg', 0.9);
    return url;
  }

  V.dtedit = {
    height: 'full',
    render(ctx) {
      const t = dticket.get() || { provider: 'mvb', since: ym(), active: true };
      const p = profile.get() || {};
      ctx.head({ title: 'Mein Deutschlandticket' });
      let img = t.img || '', code = t.code || null;
      ctx.body.innerHTML =
        '<div class="lbl" style="padding-top:6px">Ticket-Code</div>' +
        '<div class="dt-pick"><button class="dt-prev" data-prev></button><div style="min-width:0"><b data-status></b>' +
        '<div class="btn-row" style="padding:10px 0 0"><label class="btn-o acc">' + icon('picture') + 'Screenshot wählen<input type="file" accept="image/*" data-file hidden></label>' +
        '<button class="btn-o" data-noimg' + (img || code ? '' : ' hidden') + '>' + icon('trash') + 'Entfernen</button></div></div></div>' +
        '<div class="steps"><div><span>1</span>Ticket in <b>Apple Wallet</b>, <b>Google Wallet</b> oder der App deines Anbieters öffnen</div>' +
          '<div><span>2</span>Screenshot vom Code machen</div><div><span>3</span>Hier „Screenshot wählen“ – Muvit liest den Code und zeigt ihn grün im Muvit-Design</div></div>' +
        '<div class="lbl">Angaben</div>' +
        '<label class="field"><span>Anbieter</span><select class="inp" data-f="provider">' + Object.keys(PROVIDERS).map((k) => '<option value="' + k + '"' + (t.provider === k ? ' selected' : '') + '>' + esc(PROVIDERS[k].label) + '</option>').join('') + '</select></label>' +
        '<label class="field"><span>Abo seit</span><input class="inp" type="month" data-f="since" value="' + esc(t.since || ym()) + '"></label>' +
        '<label class="field"><span>Name auf dem Ticket</span><input class="inp" data-f="name" autocomplete="name" placeholder="' + esc(profile.name(p) || 'Vor- und Nachname') + '" value="' + esc(t.name || '') + '"></label>' +
        '<label class="field"><span>Geburtsdatum</span><input class="inp" type="date" data-f="born" value="' + esc(t.born || p.born || '') + '"></label>' +
        '<div class="kv" style="border-top:1px solid var(--sep)"><div class="k">Abo aktiv<small>Ausschalten, wenn du gekündigt hast</small></div><label class="sw"><input type="checkbox" data-f="active"' + (t.active !== false ? ' checked' : '') + '><span></span></label></div>' +
        '<button class="btn-a full" data-save style="margin-top:18px">' + icon('check') + 'Speichern</button>' +
        (dticket.get() ? '<div class="btn-row"><button class="btn-o" data-del>' + icon('trash') + 'Ticket aus Muvit entfernen</button></div>' : '') +
        '<div class="hint" style="padding-top:16px">' + icon('lock') + '<span>Alles bleibt nur auf diesem Gerät. Muvit verkauft und erzeugt keine Tickets – der Code stammt immer von deinem Anbieter und bleibt Byte für Byte gleich.</span></div>';
      const f = (k) => M.$('[data-f="' + k + '"]', ctx.body);
      const prev = M.$('[data-prev]', ctx.body), noimg = M.$('[data-noimg]', ctx.body), status = M.$('[data-status]', ctx.body);
      const show = (msg) => {
        status.textContent = msg || (code ? (code.format === 'AZTEC' ? 'Aztec-Code' : 'QR-Code') + ' erkannt' : img ? 'Bild gespeichert (kein Code erkannt)' : 'Noch kein Code');
        drawCode(prev, { code, img }, 96);
        noimg.hidden = !(img || code);
      };
      show();
      M.$('[data-file]', ctx.body).addEventListener('change', async (e) => {
        const file = e.target.files && e.target.files[0];
        e.target.value = '';
        if (!file) return;
        status.textContent = 'Code wird gelesen …';
        try {
          const src = await M.DTCode.fileToDataURL(file);
          const found = await M.DTCode.decodeImage(src).catch((err) => { M.toast(err.message, { type: 'err' }); return null; });
          if (!ctx.alive()) return;
          if (found) { code = found; img = ''; M.toast((found.format === 'AZTEC' ? 'Aztec-Code' : 'QR-Code') + ' erkannt'); }
          else { code = null; img = await shrinkImage(src); M.toast('Kein Code erkannt – das Bild wird unverändert gezeigt. Tipp: nur den Code ausschneiden.', { type: 'err', ms: 6000 }); }
          show();
        } catch (err) { M.toast(err.message, { type: 'err' }); show(); }
      });
      noimg.addEventListener('click', () => { img = ''; code = null; show(); });
      prev.addEventListener('click', () => { if (code || img) dtFullscreen({ code, img, name: f('name').value.trim() }); });
      bindAll(ctx.body, '[data-save]', () => {
        const next = { provider: f('provider').value, since: f('since').value || ym(), name: f('name').value.trim(), born: f('born').value, active: f('active').checked, img, code };
        if (!dticket.set(next)) { M.toast('Das Bild ist zu groß für den Speicher – bitte nur den Code ausschneiden.', { type: 'err', ms: 6000 }); return; }
        M.toast('Deutschlandticket gespeichert');
        ctx.back();
        UI.refresh();
      });
      bindAll(ctx.body, '[data-del]', () => { dticket.del(); M.toast('Ticket entfernt'); ctx.back(); UI.refresh(); });
    }
  };

  /* =====================================================================
     Mehr – Willkommen, Mein Profil, Reise-Optionen, Einstellungen, …
     ===================================================================== */
  function travelSummary() {
    const t = M.settings.travel || {};
    const n = t.modes && t.modes.length ? t.modes.length : 7;
    const parts = [n >= 7 ? 'Alle Verkehrsmittel' : n + ' Verkehrsmittel'];
    parts.push(t.maxTransfers == null ? 'beliebig viele Umstiege' : t.maxTransfers === 0 ? 'nur Direktverbindungen' : 'max. ' + t.maxTransfers + (t.maxTransfers === 1 ? ' Umstieg' : ' Umstiege'));
    if (t.wheelchair) parts.push('barrierefrei');
    return parts.join(' · ');
  }
  V.mehr = {
    height: 'full',
    render(ctx) {
      ctx.head({ none: true });
      const p = profile.get(), t = dticket.get();
      const name = profile.name(p);
      const initials = name ? name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase() : '';
      const nf = M.favs.stops().length, nr = M.favs.routes().length;
      const ITEMS = [
        { k: 'reise', icon: 'sliders', title: 'Reise-Optionen', sub: travelSummary() },
        { k: 'set', icon: 'settings', title: 'Einstellungen', sub: 'Assistance (KI), Karte, Mitteilungen, Privatsphäre' },
        { k: 'fav', icon: 'star', title: 'Favoriten', sub: (nf || nr) ? nf + (nf === 1 ? ' Haltestelle' : ' Haltestellen') + ' · ' + nr + (nr === 1 ? ' Route' : ' Routen') : 'Gemerkte Haltestellen & Routen' },
        { k: 'plan', icon: 'map', title: 'ÖPNV Netz- & Tarifpläne', sub: 'Liniennetz, Nachtnetz, Tarifübersicht' },
        { k: 'abos', icon: 'idCard', title: 'Abos verwalten', sub: t ? 'Deutschlandticket · ' + (dtValid(t) ? 'gültig' : 'nicht aktiv') : 'Deutschlandticket & marego-Abo' }
      ];
      const SERVICE = [
        { k: 'verkehr', icon: 'megaphone', title: 'Verkehrsmelder', sub: 'Aktuelle Störungen der MVB' },
        { k: 'assistant', icon: 'headset', title: 'Assistance', sub: 'Frag Muvit nach Verbindungen und Tickets' }
      ];
      ctx.body.innerHTML =
        '<h2 class="welcome">Willkommen in der Muvit App</h2>' +
        '<div class="lbl" style="padding-top:18px">Mein Profil</div>' +
        '<button class="profile-card" data-k="profile"><span class="avatar">' + (initials ? esc(initials) : icon('user')) + '</span>' +
          '<span style="min-width:0"><span class="pt">' + esc(name || 'Anmelden') + '</span><span class="ps">' + esc(p ? (p.email || 'Profil bearbeiten') : 'Melde dich an – Tickets und Abos werden vorausgefüllt.') + '</span></span>' +
          '<span class="chev">' + icon('right') + '</span></button>' +
        '<div class="lbl">Allgemein</div>' + ITEMS.map((x) => C.lrow({ icon: x.icon, title: esc(x.title), sub: esc(x.sub) }, x.k)).join('') +
        '<div class="lbl">Service</div>' + SERVICE.map((x) => C.lrow({ icon: x.icon, title: esc(x.title), sub: esc(x.sub) }, x.k)).join('') +
        '<div class="mehr-foot">Muvit · Mobilität für Magdeburg</div>';
      const go = { profile: () => UI.open('profile', {}), reise: () => UI.open('reiseopt', {}), set: () => UI.open('settings', {}), fav: () => UI.open('favoriten', {}), plan: () => UI.open('plaene', {}), abos: () => UI.open('abos', {}), verkehr: () => UI.open('verkehr', {}), assistant: () => UI.open('assistant', {}) };
      bindAll(ctx.body, '[data-k], .lrow[data-i]', (el) => { const k = el.dataset.k || el.dataset.i; if (go[k]) go[k](); });
    }
  };

  /* ---------- Mein Profil ---------- */
  V.profile = {
    height: 'full',
    render(ctx) {
      const p = profile.get();
      ctx.head({ title: 'Mein Profil' });
      const v = p || {};
      ctx.body.innerHTML =
        '<div class="profile-hero"><span class="avatar big">' + icon('user') + '</span><b>' + esc(p ? profile.name(p) || 'Mein Profil' : 'Anmelden') + '</b><span>' + (p ? 'Angemeldet auf diesem Gerät' : 'Mit deinem Profil füllt Muvit Ticket- und Abo-Angaben vor.') + '</span></div>' +
        '<label class="field"><span>Vorname</span><input class="inp" data-f="first" autocomplete="given-name" value="' + esc(v.first || '') + '"></label>' +
        '<label class="field"><span>Nachname</span><input class="inp" data-f="last" autocomplete="family-name" value="' + esc(v.last || '') + '"></label>' +
        '<label class="field"><span>E-Mail (optional)</span><input class="inp" type="email" data-f="email" autocomplete="email" value="' + esc(v.email || '') + '"></label>' +
        '<label class="field"><span>Geburtsdatum (optional, für das Deutschlandticket)</span><input class="inp" type="date" data-f="born" value="' + esc(v.born || '') + '"></label>' +
        '<button class="btn-a full" data-save>' + icon(p ? 'check' : 'signIn') + (p ? 'Speichern' : 'Anmelden') + '</button>' +
        (p ? '<div class="btn-row"><button class="btn-o" data-out>' + icon('signIn') + 'Abmelden</button></div>' : '') +
        '<div class="hint" style="padding-top:18px">' + icon('lock') + '<span>Dein Profil wird nur auf diesem Gerät gespeichert und nicht an Muvit übertragen. Ein Muvit-Konto auf einem Server gibt es nicht.</span></div>';
      const f = (k) => M.$('[data-f="' + k + '"]', ctx.body).value.trim();
      bindAll(ctx.body, '[data-save]', () => {
        if (!f('first') && !f('last')) { M.toast('Bitte gib deinen Namen ein', { type: 'err' }); return; }
        if (f('email') && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f('email'))) { M.toast('Die E-Mail-Adresse sieht nicht richtig aus', { type: 'err' }); return; }
        profile.set({ first: f('first'), last: f('last'), email: f('email'), born: f('born') });
        M.toast(p ? 'Profil gespeichert' : 'Willkommen, ' + (f('first') || f('last')) + '!');
        ctx.back(); UI.refresh();
      });
      bindAll(ctx.body, '[data-out]', () => { profile.del(); M.toast('Abgemeldet'); ctx.back(); UI.refresh(); });
    }
  };

  /* ---------- Reise-Optionen ---------- */
  const MODES = [['tram', 'Straßenbahn'], ['bus', 'Bus'], ['sbahn', 'S-Bahn'], ['ubahn', 'U-Bahn'], ['regio', 'Regionalverkehr'], ['fern', 'Fernverkehr'], ['ferry', 'Fähre']];
  V.reiseopt = {
    height: 'full',
    render(ctx) {
      ctx.head({ title: 'Reise-Optionen' });
      const draw = () => {
        const t = Object.assign({ modes: MODES.map((m) => m[0]), maxTransfers: null, wheelchair: false }, M.settings.travel || {});
        ctx.body.innerHTML =
          '<div class="lbl" style="padding-top:6px">Verkehrsmittel</div>' +
          '<div class="chips wrap">' + MODES.map((m) => '<button class="chip' + (t.modes.includes(m[0]) ? '' : ' off') + '" data-m="' + m[0] + '">' + C.modeBadge(m[0], { sm: true }) + esc(m[1]) + '</button>').join('') + '</div>' +
          '<div class="lbl">Umstiege</div>' +
          '<div class="seg">' + [[null, 'Beliebig'], [0, 'Direkt'], [1, 'Max. 1'], [2, 'Max. 2']].map((o) => '<button data-t="' + o[0] + '" class="' + (t.maxTransfers === o[0] ? 'on' : '') + '">' + o[1] + '</button>').join('') + '</div>' +
          '<div class="kv" style="border-top:1px solid var(--sep)"><div class="k">Barrierefrei reisen<small>Nur Wege ohne Stufen (Rollstuhl, Kinderwagen)</small></div><label class="sw"><input type="checkbox" data-wc' + (t.wheelchair ? ' checked' : '') + '><span></span></label></div>' +
          '<div class="kv"><div class="k">Nur mit Deutschlandticket<small>Ohne ICE, IC und EC suchen</small></div><label class="sw"><input type="checkbox" data-dt' + (M.state.dticket ? ' checked' : '') + '><span></span></label></div>' +
          '<div class="btn-row"><button class="btn-o" data-reset>' + icon('refresh') + 'Zurücksetzen</button></div>' +
          '<div class="hint" style="padding-top:14px">' + icon('infoFill') + '<span>Die Optionen gelten für alle Verbindungssuchen in der Auskunft.</span></div>';
        const save = (patch) => { M.saveSettings({ travel: Object.assign({}, t, patch) }); draw(); };
        bindAll(ctx.body, '[data-m]', (b) => {
          const m = b.dataset.m, on = t.modes.includes(m);
          if (on && t.modes.length === 1) { M.toast('Mindestens ein Verkehrsmittel wählen', { type: 'err' }); return; }
          save({ modes: on ? t.modes.filter((x) => x !== m) : t.modes.concat(m) });
        });
        bindAll(ctx.body, '[data-t]', (b) => save({ maxTransfers: b.dataset.t === 'null' ? null : +b.dataset.t }));
        M.$('[data-wc]', ctx.body).addEventListener('change', (e) => save({ wheelchair: e.target.checked }));
        M.$('[data-dt]', ctx.body).addEventListener('change', (e) => { M.state.dticket = e.target.checked; M.emit('state'); });
        bindAll(ctx.body, '[data-reset]', () => { M.saveSettings({ travel: null }); M.state.dticket = false; draw(); M.toast('Reise-Optionen zurückgesetzt'); });
      };
      draw();
    }
  };

  /* ---------- Favoriten: Haltestellen & Routen ---------- */
  V.favoriten = {
    height: 'full',
    render(ctx) {
      ctx.head({ title: 'Favoriten' });
      const draw = () => {
        const stops = M.favs.stops(), routes = M.favs.routes();
        let h = '<div class="lbl" style="padding-top:6px">Haltestellen</div>' +
          (stops.length ? stops.map((s, i) => C.stopRow(s, i)).join('') : '<div class="empty-hint">Tippe an einer Haltestelle auf den Stern, um sie hier zu sehen.</div>') +
          '<div class="lbl">Routen</div>' +
          (routes.length ? routes.map((r, i) => C.lrow({ icon: 'starFill', title: esc(M.placeName(r.from) || 'Mein Standort') + ' → ' + esc(r.to.name), sub: 'Verbindungen suchen' }, 'r' + i)).join('') : '<div class="empty-hint">Merke dir Routen über den Stern bei „Verbindungen“.</div>') +
          '<div class="note-dim">Favoriten werden nur auf diesem Gerät gespeichert.</div>';
        ctx.body.innerHTML = h;
        ctx.body.querySelectorAll('.stop-row').forEach((el) => el.addEventListener('click', (e) => {
          const s = stops[+el.dataset.i], sb = e.target.closest('[data-star]');
          if (sb) { e.stopPropagation(); M.favs.toggleStop(s); draw(); return; }
          UI.toAuskunft(); UI.open('stop', { stop: s });
        }));
        bindAll(ctx.body, '.lrow[data-i^="r"]', (el) => { const r = routes[+el.dataset.i.slice(1)]; M.state.from = r.from; M.state.to = r.to; M.state.via = []; M.App.search(); });
      };
      draw();
    }
  };

  /* ---------- ÖPNV Netz- & Tarifpläne – alles in der App ---------- */
  V.plaene = {
    height: 'full',
    render(ctx) {
      ctx.head({ title: 'Netz- & Tarifpläne' });
      const L = [
        { k: 'tram', lead: C.modeLogo('tram'), title: 'Liniennetz Straßenbahn', sub: 'Alle Straßenbahnlinien auf der Karte' },
        { k: 'bus', lead: C.modeLogo('bus'), title: 'Liniennetz Bus', sub: 'Alle Buslinien in Magdeburg und Umgebung' },
        { k: 'night', icon: 'moon', title: 'Nachtnetz', sub: 'Nachtlinien von Straßenbahn und Bus' },
        { k: 'live', icon: 'netz', title: 'Live-Netzplan', sub: 'Alle Fahrzeuge in Echtzeit' },
        { k: 'tarif', icon: 'document', title: 'Tarifübersicht', sub: 'Preisstufe MD, Tickets und Preise' },
        { k: 'dt', icon: 'ticketR', title: 'Deutschlandticket', sub: 'Geltungsbereich und Bedingungen' }
      ];
      ctx.body.innerHTML = '<div class="lbl" style="padding-top:6px">Netzpläne</div>' +
        L.slice(0, 4).map((x) => C.lrow({ lead: x.lead, icon: x.icon, title: esc(x.title), sub: esc(x.sub) }, x.k)).join('') +
        '<div class="lbl">Tarif</div>' + L.slice(4).map((x) => C.lrow({ icon: x.icon, title: esc(x.title), sub: esc(x.sub) }, x.k)).join('') +
        '<div class="note-dim">Linien und Verläufe stammen aus den aktuellen Fahrplandaten (Transitous).</div>';
      bindAll(ctx.body, '.lrow', (el) => {
        const k = el.dataset.i;
        if (k === 'live') UI.open('netz', {});
        else if (k === 'tarif') UI.open('tarif', {});
        else if (k === 'dt') dtInfo();
        else UI.open('netzkarte', { kind: k });
      });
    }
  };

  /** Liniennetz auf der Karte: alle Verläufe in Linienfarbe, darunter die Linien */
  V.netzkarte = {
    height: 0.5,
    render(ctx) {
      const kind = ctx.params.kind, st = ctx.state;
      const TITLE = { tram: 'Liniennetz Straßenbahn', bus: 'Liniennetz Bus', night: 'Nachtnetz' };
      ctx.head({ title: TITLE[kind] || 'Liniennetz' });
      const pick = (L) => (kind === 'night' ? M.isNight(L.line) && (L.line.mode === 'tram' || L.line.mode === 'bus') : L.line.mode === kind && !M.isNight(L.line));
      const draw = () => {
        const lines = (st.routes || []).filter(pick).sort((a, b) => a.line.name.localeCompare(b.line.name, 'de', { numeric: true }));
        if (!lines.length) { ctx.body.innerHTML = C.empty('Keine Linien gefunden', 'Für dieses Netz liegen gerade keine Fahrplandaten vor.'); return; }
        ctx.body.innerHTML = '<div class="net-legend">' + lines.map((L, i) => '<button class="nl" data-l="' + i + '">' + C.lineBadge(L.line) + '</button>').join('') + '</div>' +
          lines.map((L, i) => C.lrow({ cls: 'lines', lead: C.badges(L.line), title: esc(L.termini.join(' ↔ ')), sub: L.main.stops.length + ' Haltestellen' }, i)).join('');
        bindAll(ctx.body, '[data-l], .lrow', (el) => UI.open('linie', { route: lines[+(el.dataset.l != null ? el.dataset.l : el.dataset.i)] }));
        M.Map.drawNetwork(lines, { fit: !ctx.restoring });
      };
      const load = () => {
        ctx.body.innerHTML = C.skel(6);
        M.Transit.cityRoutes().then((r) => { st.routes = r; if (ctx.alive()) draw(); })
          .catch((e) => { if (ctx.alive()) { ctx.body.innerHTML = ''; ctx.body.appendChild(C.error(e, load)); } });
      };
      if (st.routes) draw(); else load();
      // Liniennetz ohne Live-Fahrzeuge darüber – übersichtlicher
      const vehOn = M.Map.showVehicles;
      if (vehOn) M.Map.setShowVehicles(false);
      ctx.cleanup(() => { M.Map.clearRoute(); if (vehOn) M.Map.setShowVehicles(true); });
    }
  };

  /** Tarifübersicht in der App */
  V.tarif = {
    height: 'full',
    render(ctx) {
      const T = M.Tariffs;
      ctx.head({ title: 'Tarifübersicht' });
      const row = (id, label) => {
        const p = product(id);
        if (!p) return '';
        return '<tr><td>' + esc(label || p.name) + '</td><td>' + (p.price != null ? M.money(p.price) : '–') + '</td><td>' + (p.app ? M.money(p.app) : '–') + '</td><td>' + (p.child ? M.money(p.child) : '–') + '</td></tr>';
      };
      ctx.body.innerHTML = '<div class="lbl" style="padding-top:6px">Preisstufe MD · Stadtgebiet Magdeburg · Stand ' + esc(T.stand) + '</div>' +
        '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Ticket</th><th>Preis</th><th>App</th><th>Kind</th></tr></thead><tbody>' +
          row('einzel', 'Einzelfahrt') + row('kurz', 'Kurzstrecke') + row('24h', '24-Stunden-Karte') + row('woche', 'Wochenkarte') + row('monat', 'Monatskarte') +
        '</tbody></table></div>' +
        '<div class="hint" style="padding-top:10px">' + icon('infoFill') + '<span>„–“: Preis nicht hinterlegt – bitte beim Kauf prüfen. Kind = 6 bis 14 Jahre.</span></div>' +
        '<div class="lbl">Abos</div>' +
        '<div class="tbl-wrap"><table class="tbl"><tbody>' +
          '<tr><td>Deutschlandticket</td><td>' + M.money(product('dt').price) + ' / Monat</td></tr>' +
          '<tr><td>Deutschlandticket Job</td><td>mit Arbeitgeber-Zuschuss</td></tr>' +
          '<tr><td>Deutschlandsemesterticket</td><td>60 % des D-Ticket-Preises</td></tr>' +
          '<tr><td>Abo-Monatskarte (marego)</td><td>je nach Preisstufe</td></tr>' +
        '</tbody></table></div>' +
        '<div class="lbl">Gut zu wissen</div>' +
        '<div class="kv"><div class="k">Einzelfahrt<small>' + esc(product('einzel').note) + '</small></div></div>' +
        '<div class="kv"><div class="k">24-Stunden-Karte<small>' + esc(product('24h').note) + '</small></div></div>' +
        '<div class="kv"><div class="k">Deutschlandticket<small>' + esc(product('dt').note) + '</small></div></div>' +
        '<div class="kv"><div class="k">Fahrten über Magdeburg hinaus<small>Im Umland gilt der marego-Tarif mit weiteren Preisstufen. Muvit zeigt bei jeder Verbindung eine Tarif-Einschätzung.</small></div></div>';
    }
  };

  /* ---------- Abos verwalten ---------- */
  V.abos = {
    height: 'full',
    render(ctx) {
      const T = M.Tariffs, t = dticket.get();
      ctx.head({ title: 'Abos verwalten' });
      const pv = t && (PROVIDERS[t.provider] || PROVIDERS.other);
      ctx.body.innerHTML = '<div class="lbl" style="padding-top:6px">Meine Abos</div>' +
        (t ? '<div class="card-o"><div class="top"><div class="n">Deutschlandticket</div><div class="p">' + (product('dt').price != null ? M.money(product('dt').price) + '<small>/ Monat</small>' : '') + '</div></div>' +
          '<div class="z">' + esc(pv.label) + (t.since ? ' · seit ' + esc(monthLabel(t.since)) : '') + '</div>' +
          '<div class="d">' + (dtValid(t) ? 'Gültig im ' + esc(monthLabel(ym())) + '.' : 'Derzeit nicht aktiv.') + ' Kündigen kannst du beim Anbieter – meist bis zum 10. eines Monats zum Monatsende.</div>' +
          '<div class="btn-row" style="padding:12px 0 0"><button class="btn-o acc" data-show>' + M.DT_ICON + 'Ticket zeigen</button><button class="btn-o" data-edit>' + icon('settings') + 'Bearbeiten</button>' +
          (pv.url ? '<a class="btn-o" href="' + pv.url + '" target="_blank" rel="noopener">' + icon('external') + 'Beim Anbieter verwalten</a>' : '') + '</div></div>'
          : '<div class="empty-hint" style="padding-bottom:12px">Noch kein Abo in Muvit hinterlegt.</div><div class="btn-row" style="padding-top:0"><button class="btn-o" data-edit>' + icon('plus') + 'Deutschlandticket hinzufügen</button></div>') +
        '<div class="lbl">Abo-Angebote · Stand ' + T.stand + '</div>' +
        ticketCard(product('dt'), { link: DT_INFO, linkText: 'Deutschlandticket abschließen' }) +
        ticketCard(product('abo'), { link: MAREGO, linkText: 'marego-Abo ansehen' }) +
        ticketCard(product('dtjob'), { link: DT_INFO, linkText: 'Mehr zum Jobticket', noPrice: 'mit Arbeitgeber' }) +
        '<div class="hint">' + icon('infoFill') + '<span>Mit dem Deutschlandticket fährst du in ganz Magdeburg (Straßenbahn, Bus, S-Bahn) und bundesweit im Nahverkehr ohne Aufpreis.</span></div>';
      bindAll(ctx.body, '[data-edit]', () => UI.open('dtedit', {}));
      bindAll(ctx.body, '[data-show]', () => UI.switchTab('dticket'));
    }
  };
})(window.Muvit = window.Muvit || {});
