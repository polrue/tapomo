#!/usr/bin/env node
// Makes a Tapomo supporter code ("código de mecenas"), e.g. after a Ko-fi or GitHub Sponsors payment.
//   node packaging/supporter/make-code.mjs 42            → code for supporter #42
//   TAPOMO_SUPPORTER_KEY=/path/key.pem node make-code.mjs 42
// The code is: "TAPOMO-" + base64url( version(1) | serial(u32 BE) | yymm(u16 BE) | ed25519 signature(64) ).
// The app checks it offline against the public key in src-tauri/src/supporter.rs. It unlocks only
// cosmetic thanks (a skin and a badge): nothing in Tapomo is ever locked behind it.
import { createPrivateKey, sign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';

const serial = Number(process.argv[2]);
if (!Number.isInteger(serial) || serial < 1 || serial > 0xffffffff) {
  console.error('usage: make-code.mjs <serial number ≥ 1>');
  process.exit(1);
}
const keyPath = process.env.TAPOMO_SUPPORTER_KEY || `${homedir()}/data/secrets/tapomo-supporter-ed25519.pem`;
const key = createPrivateKey(readFileSync(keyPath));
const now = new Date();
const payload = Buffer.alloc(7);
payload.writeUInt8(1, 0);
payload.writeUInt32BE(serial, 1);
payload.writeUInt16BE((now.getUTCFullYear() % 100) * 100 + now.getUTCMonth() + 1, 5);
const sig = sign(null, payload, key);
console.log(`TAPOMO-${Buffer.concat([payload, sig]).toString('base64url')}`);
