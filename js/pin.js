// PIN storage. Only a salted SHA-256 hash is kept, never the PIN itself.
// Honest limit: a 4-digit PIN has only 10,000 possibilities, so this keeps casual snoopers out
// but would not stop someone with the tools and time to read the phone's storage.
import { getSetting, putMany, removeMany } from './db.js';

export const PIN_LENGTH = 4;

const toHex = (bytes) => [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');

async function digest(pin, salt) {
  if (!(window.crypto && window.crypto.subtle)) throw new Error('Secure crypto is unavailable');
  return toHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}:${pin}`)));
}

export async function hasPin() {
  return Boolean(await getSetting('pinHash'));
}

export async function setPin(pin) {
  if (!new RegExp(`^\\d{${PIN_LENGTH}}$`).test(pin)) throw new Error('PIN must be 4 digits');
  const salt = toHex(crypto.getRandomValues(new Uint8Array(16)));
  // Salt and hash are saved together so a crash can never leave a mismatched pair.
  await putMany('settings', [{ key: 'pinSalt', value: salt }, { key: 'pinHash', value: await digest(pin, salt) }]);
}

export const removePin = () => removeMany('settings', ['pinHash', 'pinSalt']);

export async function verifyPin(pin) {
  const [salt, hash] = await Promise.all([getSetting('pinSalt'), getSetting('pinHash')]);
  if (!salt || !hash) return false;
  return (await digest(pin, salt)) === hash;
}
