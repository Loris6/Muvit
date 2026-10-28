// Erzeugt ein VAPID-Schlüsselpaar für Muvit Push:  node scripts/vapid-keys.mjs  [--json]
// Die GitHub-Action ruft es mit --json auf und hinterlegt beide Schlüssel als Secrets beim Worker.
import { generateVapid } from '../src/webpush.mjs';
const k = await generateVapid();
if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ VAPID_PUBLIC: k.publicKey, VAPID_PRIVATE: k.privateKey }));
} else {
  console.log('Öffentlicher Schlüssel (VAPID_PUBLIC):\n' + k.publicKey);
  console.log('\nPrivater Schlüssel (geheim halten! → npx wrangler secret put VAPID_PRIVATE):\n' + k.privateKey);
}
