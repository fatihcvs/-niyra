/** Cryptographic UUID v4, including LAN HTTP browsers where randomUUID is unavailable. */
export function createSecureRandomKey() {
  const provider = typeof window !== "undefined" ? window.crypto : globalThis.crypto;
  const bytes = new Uint8Array(16);
  provider.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
