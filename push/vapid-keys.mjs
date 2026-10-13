// Erzeugt ein VAPID-Schlüsselpaar für Muvit Push:  node vapid-keys.mjs
import { generateVapid } from './webpush.mjs';
const k = await generateVapid();
console.log('Öffentlicher Schlüssel (VAPID_PUBLIC, auch in js/core.js → CONFIG.push.vapidPublic):\n' + k.publicKey);
console.log('\nPrivater Schlüssel (geheim halten! → npx wrangler secret put VAPID_PRIVATE):\n' + k.privateKey);
