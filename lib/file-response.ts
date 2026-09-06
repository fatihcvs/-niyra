/** RFC 6266/8187: an ASCII fallback plus a UTF-8 filename for international names. */
export function fileContentDisposition(kind: "inline" | "attachment", originalName: string, fallback = "kampira-dosyasi") {
  const wellFormed = Array.from(originalName, (character) => {
    const point = character.codePointAt(0)!;
    if (point < 32 || point >= 127 && point <= 159 || point >= 0x202a && point <= 0x202e
      || point >= 0x2066 && point <= 0x2069 || '"\\/'.includes(character)) return "_";
    return point >= 0xd800 && point <= 0xdfff ? "\ufffd" : character;
  }).join("");
  const safe = wellFormed.trim();
  const filename = Array.from(safe || fallback).slice(0, 140).join("");
  const ascii = filename.replace(/[^A-Za-z0-9 ._-]/g, "_");
  const encoded = encodeURIComponent(filename).replace(/['()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
