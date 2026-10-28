// Muvit-Dienst – Tests ohne Netz: Bibliotheken werden durch Testdaten ersetzt (Format wie hafas-client/db-vendo-client)
import assert from 'node:assert/strict';
import worker from '../src/index.mjs';
import * as DB from '../src/db.mjs';
import * as NV from '../src/nv.mjs';

const now = new Date('2026-10-28T14:00:00+01:00');
const iso = (m) => new Date(now.getTime() + m * 60000).toISOString();
DB._setClient({
  nearby: async () => [{ type: 'stop', id: '8010224', name: 'Magdeburg Hbf', location: { latitude: 52.1306, longitude: 11.6269 } }, { type: 'stop', id: '8013477', name: 'Magdeburg-Neustadt' }],
  locations: async () => [],
  departures: async () => ({ departures: [
    { tripId: 'db1', when: iso(7), plannedWhen: iso(2), delay: 300, platform: '3', plannedPlatform: '2', cancelled: false, direction: 'Leipzig Hbf',
      line: { name: 'ICE 376', productName: 'ICE', product: 'nationalExpress', fahrtNr: '376', adminCode: '80', operator: { name: 'DB Fernverkehr AG' } },
      remarks: [{ type: 'warning', summary: null, text: 'Verspätung aus vorheriger Fahrt' }, { type: 'hint', code: 'BR', text: 'Bordrestaurant' }] }
  ] }),
  trip: async (id) => ({ trip: { id, line: { name: 'ICE 376' }, direction: 'Leipzig Hbf', stopovers: [{ stop: { id: '8010224', name: 'Magdeburg Hbf' }, departure: iso(7), plannedDeparture: iso(2), departureDelay: 300, departurePlatform: '3', plannedDeparturePlatform: '2', remarks: [] }], remarks: [] } })
});
NV._setClient({
  nearby: async () => [{ type: 'stop', id: '7393', name: 'Magdeburg, City Carré' }, { type: 'stop', id: '7394', name: 'Magdeburg, Hauptbahnhof' }],
  locations: async () => [],
  departures: async () => ({ departures: [
    { tripId: 'nv1', when: iso(4), plannedWhen: iso(3), delay: 60, platform: '2', cancelled: false, direction: 'Sudenburg', line: { name: 'STR 13', productName: 'STR', product: 'tram', operator: { name: 'Magdeburger Verkehrsbetriebe' } },
      remarks: [{ type: 'warning', text: 'Verspätung aus vorheriger Fahrt' }] }
  ] }),
  trip: async (id) => ({ trip: { id, line: { name: 'STR 2' }, direction: 'City Carré', remarks: [{ type: 'hint', text: 'Fahrt wird ab City Carré als Linie 13 fortgesetzt' }], stopovers: [] } }),
  remarks: async () => ({ remarks: [
    { id: 'h1', summary: 'Bauarbeiten Ernst-Reuter-Allee', text: 'Linien 2 und 5 fahren eine Umleitung.', priority: 50, affectedLines: [{ name: 'STR 2', product: 'tram', operator: { name: 'Magdeburger Verkehrsbetriebe GmbH & Co. KG' } }, { name: 'STR 2', product: 'tram', operator: { name: 'MVB' } }] },
    { id: 'h2', summary: 'Gleisbauarbeiten', text: 'Linie 7 in der Magdeburger Straße', priority: 80, affectedLines: [{ name: 'Str 7', product: 'tram', operator: { name: 'HAVAG' } }] },
    { id: 'h3', summary: 'Haltestellenausfall: Halle, Kaufland Trotha', text: '', priority: 70, edges: [{ fromLocation: { name: 'Halle, Trotha', crd: { x: 11950000, y: 51520000 } } }] },
    { id: 'h4', summary: 'Haltestelle Milchweg verlegt', text: '', priority: 40, edges: [{ fromLocation: { name: 'Magdeburg, Milchweg', crd: { x: 11632000, y: 52172000 } } }] },
    { id: 'h5', summary: 'Sperrung in der Innenstadt von Magdeburg', text: '', priority: 30 },
    { id: 'h6', summary: 'Umleitung Magdeburger Straße', text: 'Halle', priority: 30 }
  ] })
});

const env = { ALLOW_ORIGIN: 'https://loris6.github.io' };
const call = async (path) => {
  const res = await worker.fetch(new Request('https://dienst.test' + path, { headers: { Origin: 'https://loris6.github.io' } }), env, { waitUntil() {} });
  return { status: res.status, cors: res.headers.get('access-control-allow-origin'), body: await res.json() };
};

let r = await call('/health');
assert.equal(r.status, 200); assert.equal(r.body.push, false); assert.equal(r.cors, 'https://loris6.github.io');
r = await call('/db/station?name=Hauptbahnhof&lat=52.13&lon=11.62');
assert.equal(r.body.station.id, '8010224');
r = await call('/nv/stop?name=Nirgendwo');
assert.equal(r.status, 404);
r = await call('/db/departures?eva=8010224');
assert.equal(r.body.departures[0].remarks[0].text, 'Verspätung aus vorheriger Fahrt');
assert.equal(r.body.departures[0].line.operator, 'DB Fernverkehr AG');
r = await call('/db/departures');
assert.equal(r.status, 400);
r = await call('/nv/stop?name=City%20Carr%C3%A9&lat=52.1296&lon=11.63');
assert.equal(r.body.stop.id, '7393');
r = await call('/nv/departures?stop=7393');
assert.equal(r.body.departures[0].line.name, 'STR 13');
r = await call('/nv/trip?id=x');
assert.match(r.body.trip.remarks[0].text, /als Linie 13/);
r = await call('/nv/remarks');
assert.deepEqual(r.body.remarks.map((x) => x.id + ':' + x.why), ['h1:mvb', 'h4:ort', 'h5:text']);
assert.equal(r.body.remarks[0].lines.length, 1);
r = await call('/vapid');
assert.equal(r.body.publicKey, null);

// Wagenreihung (Format von bahn.de „vehicle-sequence“)
const seq = DB.normalizeSequence({
  platform: { name: '7', start: 0, end: 420, sectors: [{ name: 'G', start: 0, end: 60 }, { name: 'F', start: 60, end: 120 }] },
  groups: [{ name: 'ICE0376', transport: { category: 'ICE', number: 376, destination: { name: 'Berlin Hbf' } }, vehicles: [
    { wagonIdentificationNumber: 12, status: 'OPEN', platformPosition: { start: 27, end: 52, sector: 'G' }, type: { category: 'PASSENGERCARRIAGE_FIRST_CLASS', hasFirstClass: true, hasEconomyClass: false, constructionType: 'Apmz' }, amenities: [{ type: 'AIR_CONDITION', status: 'AVAILABLE' }, { type: 'SEATS_BAHN_COMFORT', status: 'AVAILABLE' }] },
    { wagonIdentificationNumber: 14, status: 'OPEN', platformPosition: { start: 0, end: 26, sector: 'G' }, type: { category: 'POWERCAR' } },
    { wagonIdentificationNumber: 10, status: 'CLOSED', platformPosition: { start: 53, end: 78, sector: 'F' }, type: { category: 'HALFDININGCAR_FIRST_CLASS', hasFirstClass: true } }
  ] }]
});
assert.equal(seq.available, true);
assert.deepEqual(seq.vehicles.map((v) => v.number), ['14', '12', '10']);
assert.equal(seq.vehicles[0].engine, true);
assert.equal(seq.vehicles[2].dining && seq.vehicles[2].closed, true);
assert.equal(seq.platform.sectors.length, 2);
assert.equal(DB.normalizeSequence(null).available, false);
console.log('Muvit-Dienst: alle Tests bestanden');
