# Muvit

**Muvit** ist eine moderne Mobilitäts-Web-App für **Magdeburg** und ganz Deutschland, gebaut mit reinem **HTML, CSS und JavaScript** (ohne Build-Schritt). Schriftart: **Rubik**.

Die Karte liegt immer im Hintergrund. Alle Inhalte stecken in einem dunklen Sheet über die volle Breite (`100vw`). Das Sheet lässt sich frei hoch- und runterziehen, so bestimmst du selbst, wie viel Karte du siehst. Das funktioniert per Griff, Wischen im Inhalt oder Mausrad.

## Funktionen

| Bereich | Was Muvit kann |
|---|---|
| **Suche** | Nur Haltestellen im Bediengebiet der MVB: Magdeburg mit Randgebieten und Biederitz (`CONFIG.serviceBBox`) – keine Treffer aus anderen Städten |
| **Untere Leiste** | Über die ganze Breite, bis ganz unten: **Auskunft**, **Tickets**, **D-Ticket** und **Mehr** – jeder Bereich merkt sich seinen eigenen Verlauf |
| **Startframe** | „Wo geht's hin?“ mit Start/Ziel und Tauschen, sechs Schnellzugriffe (Abfahrten, Verkehrsmelder, Abonnements, Netzplan, Ticket kaufen, Assistance) und Verlauf |
| **Karte** | MapLibre GL mit OpenFreeMap (Hell/Dunkel); Haltestellen als „H“-Schild (Zeichen 224). Ein Tipp auf eine Haltestelle öffnet direkt ihre Abfahrten. Standort mit Genauigkeitskreis; langes Drücken auf die Karte öffnet „Von hier / Nach hier / Haltestellen“ |
| **Live-Karte** | Alle Straßenbahnen, Busse und Züge der ganzen Stadt in Echtzeit, flüssig entlang der Strecke animiert. Trams und Busse zeigen auf der Karte nur ihre Liniennummer, Züge zusätzlich das S-Bahn- bzw. DB-Logo. Weit herausgezoomt zeigt die Karte die Züge in ganz Deutschland |
| **Verbindungen** | Echtzeit-Routing mit Verspätungen und Gleisen. Die Karten zeigen eine proportionale Linien-Leiste und Badges wie „Schnellste“ oder „Wenigste Umstiege“. „Früher/Später“, Filter für das Deutschlandticket, bis zu 2 Zwischenhalte mit Mindestaufenthalt |
| **Verbindung** | Zeitstrahl in Linienfarben mit Gleis, Verspätung, aufklappbaren Zwischenhalten, Fußwegen, Hinweisen/Störungen, Tarif-Einschätzung, DB-Live-Preis, Teilen und Merken |
| **Abfahrten / Haltestelle** | Abfahrten nach Tagen getrennt (heute, morgen). Fährt ein Verkehrsmittel stundenlang nicht (z. B. Baustelle), steht statt Abfahrten in Tagen „Derzeit kein Straßenbahnverkehr“ mit Grund. Filter nur mit Logos (Bus, Tram, S-Bahn, Regional-, Fernverkehr). Störungen öffnen sich in einem aufgeklappten Extra-Fenster. Suche nach Haltestelle oder Linie, Tabs Verlauf/Favoriten/In der Nähe. Die Haltestellenansicht zeigt eine Echtzeit-Abfahrtstafel mit Countdown, Status (pünktlich, früher, verspätet, fällt aus), Bahnsteig (Bstg.) bei Tram und Bus bzw. Gleis bei Zügen (Gleiswechsel rot hinterlegt) und Filter nach Verkehrsmittel. Unter jeder Linie stehen bei Bedarf Hinweise wie „Baustellenbedingte Umleitung“, „Weiter als [Tram][13] nach Sudenburg“ oder „Kommt als [Tram][2] aus …“ |
| **In der Nähe** | Haltestellen im Umkreis mit selbst berechneter Entfernung (Haversine ab Geräteposition), Gehzeit und Himmelsrichtung, dazu eine Vorschau der nächsten Abfahrten |
| **Fahrtverlauf & Netzplan** | „Ich fahre mit“: Die GPS-Position zeigt, wo die Bahn wirklich ist (inkl. Abweichung vom Fahrplan). Bahnen halten auf Karte und Verlauf an jeder Haltestelle. Ausgefallene Halte: Name, Zeiten und Status rot durchgestrichen. Uhrzeit laut Plan und daneben die voraussichtliche, auf dem Handy nur die voraussichtliche. Die Linienliste kommt vollständig aus den Fahrplandaten (auch Sonderlinien wie 15), nur Linien in Magdeburg. Netz- und Tarifpläne (Liniennetz Straßenbahn/Bus/Nacht auf der Karte, Tarifübersicht) direkt in der App. Ein Tipp auf eine Linie öffnet den Fahrtverlauf mit allen Halten, Echtzeit und Live-Position auf der Karte. Die Linie ist durchgehend in Linienfarbe, weiß umrandet, mit Haltestellenpunkten (weiß, bei hellen Linien wie Tram 3 schwarz). Fährt das Fahrzeug als andere Linie weiter, endet der Verlauf am Wechselhalt (z. B. Linie 1 bis City Carré) und nach einer Lücke folgt „Weiter als [Tram][5] nach Klinikum Olvenstedt“ mit dem Verlauf in der Farbe der neuen Linie. Der Netzplan zeigt die ganze Stadt und listet alle Linien einschließlich der Nachtlinien |
| **Tickets** | Alle Tickets für Magdeburg: Einzelfahrt, Kurzstrecke, 24-Stunden-, Wochen- und Monatskarte, Deutschlandticket (auch Job und Semester), marego-Abo und DB-Tickets (Stand 08/2026), dazu Preisermittlung für eine Strecke und DB-Preise live |
| **D-Ticket** | Das eigene Deutschlandticket, an die Bildschirmgröße angepasst. Code per Screenshot aus Apple Wallet, Google Wallet oder der App des Anbieters hinzufügen: Muvit liest den Aztec- bzw. QR-Code und zeigt ihn grün im Muvit-Design. Jeder gezeichnete Code wird vor dem Anzeigen erneut gelesen und mit dem Original verglichen (Daten Byte für Byte gleich), sonst schwarz-weiß bzw. das Originalbild. Vollbild mit Kontrollansicht. Alles bleibt auf dem Gerät; Muvit stellt keine Fahrkarten aus |
| **Mehr** | „Willkommen in der Muvit App“, Mein Profil (Anmelden, nur auf diesem Gerät), Reise-Optionen (Verkehrsmittel, Umstiege, barrierefrei), Einstellungen, Favoriten, ÖPNV Netz- & Tarifpläne und Abos verwalten |
| **Assistance (Muvit KI)** | Claude (Anthropic) mit Tool-Use auf echte Daten: Routen von A nach B (auch über C mit XX Min Aufenthalt), Abfahrten, Linien, Tarife, DB-Preise und Haltestellen in der Nähe. Mit Streaming und Spracheingabe. Ohne API-Schlüssel beantwortet ein Basis-Modus typische Fragen |

Muvit ist eine App für Magdeburg: Haltestellen und Orte erscheinen ohne den Zusatz „Magdeburg“, also „Sudenburg“ statt „Magdeburg, Sudenburg“. Orte außerhalb behalten ihren Ortsnamen, Züge in ganz Deutschland werden weiterhin angezeigt.

### Verbindung überwachen

In der Verbindung startet „Überwachen“ die Überwachung. Muvit prüft dann jede Minute die Echtzeit aller Teilstrecken. Wird ein Umstieg zu knapp oder fällt eine Fahrt aus, kommt eine Mitteilung mit den schnellsten Alternativen ab dem Umstiegshalt. Oben erscheint eine Leiste mit „Alternativen“.

Auf dem iPhone gibt es Mitteilungen nur, wenn Muvit auf dem Home-Bildschirm liegt (ab iOS 16.4).

Ohne weitere Einrichtung prüft Muvit nur, solange die App geöffnet ist. Für Mitteilungen bei **geschlossener App** liegt im Ordner [`push/`](push/README.md) ein kleiner Push-Dienst als kostenloser Cloudflare Worker bereit. Er prüft jede Minute und meldet:
- verpasste Anschlüsse mit der schnellsten Alternative
- Ausfälle
- Verspätungen ab 5 Minuten

Nach der einmaligen Einrichtung reicht es, in `js/core.js` die Adresse und den öffentlichen Schlüssel einzutragen.

### Durchläufer („fährt weiter als …“)

Muvit zeigt Linienwechsel nur an den Wechsel-Haltestellen der MVB: **City Carré** und **Hauptbahnhof** (`CONFIG.changeStops` in `js/core.js`). An normalen Endstellen wie Klinikum Olvenstedt fährt einfach die nächste Linie ab. Dort erscheint kein „weiter als“.

Die Fahrplandaten enthalten nicht direkt, ob ein Fahrzeug als andere Linie weiterfährt. Muvit erkennt das so:

- Maßgeblich ist das **Ziel an der Haltestelle** (z. B. Linie 1 „City Carré“), nicht die letzte Haltestelle der Fahrt. Geht die Fahrt in den Daten weiter (bis Klinikum Olvenstedt), endet der Verlauf trotzdem am Wechselhalt.
- Am Wechselhalt sucht Muvit die Linie, mit der dasselbe Fahrzeug weiterfährt: gleiches Verkehrsmittel, gleicher Bahnsteig, bis 12 Minuten später und – wenn die Fahrt weitergeht – dasselbe Ziel. Bekannte Wechsel (`CONFIG.lineChanges`, z. B. 1 → 5 und 2 → 13 an City Carré) haben Vorrang und benennen die Linie auch dann, wenn die Daten sie nicht nennen.
- Das „nach …“ ist immer die Endhaltestelle der Weiterfahrt, nie der Wechselhalt selbst.

Gibt es dafür keinen Beleg, endet der Verlauf am angezeigten Ziel – Muvit zeigt nie eine Weiterfahrt „als dieselbe Linie“ oder eine Leerfahrt ins Depot.

Für „kommt als …“ gilt das umgekehrt. Hinweise aus den Störungsmeldungen werden zusätzlich ausgewertet.

## Datenquellen (echte APIs)

- **[Transitous](https://transitous.org)** (MOTIS 2, `api.transitous.org`): Fahrplan und Echtzeit für ganz Europa, darunter die MVB-Straßenbahnen und -Busse in Magdeburg (DELFI) sowie Regional- und Fernverkehr. Muvit nutzt `geocode`, `plan`, `stoptimes`, `trip`, `map/stops` und `map/trips` (Live-Fahrzeuge).
- **[db.transport.rest](https://v6.db.transport.rest)** (Deutsche Bahn): automatischer Fallback und Quelle für DB-Ticketpreise. In den Einstellungen lässt sich die DB auch als primäre Quelle wählen.
- **Karte:** © [OpenStreetMap](https://www.openstreetmap.org/copyright)-Mitwirkende, Vektor-Kacheln von [OpenFreeMap](https://openfreemap.org), CARTO-Raster als Fallback.
- **Code-Leser:** [ZXing for JS](https://github.com/zxing-js/library) (Apache-2.0), wird nur auf der D-Ticket-Seite geladen.
- **Icons:** [Uicons by Flaticon](https://www.flaticon.com/uicons) (Regular, Bold und Solid Rounded aus `@flaticon/flaticon-uicons` 3.3.1). Die Glyphen sind als SVG-Pfade in `js/icons.js` eingebettet. Die Flaticon-Lizenz verlangt eine Namensnennung, sie steht in den Einstellungen unter „Über Muvit“.
- **Tarife:** Werte in `js/tariffs.js` (marego-Tarifreform 01.08.2026, Deutschlandticket 63 €/Monat seit 01.01.2026). Alle Angaben ohne Gewähr. Fehlende Preise werden nicht geschätzt, Muvit verlinkt dann auf die offizielle Tarifauskunft.

Die Karte braucht keinen API-Schlüssel. Sie startet im dunklen Design (in den Einstellungen umschaltbar).

## Starten

Geolocation funktioniert nur in einem sicheren Kontext, also unter `https://` oder `http://localhost`. Deshalb die App am besten über einen lokalen Server starten:

```bash
# im Projektordner
python3 -m http.server 8080
# oder
npx serve .
```

Danach `http://localhost:8080` öffnen. Für das Smartphone die App per HTTPS hosten (siehe unten).

## Auf dem iPhone (iOS)

Muvit läuft in Safari auf **iOS 15 oder neuer**, ebenso als Web-App auf dem Home-Bildschirm.

1. **Per HTTPS hosten**, z. B. mit GitHub Pages oder Netlify. iOS gibt den Standort nur auf `https://`-Seiten frei. Eine lokale Adresse wie `http://192.168…` reicht dafür nicht.
2. Die Seite in **Safari** öffnen und den Standortzugriff erlauben.
3. Über **Teilen → „Zum Home-Bildschirm“** installieren. Muvit startet dann im Vollbild mit eigenem App-Icon.

Für iOS ist bereits gesorgt:
- Safe-Area für Notch und Home-Indikator
- Kein Hineinzoomen beim Tippen in Eingabefelder
- Das Sheet bleibt über der Bildschirmtastatur
- Kein Gummiband-Scrollen der Seite
- PNG-App-Icon
- Claude-SDK ohne Regex-Lookbehind, damit es auch vor iOS 16.4 lädt

Die Spracheingabe der KI nutzt die Diktierfunktion von iOS. Sie muss in den Einstellungen aktiviert sein.

## Muvit KI einrichten

1. Einen API-Schlüssel unter [console.anthropic.com](https://console.anthropic.com) erstellen.
2. In Muvit **Einstellungen → Muvit KI** den Schlüssel eintragen und auf „Schlüssel testen“ tippen.
3. Optional Modell wählen (Standard: Claude Opus 5.5; Sonnet 5.5 und Haiku 5.5 sind schneller) und den Antwortstil festlegen.

Der Schlüssel bleibt nur im `localStorage` dieses Browsers und wird direkt an `api.anthropic.com` gesendet. Für eine öffentliche Bereitstellung empfiehlt sich ein kleiner Server-Proxy, damit Nutzer keinen eigenen Schlüssel brauchen.

Bei Opus und Sonnet ist der serverseitige Fallback aktiviert (`fallbacks: "default"`): Lehnt das Modell eine Anfrage ab, beantwortet automatisch ein anderes Modell sie.

## Projektstruktur

```
index.html              Startframe, Karte, Sheet
css/muvit.css           Design-System (dunkles Sheet, Linien-Badges, Handy/Tablet)
js/core.js              Konfiguration, Zeit (Europe/Berlin), Geometrie, Farben, Standort, Speicher
js/icons.js             Flaticon-Uicons (eingebettet) & Haltestellenschild
js/api.js               Transitous- & DB-Client, Normalisierung, Fallback
js/tariffs.js           Tarifdaten & Tarif-Einschätzung
js/map.js               MapLibre: H-Schilder, Live-Fahrzeuge, Routen, Linienverläufe
js/ui.js                Ziehbares Sheet, Navigation, Komponenten (Badges, Abfahrten …)
js/views.js             Ansichten der Auskunft (Start, Verbindungen, Abfahrten, Fahrtverlauf …)
js/pages.js             Tickets, D-Ticket und Mehr (Profil, Reise-Optionen, Favoriten, Pläne, Abos)
js/dtcode.js            Ticket-Code lesen (Aztec/QR) und im Muvit-Design zeichnen, mit Prüfung
js/assistant.js         Muvit KI (Claude-Tool-Use + Basis-Modus)
js/watch.js             Verbindung überwachen, Mitteilungen bei verpasstem Anschluss
sw.js                   Service Worker für Mitteilungen (auch Web Push)
push/                   Push-Dienst (Cloudflare Worker) für Mitteilungen bei geschlossener App
js/app.js               Start & Verdrahtung
js/vendor/              Anthropic-SDK als Browser-Bundle (MIT, Safari-kompatibel gebaut)
assets/                 App-Icon (SVG) und PNG-Icons für iOS/Android
```

## Hinweise

- Transitous ist ein freiwillig betriebener Dienst: Bitte fair nutzen. Muvit cacht Anfragen, begrenzt parallele Abrufe und lädt Live-Fahrzeuge nur ab Stadt-Zoom.
- Linienfarben stammen aus den Feeds, sofern vorhanden. Sonst vergibt Muvit stabile Farben je Linie.
