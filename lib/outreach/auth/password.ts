import crypto from "node:crypto";

const KEY_LENGTH = 64;

function scrypt(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, KEY_LENGTH, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey);
    });
  });
}

/** Returns `salt.hash`, both base64. */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const derivedKey = await scrypt(password, salt);
  return `${salt.toString("base64")}.${derivedKey.toString("base64")}`;
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const [saltB64, keyB64] = hash.split(".");
  if (!saltB64 || !keyB64) return false;

  const salt = Buffer.from(saltB64, "base64");
  const expectedKey = Buffer.from(keyB64, "base64");
  const derivedKey = await scrypt(password, salt);

  if (derivedKey.length !== expectedKey.length) return false;
  return crypto.timingSafeEqual(derivedKey, expectedKey);
}
