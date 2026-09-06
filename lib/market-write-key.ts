/** getRandomValues also works on the tablet's local HTTP preview, unlike randomUUID. */
export function createMarketWriteKey() {
  const bytes = window.crypto.getRandomValues(new Uint8Array(16));
  return `market:${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}
