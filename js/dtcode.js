/* Muvit – Ticket-Code: Barcode (Aztec/QR) aus einem Screenshot lesen und im Muvit-Design neu zeichnen.
   Die Ticketdaten bleiben Byte für Byte gleich; jedes gezeichnete Bild wird vor dem Anzeigen erneut gelesen
   und mit dem Original verglichen. Passt etwas nicht, zeigt Muvit den Code schwarz-weiß bzw. das Originalbild.
   Bibliothek: ZXing for JS (Apache-2.0), wird erst bei Bedarf geladen. */
(function (M) {
  'use strict';

  const SRC = 'https://unpkg.com/@zxing/library@0.21.3/umd/index.min.js';
  let loading = null;
  const LATIN1 = /8859-1|latin-?1/i;

  function setup(Z) {
    // ISO-8859-1 exakt (Bytes 0–255 ↔ Zeichen 0–255), damit binäre Ticketdaten unverändert bleiben
    const SE = Z.ZXingStringEncoding;
    if (SE) {
      SE.customDecoder = (bytes, enc) => (LATIN1.test(enc) ? Array.from(bytes, (b) => String.fromCharCode(b)).join('') : new TextDecoder(enc).decode(bytes));
      SE.customEncoder = (s, enc) => (LATIN1.test(enc) ? Uint8Array.from(Array.from(s), (c) => c.charCodeAt(0) & 255) : new TextEncoder().encode(s));
    }
    return Z;
  }
  function load() {
    if (window.ZXing) return Promise.resolve(setup(window.ZXing));
    if (!loading) {
      loading = new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = SRC; s.async = true; s.crossOrigin = 'anonymous';
        s.onload = () => (window.ZXing ? res(setup(window.ZXing)) : rej(new Error('Codeleser nicht geladen')));
        s.onerror = () => { loading = null; rej(new Error('Codeleser nicht erreichbar – bitte Internetverbindung prüfen')); };
        document.head.appendChild(s);
      });
    }
    return loading;
  }

  function loadImage(src) {
    return new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = () => rej(new Error('Kein gültiges Bild'));
      img.src = src;
    });
  }
  function fileToDataURL(file) {
    return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(new Error('Bild konnte nicht gelesen werden')); r.readAsDataURL(file); });
  }
  function scaled(img, maxSide) {
    const k = Math.min(1, maxSide / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round((img.naturalWidth || img.width) * k)); c.height = Math.max(1, Math.round((img.naturalHeight || img.height) * k));
    const x = c.getContext('2d');
    x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
    x.drawImage(img, 0, 0, c.width, c.height);
    return c;
  }

  /** Code in einem Bild suchen: { format: 'AZTEC' | 'QR_CODE', text } (text = Bytes als Zeichen 0–255) */
  function decodeCanvas(Z, canvas) {
    const hints = new Map();
    hints.set(Z.DecodeHintType.POSSIBLE_FORMATS, [Z.BarcodeFormat.AZTEC, Z.BarcodeFormat.QR_CODE]);
    hints.set(Z.DecodeHintType.TRY_HARDER, true);
    hints.set(Z.DecodeHintType.CHARACTER_SET, 'ISO-8859-1');
    const reader = new Z.MultiFormatReader();
    reader.setHints(hints);
    const src = new Z.HTMLCanvasElementLuminanceSource(canvas);
    for (const B of [Z.HybridBinarizer, Z.GlobalHistogramBinarizer]) {
      try {
        const r = reader.decode(new Z.BinaryBitmap(new B(src)), hints);
        const format = Z.BarcodeFormat[r.getBarcodeFormat()];
        if (format === 'AZTEC' || format === 'QR_CODE') return { format, text: r.getText() };
      } catch (e) { /* nächster Versuch */ }
    }
    return null;
  }
  async function decodeImage(src) {
    const Z = await load();
    const img = await loadImage(src);
    for (const side of [1400, 900, 2200, 600]) {
      const r = decodeCanvas(Z, scaled(img, side));
      if (r) return r;
    }
    return null;
  }

  /** Modul-Matrix des Codes erzeugen (gleiche Daten, gleiche Codeart) */
  function matrixOf(Z, code) {
    if (code.format === 'AZTEC') {
      const bytes = Uint8Array.from(Array.from(code.text), (c) => c.charCodeAt(0) & 255);
      const m = Z.AztecEncoder.encode(bytes, 33, 0).getMatrix();
      return { n: m.getWidth(), get: (x, y) => m.get(x, y), format: 'AZTEC' };
    }
    const hints = new Map();
    hints.set(Z.EncodeHintType.CHARACTER_SET, 'ISO-8859-1');
    const m = Z.QRCodeEncoder.encode(code.text, Z.QRCodeDecoderErrorCorrectionLevel.H, hints).getMatrix();
    return { n: m.getWidth(), get: (x, y) => m.get(x, y) === 1, format: 'QR_CODE' };
  }

  function rr(x, X, Y, W, H, R) {
    R = Math.min(R, W / 2, H / 2);
    x.beginPath(); x.moveTo(X + R, Y); x.arcTo(X + W, Y, X + W, Y + H, R); x.arcTo(X + W, Y + H, X, Y + H, R);
    x.arcTo(X, Y + H, X, Y, R); x.arcTo(X, Y, X + W, Y, R); x.closePath();
  }
  /** Muvit-Design: dunkelgrüner Verlauf, verbundene Module mit runden Außenecken (Aztec) bzw. runde Punkte (QR);
      plain = schwarz auf weiß. Module liegen auf ganzen Bildschirmpixeln (keine feinen Linien zwischen den Modulen). */
  function paint(canvas, mx, size, style, logo) {
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const quiet = mx.format === 'AZTEC' ? 2 : 3, N = mx.n + quiet * 2;
    const px = Math.max(N, Math.round(size * dpr)), cell = Math.max(1, Math.floor(px / N)), total = cell * N;
    canvas.width = total; canvas.height = total;
    canvas.style.width = Math.round(total / dpr) + 'px'; canvas.style.height = Math.round(total / dpr) + 'px';
    const x = canvas.getContext('2d');
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.clearRect(0, 0, total, total);
    const o = quiet * cell, on = (xx, yy) => xx >= 0 && yy >= 0 && xx < mx.n && yy < mx.n && mx.get(xx, yy);
    x.fillStyle = '#FFFFFF';
    rr(x, 0, 0, total, total, style === 'plain' ? 0 : cell * 1.6); x.fill();
    if (style === 'plain') {
      x.fillStyle = '#000000';
      for (let yy = 0; yy < mx.n; yy++) for (let xx = 0; xx < mx.n; xx++) if (on(xx, yy)) x.fillRect(o + xx * cell, o + yy * cell, cell, cell);
      return;
    }
    const g = x.createLinearGradient(0, 0, total, total);
    g.addColorStop(0, '#0B5A2B'); g.addColorStop(0.55, '#0F6E33'); g.addColorStop(1, '#2F6E10');
    x.fillStyle = g;
    const isEye = (xx, yy) => mx.format === 'QR_CODE' && ((xx < 7 && yy < 7) || (xx >= mx.n - 7 && yy < 7) || (xx < 7 && yy >= mx.n - 7));
    const c0 = (mx.n - 1) / 2, logoR = logo && mx.format === 'QR_CODE' ? Math.floor(mx.n * 0.11) : 0;
    const R = cell * 0.5;
    x.beginPath();
    for (let yy = 0; yy < mx.n; yy++) {
      for (let xx = 0; xx < mx.n; xx++) {
        if (!on(xx, yy) || isEye(xx, yy)) continue;
        if (logoR && Math.abs(xx - c0) <= logoR && Math.abs(yy - c0) <= logoR) continue;
        const X = o + xx * cell, Y = o + yy * cell;
        if (mx.format === 'QR_CODE') { x.moveTo(X + cell / 2 + cell * 0.47, Y + cell / 2); x.arc(X + cell / 2, Y + cell / 2, cell * 0.47, 0, Math.PI * 2); continue; }
        // verbundene Module: Ecke nur abrunden, wenn beide Nachbarn an dieser Ecke hell sind (Ringe bleiben geschlossen)
        const up = on(xx, yy - 1), dn = on(xx, yy + 1), lf = on(xx - 1, yy), rt = on(xx + 1, yy);
        const tl = !up && !lf ? R : 0, tr = !up && !rt ? R : 0, br = !dn && !rt ? R : 0, bl = !dn && !lf ? R : 0;
        x.moveTo(X + tl, Y);
        x.lineTo(X + cell - tr, Y); if (tr) x.arcTo(X + cell, Y, X + cell, Y + tr, tr); else x.lineTo(X + cell, Y);
        x.lineTo(X + cell, Y + cell - br); if (br) x.arcTo(X + cell, Y + cell, X + cell - br, Y + cell, br); else x.lineTo(X + cell, Y + cell);
        x.lineTo(X + bl, Y + cell); if (bl) x.arcTo(X, Y + cell, X, Y + cell - bl, bl); else x.lineTo(X, Y + cell);
        x.lineTo(X, Y + tl); if (tl) x.arcTo(X, Y, X + tl, Y, tl); else x.lineTo(X, Y);
        x.closePath();
      }
    }
    x.fill();
    if (mx.format === 'QR_CODE') {
      // Suchmuster als abgerundete Quadrate
      [[0, 0], [mx.n - 7, 0], [0, mx.n - 7]].forEach(([ex, ey]) => {
        const X = o + ex * cell, Y = o + ey * cell;
        x.fillStyle = g; rr(x, X, Y, 7 * cell, 7 * cell, cell * 2.1); x.fill();
        x.fillStyle = '#FFFFFF'; rr(x, X + cell, Y + cell, 5 * cell, 5 * cell, cell * 1.5); x.fill();
        x.fillStyle = g; rr(x, X + 2 * cell, Y + 2 * cell, 3 * cell, 3 * cell, cell * 0.9); x.fill();
      });
      if (logoR) {
        const L = (logoR * 2 + 1 - 0.8) * cell, cx = o + (c0 + 0.5) * cell, cy = o + (c0 + 0.5) * cell;
        x.fillStyle = '#C1CD42'; rr(x, cx - L / 2, cy - L / 2, L, L, L * 0.24); x.fill();
        x.fillStyle = '#131418'; x.font = '700 ' + Math.round(L * 0.62) + 'px Rubik, system-ui, sans-serif';
        x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('D', cx, cy + L * 0.04);
      }
    }
  }
  /** Gezeichneten Code erneut lesen: sind die Daten exakt gleich? */
  function verify(Z, canvas, code) {
    const k = 900 / Math.max(canvas.width, 1);
    const c = document.createElement('canvas');
    c.width = Math.round(canvas.width * Math.min(1, k)); c.height = Math.round(canvas.height * Math.min(1, k));
    const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(canvas, 0, 0, c.width, c.height);
    const r = decodeCanvas(Z, c);
    return !!(r && r.format === code.format && r.text === code.text);
  }

  /** Code zeichnen. Liefert die gewählte Darstellung: 'design', 'plain' oder null (nicht möglich) */
  async function render(canvas, code, size, prefer) {
    const Z = await load();
    let mx;
    try { mx = matrixOf(Z, code); } catch (e) { return null; }
    const tries = prefer === 'plain' ? [['plain', false]] : [['design', true], ['design', false], ['plain', false]];
    for (const [style, logo] of tries) {
      paint(canvas, mx, size, style, logo);
      if (verify(Z, canvas, code)) return style;
    }
    return null;
  }

  M.DTCode = { load, decodeImage, render, fileToDataURL, loadImage };
})(window.Muvit = window.Muvit || {});
