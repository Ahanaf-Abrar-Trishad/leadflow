import crypto from "node:crypto";
import { encrypt, decrypt, loadEncryptionKey } from "@/lib/outreach/crypto";

describe("outreach crypto", () => {
  const key = crypto.randomBytes(32);

  it("round-trips plaintext through encrypt/decrypt", () => {
    const payload = encrypt("super secret value", key);
    expect(decrypt(payload, key)).toBe("super secret value");
  });

  it("produces a different ciphertext each time due to a random IV", () => {
    const a = encrypt("same input", key);
    const b = encrypt("same input", key);
    expect(a).not.toBe(b);
  });

  it("throws when decrypting with the wrong key", () => {
    const payload = encrypt("secret", key);
    const wrongKey = crypto.randomBytes(32);
    expect(() => decrypt(payload, wrongKey)).toThrow();
  });

  it("throws when the payload has been tampered with", () => {
    const payload = encrypt("secret", key);
    const tampered = payload.slice(0, -2) + "xx";
    expect(() => decrypt(tampered, key)).toThrow();
  });

  describe("loadEncryptionKey", () => {
    const ORIGINAL = process.env.APP_ENCRYPTION_KEY;
    afterEach(() => {
      process.env.APP_ENCRYPTION_KEY = ORIGINAL;
    });

    it("throws when the env var is missing", () => {
      delete process.env.APP_ENCRYPTION_KEY;
      expect(() => loadEncryptionKey()).toThrow(/not set/);
    });

    it("throws when the decoded key is not 32 bytes", () => {
      process.env.APP_ENCRYPTION_KEY = Buffer.from("too short").toString("base64");
      expect(() => loadEncryptionKey()).toThrow(/32 bytes/);
    });

    it("returns a 32-byte buffer for a valid key", () => {
      process.env.APP_ENCRYPTION_KEY = crypto.randomBytes(32).toString("base64");
      expect(loadEncryptionKey().length).toBe(32);
    });
  });
});
