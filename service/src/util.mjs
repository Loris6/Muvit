/* Muvit-Dienst – Hilfsfunktionen */
export const UA = 'Muvit (https://loris6.github.io/Muvit/)';
export const num = (v) => (v == null || v === '' || isNaN(+v) ? null : +v);
export const normName = (n) => String(n || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/^magdeburg[\s,(-]+/, '').replace(/\(magdeburg\)/, '').replace(/[^a-z0-9äöüß]/g, '');
export const pick = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v != null && v !== ''));
/** Bediengebiet der MVB (wie in der App) */
export const MD = { minLat: 52.02, maxLat: 52.235, minLon: 11.47, maxLon: 11.80 };
export const inMd = (loc) => !!loc && loc.latitude >= MD.minLat && loc.latitude <= MD.maxLat && loc.longitude >= MD.minLon && loc.longitude <= MD.maxLon;
