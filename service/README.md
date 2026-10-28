# Muvit-Dienst

Muvit ist eine reine Web-App auf GitHub Pages. Die Server der Deutschen Bahn und von INSA (dorthin liefert die MVB ihre Echtzeit) lassen keine Abfragen direkt aus dem Browser zu. Push-Mitteilungen bei geschlossener App brauchen außerdem jemanden, der im Hintergrund prüft. Beides übernimmt dieser kleine **Cloudflare Worker**. Der kostenlose Tarif reicht.

Was der Dienst liefert:

| Bereich | Quelle | Wofür in Muvit |
|---|---|---|
| Züge | bahn.de (über `db-vendo-client`) | Abfahrten mit Gleis, Verspätung und Meldungen wie „Verspätung aus vorheriger Fahrt“, Fahrtverlauf |
| Wagenreihung | bahn.de („vehicle-sequence“) | Reiter „Wagenreihung“ im Zug-Fahrtverlauf: Sektoren, Wagennummern, Klasse, Ausstattung |
| Straßenbahn und Bus | INSA (über `hafas-client`) | MVB-Echtzeit, Ausfälle, Hinweise je Abfahrt, Linienwechsel („wird als Linie … fortgesetzt“) |
| Störungen | INSA (HIM-Meldungen) | Störungsmelder (nur Magdeburg und Umgebung) |
| Push | Web Push (VAPID) | Mitteilungen bei verpasstem Anschluss, Ausfall oder Verspätung, auch bei geschlossener App |

Ohne Dienst läuft Muvit weiter, mit den Daten von Transitous.

## Einrichtung (einmalig, ca. 5 Minuten)

Den Rest erledigt die GitHub-Action **„Muvit-Dienst bereitstellen“** (`.github/workflows/dienst.yml`). Sie legt den Speicher an, erzeugt die Push-Schlüssel, veröffentlicht den Worker und trägt seine Adresse in `config.json` ein.

1. Ein kostenloses Konto bei [Cloudflare](https://dash.cloudflare.com/sign-up) anlegen.
2. Im Dashboard **Workers & Pages** einmal öffnen. Dabei wird eine `workers.dev`-Subdomain festgelegt.
3. Unter **Mein Profil → API-Token → Token erstellen** die Vorlage **„Cloudflare Workers bearbeiten“** wählen und den Token kopieren.
4. Die **Konto-ID** steht im Dashboard rechts unter „Account ID“.
5. Im GitHub-Repository unter **Settings → Secrets and variables → Actions** zwei Secrets anlegen:
   - `CLOUDFLARE_API_TOKEN`: der Token aus Schritt 3
   - `CLOUDFLARE_ACCOUNT_ID`: die Konto-ID aus Schritt 4
6. Unter **Actions → „Muvit-Dienst bereitstellen“ → Run workflow** starten.

Danach steht in `config.json` die Adresse des Dienstes, z. B. `https://muvit-dienst.<name>.workers.dev`. GitHub Pages aktualisiert sich von selbst. Jede Änderung in `service/` wird automatisch neu veröffentlicht.

Die Adresse kann in Muvit auch von Hand gesetzt werden: **Mehr → Einstellungen → Muvit-Dienst**.

### Von Hand (ohne Action)

```bash
cd service
npm ci
npx wrangler login
npx wrangler kv namespace create muvit-dienst-WATCHES   # id in wrangler.toml bei „KV_ID“ eintragen
node scripts/vapid-keys.mjs --json > secrets.json
npx wrangler deploy --secrets-file secrets.json && rm secrets.json
```

Der **private** Push-Schlüssel gehört nie ins Repository. Er liegt nur als Secret beim Worker.

## Schnittstellen

| Pfad | Beschreibung |
|---|---|
| `GET /health` | Zustand, z. B. `{"ok":true,"push":true,"db":true,"nv":true}` |
| `GET /db/station?name&lat&lon` | DB-Bahnhof (EVA-Nummer) zu einer Haltestelle |
| `GET /db/departures?eva&when` | Zug-Abfahrten mit Gleis, Verspätung, Ausfall und Meldungen |
| `GET /db/trip?id` | Zug-Fahrtverlauf |
| `GET /db/wagenreihung?category&number&eva&date&time` | Wagenreihung (`date` = JJJJ-MM-TT, `time` = ISO-Zeit der Abfahrt) |
| `GET /nv/stop?name&lat&lon` | INSA-Haltestelle |
| `GET /nv/departures?stop&when` | Tram- und Bus-Abfahrten in Echtzeit mit Hinweisen |
| `GET /nv/trip?id` | Fahrtverlauf mit Hinweisen |
| `GET /nv/remarks` | aktuelle Störungen in Magdeburg |
| `GET /vapid` | öffentlicher Push-Schlüssel |
| `POST /watch` · `DELETE /watch/:id` | Verbindung überwachen bzw. nicht mehr überwachen |

Antworten werden kurz zwischengespeichert: Abfahrten 20 s, Wagenreihung 2 min, Störungen 2 min.

## Entwickeln

```bash
cd service
npm ci
npm test          # Tests mit nachgebildeten DB-/INSA-Antworten
npx wrangler dev  # lokal unter http://localhost:8787
```

## Auf dem iPhone

- Web-Push gibt es ab **iOS 16.4**, und nur, wenn Muvit über **Teilen → „Zum Home-Bildschirm“** installiert ist.
- In Muvit eine Verbindung öffnen und **„Überwachen“** antippen. Beim ersten Mal fragt iOS nach der Erlaubnis für Mitteilungen.
- Zur Bestätigung kommt sofort eine Mitteilung: „Verbindung wird überwacht“.

## Datenschutz

Der Dienst speichert nur die Push-Adresse des Geräts und die überwachte Verbindung (Haltestellen, Zeiten, Linien). 30 Minuten nach der Ankunft wird beides gelöscht. Abfragen an DB und INSA enthalten keine Daten über Nutzer. Es gibt keine Konten und kein Tracking.
