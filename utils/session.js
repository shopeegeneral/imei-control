// utils/session.js
const crypto = require('crypto');
const ms = (n) => n; // tiện convert nếu thích

function genToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url'); // opaque token
}
function sha256Base64(input) {
  return crypto.createHash('sha256').update(input).digest('base64');
}
module.exports = { genToken, sha256Base64 };
