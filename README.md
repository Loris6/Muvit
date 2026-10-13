# Muvit

**Muvit** ist eine moderne Mobilitäts-Web-App für **Magdeburg** und ganz Deutschland, gebaut mit reinem **HTML, CSS und JavaScript** (ohne Build-Schritt). Schriftart: **Rubik**.

Alle Ansichten folgen dem Stil des Startframes: Die Karte bleibt immer sichtbar. Darüber liegen Glas-Karten und ein ziehbares Bottom-Sheet (auf dem Desktop ein Seitenpanel).

## Funktionen

| Bereich | Was Muvit kann |
|---|---|
| **Startframe** | Von–Nach-Suche mit Tauschen, Abfahrts- oder Ankunftszeit, Zwischenhalte, zuletzt gesuchte und gemerkte Routen, sechs Schnellzugriffe über der Karte |
| **Karte** | MapLibre GL mit OpenFreeMap (Hell/Dunkel); Haltestellen als „H“-Schild (Zeichen 224); Standort mit Genauigkeitskreis; langes Drücken auf die Karte öffnet „Von hier / Nach hier / Haltestellen“ |
| **Live-Karte** | Straßenbahnen, Busse und Züge in Echtzeit, flüssig entlang der Strecke animiert, mit Fahrtrichtung, Filter nach Verkehrsmittel und Pünktlichkeits-Statistik |
| **Verbindungen** | Echtzeit-Routing mit Verspätungen und Gleisen. Die Karten zeigen eine proportionale Linien-Leiste und Badges wie „Schnellste“ oder „Wenigste Umstiege“. „Früher/Später“, Filter für das Deutschlandticket, bis zu 2 Zwischenhalte mit Mindestaufenthalt |
| **Verbindungsdetail** | Hero-Karte mit Zeitstrahl in Linienfarben, Umstiegszeiten mit Warnung bei knappen Umstiegen, Zwischenhalte, Hinweise/Störungen, Tarif-Einschätzung, DB-Live-Preis, Teilen und Merken |
| **Abfahrten** | Echtzeit-Abfahrtstafel mit Countdown, Verspätung, Gleis/Steig, Filter nach Verkehrsmittel und Favoriten |
| **In der Nähe** | Haltestellen im Umkreis mit selbst berechneter Entfernung (Haversine ab Geräteposition), Gehzeit und Himmelsrichtung, dazu eine Vorschau der nächsten Abfahrten |
| **Linien & Linienverlauf** | Alle Linien der Umgebung. Der Linienverlauf zeigt jede Fahrt mit allen Halten, Echtzeit und der Live-Position im Zeitstrahl und auf der Karte |
| **Tickets & Preise** | marego/MVB-Tarife und Deutschlandticket (Stand 08/2026), Preisermittlung für eine Strecke, DB-Preise live |
| **Muvit KI** | Claude (Anthropic) mit Tool-Use auf echte Daten: Routen von A nach B (auch über C mit XX Min Aufenthalt), Abfahrten, Linien, Tarife, DB-Preise und Haltestellen in der Nähe. Mit Streaming und Spracheingabe. Ohne API-Schlüssel beantwortet ein Basis-Modus typische Fragen |

## Datenquellen (echte APIs)

- **[Transitous](https://transitous.org)** (MOTIS 2, `api.transitous.org`): Fahrplan und Echtzeit für ganz Europa, darunter die MVB-Straßenbahnen und -Busse in Magdeburg (DELFI) sowie Regional- und Fernverkehr. Muvit nutzt `geocode`, `plan`, `stoptimes`, `trip`, `map/stops` und `map/trips` (Live-Fahrzeuge).
- **[db.transport.rest](https://v6.db.transport.rest)** (Deutsche Bahn): automatischer Fallback und Quelle für DB-Ticketpreise. In den Einstellungen lässt sich die DB auch als primäre Quelle wählen.
- **Karte:** © [OpenStreetMap](https://www.openstreetmap.org/copyright)-Mitwirkende, Vektor-Kacheln von [OpenFreeMap](https://openfreemap.org), CARTO-Raster als Fallback.
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
css/muvit.css           Design-System (Glas-Karten, Hell/Dunkel, Mobil/Desktop)
js/core.js              Konfiguration, Zeit (Europe/Berlin), Geometrie, Farben, Standort, Speicher
js/icons.js             Icon-Set & Haltestellenschild
js/api.js               Transitous- & DB-Client, Normalisierung, Fallback
js/tariffs.js           Tarifdaten & Tarif-Einschätzung
js/map.js               MapLibre: H-Schilder, Live-Fahrzeuge, Routen, Linienverläufe
js/ui.js                Sheet-Navigation, Layout, Komponenten (Verbindungskarten, Abfahrten …)
js/views.js             Alle Ansichten
js/assistant.js         Muvit KI (Claude-Tool-Use + Basis-Modus)
js/app.js               Start & Verdrahtung
js/vendor/              Anthropic-SDK als Browser-Bundle (MIT, Safari-kompatibel gebaut)
assets/                 Logo (SVG) und App-Icons (PNG für iOS/Android)
```

## Hinweise

- Transitous ist ein freiwillig betriebener Dienst: Bitte fair nutzen. Muvit cacht Anfragen, begrenzt parallele Abrufe und lädt Live-Fahrzeuge nur ab Stadt-Zoom.
- Linienfarben stammen aus den Feeds, sofern vorhanden. Sonst vergibt Muvit stabile Farben je Linie.
