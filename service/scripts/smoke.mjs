// Prüft einen laufenden Muvit-Dienst mit echten Daten:  node scripts/smoke.mjs https://muvit-dienst.<name>.workers.dev
// Fragt Hauptbahnhof (DB), Alter Markt (MVB), Störungen und eine Wagenreihung ab und gibt eine kurze Übersicht aus.
const base = (process.argv[2] || process.env.SERVICE_URL || '').replace(/\/+$/, '');
if (!base) { console.error('Adresse fehlt'); process.exit(2); }
let failed = 0;
const berlinDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' });
const hm = new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' });
async function get(path, params) {
  const url = base + path + (params ? '?' + new URLSearchParams(params) : '');
  const t0 = Date.now();
  const res = await fetch(url, { headers: { Origin: 'https://loris6.github.io' } });
  const body = await res.json().catch(() => ({}));
  console.log(`\n${res.status} ${path} (${Date.now() - t0} ms, CORS: ${res.headers.get('access-control-allow-origin')})`);
  if (!res.ok) { failed++; console.log('  Fehler:', JSON.stringify(body)); }
  return body;
}
const remarks = (r) => (r || []).map((x) => `[${x.type}] ${x.summary || x.text}`).slice(0, 3).join(' · ');
const dep = (d) => `  ${hm.format(new Date(d.plannedWhen))}${d.delay ? ' +' + Math.round(d.delay / 60) : ''} ${d.line && d.line.name} → ${d.direction}` +
  `${d.platform ? ' Gl./Bstg. ' + d.platform : ''}${d.cancelled ? ' AUSFALL' : ''}${d.remarks && d.remarks.length ? '  ' + remarks(d.remarks) : ''}`;

console.log('Muvit-Dienst:', base);
console.log(JSON.stringify(await get('/health')));
const v = await get('/vapid');
console.log('  Push-Schlüssel vorhanden:', !!v.publicKey);

// Deutsche Bahn: Magdeburg Hbf
const st = await get('/db/station', { name: 'Magdeburg Hbf', lat: 52.1302, lon: 11.6276 });
console.log('  Bahnhof:', JSON.stringify(st.station));
let train = null;
if (st.station) {
  const d = await get('/db/departures', { eva: st.station.id, duration: 120 });
  const list = d.departures || [];
  console.log(`  ${list.length} Abfahrten, davon mit Meldungen: ${list.filter((x) => x.remarks && x.remarks.length).length}`);
  list.slice(0, 10).forEach((x) => console.log(dep(x)));
  train = list.find((x) => x.line && /^(ICE|IC|EC)$/.test(x.line.productName) && x.line.fahrtNr) || list.find((x) => x.line && x.line.fahrtNr && /^(RE|RB)$/.test(x.line.productName));
}
// Wagenreihung des ersten Fernzugs
if (train) {
  const pw = new Date(train.plannedWhen);
  const w = await get('/db/wagenreihung', { category: train.line.productName, number: train.line.fahrtNr, eva: st.station.id, date: berlinDate.format(pw), time: pw.toISOString(), admin: train.line.adminCode || '' });
  console.log(`  ${train.line.name} (${train.line.fahrtNr}): verfügbar=${w.available}, Gleis ${w.platform && w.platform.name}, Abschnitte ${(w.platform && w.platform.sectors || []).map((s) => s.name).join('')}, Richtung ${w.direction}`);
  (w.vehicles || []).slice(0, 14).forEach((x) => console.log(`    ${x.engine ? 'Triebkopf/Lok' : 'Wagen ' + (x.number || '–')} ${x.first ? '1.Kl ' : ''}${x.second ? '2.Kl ' : ''}${x.dining ? 'Speise ' : ''}Abschn. ${x.sector || '?'} ${x.start}–${x.end} m  ${x.amenities.map((a) => a.type).join(',')}`));
} else console.log('\n  Kein Zug für die Wagenreihung gefunden');

// MVB über INSA: Alter Markt
const s = await get('/nv/stop', { name: 'Alter Markt', lat: 52.1317, lon: 11.6393 });
console.log('  Haltestelle:', JSON.stringify(s.stop));
if (s.stop) {
  const d = await get('/nv/departures', { stop: s.stop.id, duration: 60 });
  const list = d.departures || [];
  console.log(`  ${list.length} Abfahrten, Echtzeit: ${list.filter((x) => x.delay != null).length}, Ausfälle: ${list.filter((x) => x.cancelled).length}, mit Hinweisen: ${list.filter((x) => x.remarks && x.remarks.length).length}`);
  list.slice(0, 12).forEach((x) => console.log(dep(x)));
  const ch = list.flatMap((x) => (x.remarks || []).map((r) => r.text || r.summary)).filter((t) => /als\s+Linie|weiter\s+als|fortgesetzt/i.test(t || ''));
  if (ch.length) console.log('  Linienwechsel-Hinweise:', [...new Set(ch)].slice(0, 5).join(' | '));
}

// Störungen
const r = await get('/nv/remarks');
const rl = r.remarks || [];
console.log(`  ${rl.length} Störungsmeldungen für Magdeburg`);
rl.slice(0, 8).forEach((x) => console.log(`  - ${x.summary} [${x.lines.map((l) => l.name).join(', ')}]${x.validUntil ? ' bis ' + x.validUntil : ''}`));

console.log(failed ? `\n${failed} Abfrage(n) fehlgeschlagen` : '\nAlle Abfragen erfolgreich');
process.exit(failed ? 1 : 0);
