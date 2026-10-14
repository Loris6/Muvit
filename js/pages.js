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
     D-Ticket – das eigene Deutschlandticket zeigen
     ===================================================================== */
  V.dticket = {
    height: 'full',
    render(ctx) {
      const t = dticket.get(), p = profile.get();
      ctx.head({ title: 'Deutschlandticket', actions: t ? [{ icon: 'settings', label: 'Ticket bearbeiten', onClick: () => UI.open('dtedit', {}) }] : [] });
      const dt = product('dt');
      let h = '';
      if (t) {
        const ok = dtValid(t), pv = PROVIDERS[t.provider] || PROVIDERS.other;
        const holder = t.name || profile.name(p);
        const born = t.born || (p && p.born);
        h += '<div class="dt-card' + (ok ? '' : ' off') + '">' +
          '<div class="dt-top"><span class="dt-logo">' + M.DT_ICON + '</span><div style="min-width:0"><div class="dt-t">Deutschlandticket</div><div class="dt-s">' + esc(pv.short) + ' · ' + (dt.price != null ? M.money(dt.price) + ' / Monat' : 'Monatsabo') + '</div></div>' +
          '<span class="dt-state">' + (ok ? icon('check') + 'Abo aktiv' : 'Nicht aktiv') + '</span></div>' +
          '<div class="dt-grid">' +
            '<div><small>Aktueller Monat</small><b>' + esc(ok ? monthLabel(ym()) : t.since ? 'ab ' + monthLabel(t.since) : '–') + '</b>' + (ok ? '<span>' + dtRange() + '</span>' : '') + '</div>' +
            '<div><small>Inhaber/in</small><b>' + esc(holder || '–') + '</b>' + (born ? '<span>geb. ' + esc(dateLabel(born)) + '</span>' : '') + '</div>' +
          '</div>' +
          (t.img ? '<button class="dt-code" data-zoom><img src="' + t.img + '" alt="Barcode deines Deutschlandtickets"></button><div class="dt-cap">Barcode deines Anbieters · zum Vergrößern antippen</div>'
            : '<div class="dt-nocode">' + icon('qrcode') + '<span>Den Barcode zeigst du in der App oder auf der Chipkarte deines Anbieters. Du kannst hier ein Bild davon hinterlegen.</span></div>') +
        '</div>' +
        '<div class="btn-row">' + (pv.url ? '<a class="btn-o acc" href="' + pv.url + '" target="_blank" rel="noopener">' + icon('external') + 'Beim Anbieter öffnen</a>' : '') +
          '<button class="btn-o" data-edit>' + icon('settings') + 'Bearbeiten</button></div>' +
        '<div class="hint" style="padding-top:14px">' + icon('infoFill') + '<span>Bei Kontrollen zählt der Barcode deines Anbieters zusammen mit einem amtlichen Lichtbildausweis. Muvit stellt keine Fahrkarten aus.</span></div>';
      } else {
        h += '<div class="dt-empty">' + '<span class="dt-logo big">' + M.DT_ICON + '</span>' +
          '<b>Noch kein Deutschlandticket hinterlegt</b><span>Hinterlege dein Abo, damit du es hier mit einem Tipp zeigen kannst – auch ohne Internet.</span>' +
          '<div class="btn-row" style="justify-content:center;padding:16px 0 0"><button class="btn-a" data-add>' + icon('plus') + 'Mein Ticket hinzufügen</button></div>' +
          '<a class="btn-o" href="' + DT_INFO + '" target="_blank" rel="noopener" style="margin-top:10px">' + icon('ticketR') + 'Deutschlandticket kaufen</a></div>';
      }
      h += '<div class="lbl">Das Deutschlandticket</div>' + ticketCard(dt, {}) +
        '<div class="kv"><div class="k">Wo gilt es?<small>Bundesweit in Bus, Straßenbahn, U- und S-Bahn sowie RE/RB. Nicht in ICE, IC und EC.</small></div></div>' +
        '<div class="kv"><div class="k">Kündigen<small>Monatlich kündbar – meist bis zum 10. eines Monats zum Monatsende, beim Anbieter.</small></div></div>';
      ctx.body.innerHTML = h;
      bindAll(ctx.body, '[data-add], [data-edit]', () => UI.open('dtedit', {}));
      bindAll(ctx.body, '[data-zoom]', (b) => b.classList.toggle('zoom'));
    }
  };

  /** Bild verkleinern (Barcodes bleiben scharf: PNG, notfalls JPEG) */
  function shrinkImage(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onerror = () => reject(new Error('Bild konnte nicht gelesen werden'));
      r.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('Kein gültiges Bild'));
        img.onload = () => {
          const k = Math.min(1, 1100 / Math.max(img.width, img.height));
          const c = document.createElement('canvas');
          c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
          const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(img, 0, 0, c.width, c.height);
          let url = c.toDataURL('image/png');
          if (url.length > 1500000) url = c.toDataURL('image/jpeg', 0.9);
          resolve(url);
        };
        img.src = r.result;
      };
      r.readAsDataURL(file);
    });
  }

  V.dtedit = {
    height: 'full',
    render(ctx) {
      const t = dticket.get() || { provider: 'mvb', since: ym(), active: true };
      const p = profile.get() || {};
      ctx.head({ title: 'Mein Deutschlandticket' });
      let img = t.img || '';
      ctx.body.innerHTML =
        '<div class="hint" style="padding:6px var(--pad) 16px">' + icon('infoFill') + '<span>Deine Angaben bleiben nur auf diesem Gerät. Muvit verkauft und erzeugt keine Tickets.</span></div>' +
        '<label class="field"><span>Anbieter</span><select class="inp" data-f="provider">' + Object.keys(PROVIDERS).map((k) => '<option value="' + k + '"' + (t.provider === k ? ' selected' : '') + '>' + esc(PROVIDERS[k].label) + '</option>').join('') + '</select></label>' +
        '<label class="field"><span>Abo seit</span><input class="inp" type="month" data-f="since" value="' + esc(t.since || ym()) + '"></label>' +
        '<label class="field"><span>Name auf dem Ticket</span><input class="inp" data-f="name" autocomplete="name" placeholder="' + esc(profile.name(p) || 'Vor- und Nachname') + '" value="' + esc(t.name || '') + '"></label>' +
        '<label class="field"><span>Geburtsdatum</span><input class="inp" type="date" data-f="born" value="' + esc(t.born || p.born || '') + '"></label>' +
        '<div class="kv" style="border-top:1px solid var(--sep)"><div class="k">Abo aktiv<small>Ausschalten, wenn du gekündigt hast</small></div><label class="sw"><input type="checkbox" data-f="active"' + (t.active !== false ? ' checked' : '') + '><span></span></label></div>' +
        '<div class="lbl">Bild des Barcodes (optional)</div>' +
        '<div class="dt-pick"><div data-prev>' + (img ? '<img src="' + img + '" alt="">' : icon('qrcode')) + '</div><div style="min-width:0"><span>Screenshot oder Foto des Barcodes aus der App deines Anbieters.</span>' +
        '<div class="btn-row" style="padding:10px 0 0"><label class="btn-o">' + icon('plus') + 'Bild wählen<input type="file" accept="image/*" data-file hidden></label>' + '<button class="btn-o" data-noimg' + (img ? '' : ' hidden') + '>' + icon('trash') + 'Entfernen</button></div></div></div>' +
        '<button class="btn-a full" data-save style="margin-top:18px">' + icon('check') + 'Speichern</button>' +
        (dticket.get() ? '<div class="btn-row"><button class="btn-o" data-del>' + icon('trash') + 'Ticket aus Muvit entfernen</button></div>' : '');
      const f = (k) => M.$('[data-f="' + k + '"]', ctx.body);
      const prev = M.$('[data-prev]', ctx.body), noimg = M.$('[data-noimg]', ctx.body);
      M.$('[data-file]', ctx.body).addEventListener('change', async (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        try { img = await shrinkImage(file); prev.innerHTML = '<img src="' + img + '" alt="">'; noimg.hidden = false; }
        catch (err) { M.toast(err.message, { type: 'err' }); }
      });
      noimg.addEventListener('click', () => { img = ''; prev.innerHTML = icon('qrcode'); noimg.hidden = true; });
      bindAll(ctx.body, '[data-save]', () => {
        const next = { provider: f('provider').value, since: f('since').value || ym(), name: f('name').value.trim(), born: f('born').value, active: f('active').checked, img };
        if (!dticket.set(next)) { M.toast('Das Bild ist zu groß für den Speicher – bitte einen kleineren Ausschnitt wählen.', { type: 'err', ms: 6000 }); return; }
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
        { k: 'plan', icon: 'map', title: 'ÖPNV Netz- & Tarifpläne', sub: 'Liniennetz, Nachtnetz, Tarifzonen' },
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

  /* ---------- ÖPNV Netz- & Tarifpläne ---------- */
  V.plaene = {
    height: 'full',
    render(ctx) {
      ctx.head({ title: 'Netz- & Tarifpläne' });
      const ext = (url) => '<span class="c-gray" style="font-size:13px">' + esc(url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/.*$/, '')) + '</span>' + icon('external');
      const L = [
        { k: 'live', icon: 'netz', title: 'Live-Netzplan', sub: 'Alle Linien und Fahrzeuge in Echtzeit – in Muvit' },
        { k: 'u:https://www.mvbnet.de/', icon: 'map', title: 'Liniennetzplan Straßenbahn & Bus', sub: 'MVB Magdeburg' },
        { k: 'u:https://www.mvbnet.de/', icon: 'moon', title: 'Nachtnetz', sub: 'Nachtlinien der MVB' },
        { k: 'u:' + MAREGO, icon: 'document', title: 'Tarifzonenplan marego', sub: 'Preisstufen im Verbund' },
        { k: 'u:' + MAREGO, icon: 'document', title: 'Tarifbestimmungen', sub: 'marego-Tarif' },
        { k: 'u:' + DT_INFO, icon: 'ticketR', title: 'Deutschlandticket', sub: 'Geltungsbereich und Bedingungen' }
      ];
      ctx.body.innerHTML = '<div class="lbl" style="padding-top:6px">Pläne</div>' +
        L.map((x, i) => C.lrow({ icon: x.icon, title: esc(x.title), sub: esc(x.sub), end: x.k.startsWith('u:') ? ext(x.k.slice(2)) : '', chev: !x.k.startsWith('u:') }, i)).join('') +
        '<div class="hint" style="padding-top:16px">' + icon('infoFill') + '<span>Die offiziellen Pläne als PDF stellen MVB und marego auf ihren Seiten bereit.</span></div>';
      bindAll(ctx.body, '.lrow', (el) => {
        const x = L[+el.dataset.i];
        if (x.k === 'live') { UI.toAuskunft(); UI.open('netz', {}); } else window.open(x.k.slice(2), '_blank', 'noopener');
      });
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
