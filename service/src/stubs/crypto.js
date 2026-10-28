// hafas-client erzeugt beim Laden eine Kennung mit randomBytes – Zufall ist in Workers außerhalb von Anfragen verboten
export const randomBytes = (n) => {
  const b = new Uint8Array(n);
  for (let i = 0; i < n; i++) b[i] = (i * 73 + 41) & 255;
  b.toString = () => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return b;
};
export default { randomBytes };
