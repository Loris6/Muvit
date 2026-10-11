/* Muvit – Tarife (marego / MVB Magdeburg, Deutschlandticket)
 * Stand: Tarifreform marego zum 01.08.2026 bzw. Deutschlandticket ab 01.01.2026.
 * Alle Angaben ohne Gewähr – Preise mit null werden nicht geraten, sondern verlinkt.
 */
(function (M) {
  'use strict';

  const T = {
    stand: '01.08.2026',
    verbund: 'marego (Magdeburger Regionalverkehrsverbund) · MVB',
    links: [
      { label: 'marego Tarifauskunft', url: 'https://www.marego-heimat.de/' },
      { label: 'MVB Fahrkarten', url: 'https://www.mvbnet.de/fahrkarten/' },
      { label: 'Deutschlandticket', url: 'https://www.bahn.de/angebot/regio/deutschland-ticket' },
      { label: 'DB Fahrkarten', url: 'https://www.bahn.de/' }
    ],
    products: [
      {
        id: 'einzel', cls: 't1', name: 'Einzelfahrt Magdeburg', zone: 'Preisstufe MD',
        price: 3.30, app: 3.00, child: 2.50, childApp: 2.30,
        note: 'Eine Fahrt in eine Richtung im Stadtgebiet Magdeburg, Umsteigen inklusive. Per App/online ca. 10 % günstiger.',
        tags: ['Straßenbahn', 'Bus', 'Umsteigen inkl.', 'App-Rabatt']
      },
      {
        id: 'kurz', cls: 't2', name: 'Kurzstrecke', zone: 'MVB',
        price: 2.00, app: 1.80,
        note: 'Für kurze Fahrten weniger Haltestellen – Geltungsbereich laut MVB-Tarif.',
        tags: ['Kurze Wege', 'App-Rabatt']
      },
      {
        id: '24h', cls: 't3', name: '24-Stunden-Karte', zone: 'Preisstufe MD / Lokal',
        price: null,
        note: 'Seit der Tarifreform 2026 Hauptprodukt für Gelegenheitsfahrten: lohnt sich ab der 2. Fahrt, Kinder fahren mit. Aktuellen Preis bitte in der marego-Tarifauskunft prüfen.',
        tags: ['Ab 2. Fahrt günstiger', 'Kinder fahren mit']
      },
      {
        id: 'dt', cls: 't4', name: 'Deutschlandticket', zone: 'bundesweit',
        price: 63.00, unit: '/ Monat',
        note: 'Unbegrenzt im gesamten Nah- und Regionalverkehr in Deutschland: Bus, Straßenbahn, U-/S-Bahn, RE/RB. Nicht gültig in ICE, IC und EC. Preis seit 01.01.2026.',
        tags: ['Monatsabo', 'Ganz Deutschland', 'Kein Fernverkehr']
      },
      {
        id: 'abo', cls: 't6', name: 'Abo-Monatskarte (persönlich)', zone: 'marego',
        price: null,
        note: 'Für regelmäßige Fahrten im marego-Gebiet; Kinder fahren im Abo kostenlos mit. Preis je nach Preisstufe – siehe marego.',
        tags: ['Pendler', 'Kinder kostenlos']
      }
    ]
  };

  /** Tarif-Einschätzung für eine Verbindung */
  T.estimate = function (j) {
    const transit = (j.legs || []).filter((l) => !l.walk);
    if (!transit.length) return { kind: 'walk', title: 'Zu Fuß – kostenlos', price: 0, note: 'Für diese Strecke brauchst du kein Ticket.' };
    const hasFern = transit.some((l) => l.mode === 'fern');
    const pts = [];
    transit.forEach((l) => { pts.push(l.from, l.to); (l.stops || []).forEach((s) => pts.push(s)); });
    const allMD = pts.every((p) => p && M.inMagdeburg(p.lat, p.lon));
    const onlyCity = transit.every((l) => l.mode === 'tram' || l.mode === 'bus');
    if (allMD && !hasFern) {
      const stopsCount = transit.length === 1 ? (transit[0].stops || []).length + 1 : 99;
      const p = T.products[0];
      return {
        kind: 'md', title: 'Einzelfahrt Magdeburg (MD)', price: p.price, app: p.app,
        note: (stopsCount <= 4 && onlyCity ? 'Kurze Strecke – ggf. reicht die Kurzstrecke (' + M.money(2) + '). ' : '') +
          'Mit Deutschlandticket kostenlos. Stand ' + T.stand + ', ohne Gewähr.'
      };
    }
    if (hasFern) {
      return { kind: 'db', title: 'DB-Fernverkehrsticket', price: j.price ? j.price.amount : null, note: 'Enthält ICE/IC/EC – Deutschlandticket hier nicht gültig. Preis live über die DB abrufbar.' };
    }
    return { kind: 'verbund', title: 'Verbund-/Nahverkehrstarif', price: j.price ? j.price.amount : null, note: 'Regionalverkehr über die Stadtgrenze: marego- bzw. DB-Nahverkehrstarif. Mit Deutschlandticket (63 €/Monat) ohne Aufpreis.' };
  };

  /** Kompakte Form für den KI-Assistenten */
  T.forAI = function () {
    return {
      stand: T.stand, verbund: T.verbund, hinweis: 'Preise ohne Gewähr. null = Preis nicht hinterlegt, auf marego verweisen.',
      produkte: T.products.map((p) => ({
        name: p.name, preisstufe: p.zone, preis_eur: p.price, app_preis_eur: p.app || null,
        kind_eur: p.child || null, kind_app_eur: p.childApp || null, einheit: p.unit || 'pro Fahrt/Ticket', info: p.note
      })),
      links: T.links
    };
  };

  M.Tariffs = T;
})(window.Muvit = window.Muvit || {});
