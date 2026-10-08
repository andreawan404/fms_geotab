// Membuat addInId baru (format Geotab: "a" + GUID base64url 22 karakter).
import crypto from 'node:crypto';
console.log('a' + crypto.randomBytes(16).toString('base64url'));
