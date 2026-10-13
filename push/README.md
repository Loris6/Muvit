# Muvit Push – Mitteilungen bei geschlossener App

Muvit läuft als reine Web-App auf GitHub Pages. Damit Mitteilungen auch bei **geschlossener App** ankommen (z. B. „Anschluss wird nicht erreicht“), braucht es einen kleinen Dienst, der die überwachten Verbindungen prüft und Web-Push-Nachrichten verschickt. Dieser Ordner enthält ihn als **Cloudflare Worker**. Der kostenlose Tarif reicht.

Was der Dienst tut:
- Er prüft jede Minute die Echtzeit (Transitous) jeder überwachten Verbindung.
- Bei einem verpassten Anschluss schickt er eine Mitteilung mit der schnellsten Alternative.
- Ebenso bei einer ausgefallenen Fahrt oder wenn die erste Fahrt 5 Minuten oder mehr später abfährt.
- Eine Verbindung wird 30 Minuten nach der Ankunft automatisch gelöscht.

## Einrichtung (einmalig, ca. 10 Minuten)

1. Ein kostenloses Konto bei [Cloudflare](https://dash.cloudflare.com/sign-up) anlegen.
2. Im Ordner `push` (Node.js ≥ 20 nötig):
   ```bash
   npx wrangler login
   npx wrangler kv namespace create WATCHES      # ausgegebene id in wrangler.toml eintragen
   node vapid-keys.mjs                           # erzeugt öffentlichen + privaten Schlüssel
   ```
3. In `wrangler.toml` den **öffentlichen** Schlüssel bei `VAPID_PUBLIC` und deine E-Mail bei `VAPID_SUBJECT` eintragen.
4. Den **privaten** Schlüssel als Secret hinterlegen. Er gehört nie ins Repository:
   ```bash
   npx wrangler secret put VAPID_PRIVATE
   ```
5. Veröffentlichen:
   ```bash
   npx wrangler deploy
   ```
   Wrangler zeigt danach eine Adresse wie `https://muvit-push.<name>.workers.dev`.
6. In `js/core.js` bei `push` eintragen:
   ```js
   push: { server: 'https://muvit-push.<name>.workers.dev', vapidPublic: '<öffentlicher Schlüssel>' },
   ```
   Danach committen. GitHub Pages aktualisiert sich von selbst.

## Auf dem iPhone

- Web-Push gibt es ab **iOS 16.4**, und nur, wenn Muvit über **Teilen → „Zum Home-Bildschirm“** installiert ist.
- In Muvit eine Verbindung öffnen und **„Überwachen“** antippen. Beim ersten Mal fragt iOS nach der Erlaubnis für Mitteilungen.
- Zur Bestätigung kommt sofort eine Mitteilung: „Verbindung wird überwacht“.

## Datenschutz

Der Dienst speichert nur die Push-Adresse des Geräts und die überwachte Verbindung (Haltestellen, Zeiten, Linien). 30 Minuten nach der Ankunft wird beides gelöscht. Es gibt keine Konten und kein Tracking.
