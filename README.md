# Muvit

**Muvit** ist eine moderne Mobilitäts-Web-App für **Magdeburg** und ganz Deutschland, gebaut mit reinem **HTML, CSS und JavaScript** (ohne Build-Schritt). Schriftart: **Rubik**.

Die Karte liegt immer im Hintergrund. Alle Inhalte stecken in einem dunklen Sheet über die volle Breite (`100vw`). Das Sheet lässt sich frei hoch- und runterziehen, so bestimmst du selbst, wie viel Karte du siehst. Das funktioniert per Griff, Wischen im Inhalt oder Mausrad.

## Funktionen

| Bereich | Was Muvit kann |
|---|---|
| **Startframe** | „Wo geht's hin?“ mit Start/Ziel und Tauschen, sechs Schnellzugriffe (Abfahrten, Verkehrsmelder, Abonnements, Netzplan, Ticket kaufen, Assistance) und Verlauf |
| **Karte** | MapLibre GL mit OpenFreeMap (Hell/Dunkel); Haltestellen als „H“-Schild (Zeichen 224). Ein Tipp auf eine Haltestelle öffnet direkt ihre Abfahrten. Standort mit Genauigkeitskreis; langes Drücken auf die Karte öffnet „Von hier / Nach hier / Haltestellen“ |
| **Live-Karte** | Alle Straßenbahnen, Busse und Züge der ganzen Stadt in Echtzeit, flüssig entlang der Strecke animiert. Trams und Busse zeigen auf der Karte nur ihre Liniennummer, Züge zusätzlich das S-Bahn- bzw. DB-Logo. Weit herausgezoomt zeigt die Karte die Züge in ganz Deutschland |
| **Verbindungen** | Echtzeit-Routing mit Verspätungen und Gleisen. Die Karten zeigen eine proportionale Linien-Leiste und Badges wie „Schnellste“ oder „Wenigste Umstiege“. „Früher/Später“, Filter für das Deutschlandticket, bis zu 2 Zwischenhalte mit Mindestaufenthalt |
| **Verbindung** | Zeitstrahl in Linienfarben mit Gleis, Verspätung, aufklappbaren Zwischenhalten, Fußwegen, Hinweisen/Störungen, Tarif-Einschätzung, DB-Live-Preis, Teilen und Merken |
| **Abfahrten / Haltestelle** | Suche nach Haltestelle oder Linie, Tabs Verlauf/Favoriten/In der Nähe. Die Haltestellenansicht zeigt eine Echtzeit-Abfahrtstafel mit Countdown, Status (pünktlich, früher, verspätet, fällt aus), Bahnsteig (Bstg.) bei Tram und Bus bzw. Gleis bei Zügen (Gleiswechsel rot hinterlegt) und Filter nach Verkehrsmittel. Unter jeder Linie stehen bei Bedarf Hinweise wie „Baustellenbedingte Umleitung“, „Fährt weiter als [Tram][13] nach Sudenburg“ oder „Kommt als [Tram][2] aus …“ |
| **In der Nähe** | Haltestellen im Umkreis mit selbst berechneter Entfernung (Haversine ab Geräteposition), Gehzeit und Himmelsrichtung, dazu eine Vorschau der nächsten Abfahrten |
| **Fahrtverlauf & Netzplan** | Ein Tipp auf eine Linie öffnet den Fahrtverlauf mit allen Halten, Echtzeit und Live-Position auf der Karte. Die Linie ist durchgehend in Linienfarbe, weiß umrandet, mit Haltestellenpunkten (weiß, bei hellen Linien wie Tram 3 schwarz). Fährt das Fahrzeug als andere Linie weiter, folgt nach einer Lücke deren Verlauf in ihrer Farbe. Der Netzplan zeigt die ganze Stadt und listet alle Linien einschließlich der Nachtlinien |
| **Tickets & Preise** | marego/MVB-Tarife und Deutschlandticket (Stand 08/2026), Preisermittlung für eine Strecke, DB-Preise live |
| **Assistance (Muvit KI)** | Claude (Anthropic) mit Tool-Use auf echte Daten: Routen von A nach B (auch über C mit XX Min Aufenthalt), Abfahrten, Linien, Tarife, DB-Preise und Haltestellen in der Nähe. Mit Streaming und Spracheingabe. Ohne API-Schlüssel beantwortet ein Basis-Modus typische Fragen |

Muvit ist eine App für Magdeburg: Haltestellen und Orte erscheinen ohne den Zusatz „Magdeburg“, also „Sudenburg“ statt „Magdeburg, Sudenburg“. Orte außerhalb behalten ihren Ortsnamen, Züge in ganz Deutschland werden weiterhin angezeigt.

### Durchläufer („fährt weiter als …“)

Die Fahrplandaten enthalten nicht direkt, ob ein Fahrzeug als andere Linie weiterfährt. Muvit erkennt das so: Endet eine Fahrt, sucht Muvit an der Endhaltestelle eine andere Linie desselben Verkehrsmittels, die dort beginnt und kurz danach (bis 12 Minuten) am selben Bahnsteig abfährt. Für „kommt als …“ gilt das umgekehrt. Hinweise aus den Störungsmeldungen werden zusätzlich ausgewertet.

## Datenquellen (echte APIs)

- **[Transitous](https://transitous.org)** (MOTIS 2, `api.transitous.org`): Fahrplan und Echtzeit für ganz Europa, darunter die MVB-Straßenbahnen und -Busse in Magdeburg (DELFI) sowie Regional- und Fernverkehr. Muvit nutzt `geocode`, `plan`, `stoptimes`, `trip`, `map/stops` und `map/trips` (Live-Fahrzeuge).
- **[db.transport.rest](https://v6.db.transport.rest)** (Deutsche Bahn): automatischer Fallback und Quelle für DB-Ticketpreise. In den Einstellungen lässt sich die DB auch als primäre Quelle wählen.
- **Karte:** © [OpenStreetMap](https://www.openstreetmap.org/copyright)-Mitwirkende, Vektor-Kacheln von [OpenFreeMap](https://openfreemap.org), CARTO-Raster als Fallback.
- **Icons:** [Uicons by Flaticon](https://www.flaticon.com/uicons) (Regular, Bold und Solid Rounded aus `@flaticon/flaticon-uicons` 3.3.1). Die Glyphen sind als SVG-Pfade in `js/icons.js` eingebettet. Die Flaticon-Lizenz verlangt eine Namensnennung, sie steht in den Einstellungen unter „Über Muvit“.
- **Tarife:** Werte in `js/tariffs.js` (marego-Tarifreform 01.08.2026, Deutschlandticket 63 €/Monat seit 01.01.2026). Alle Angaben ohne Gewähr. Fehlende Preise werden nicht geschätzt, Muvit verlinkt dann auf die offizielle Tarifauskunft.

Die Karte braucht keinen API-Schlüssel.

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
js/views.js             Alle Ansichten
js/assistant.js         Muvit KI (Claude-Tool-Use + Basis-Modus)
js/app.js               Start & Verdrahtung
js/vendor/              Anthropic-SDK als Browser-Bundle (MIT, Safari-kompatibel gebaut)
assets/                 App-Icon (SVG) und PNG-Icons für iOS/Android
```

## Hinweise

- Transitous ist ein freiwillig betriebener Dienst: Bitte fair nutzen. Muvit cacht Anfragen, begrenzt parallele Abrufe und lädt Live-Fahrzeuge nur ab Stadt-Zoom.
- Linienfarben stammen aus den Feeds, sofern vorhanden. Sonst vergibt Muvit stabile Farben je Linie.
