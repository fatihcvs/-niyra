export type PostMedia = {
  id: string;
  kind: "image" | "video";
  url: string;
  contentType: string;
  fileName: string;
  width?: number;
  height?: number;
};

export const POST_IMAGE_MAX_BYTES = 8 * 1024 * 1024;
export const POST_VIDEO_MAX_BYTES = 20 * 1024 * 1024;
export const POST_PHOTO_MAX_COUNT = 4;
export const POST_MEDIA_TOTAL_MAX_BYTES = 20 * 1024 * 1024;
export const POST_MEDIA_ACCEPT = "image/png,image/jpeg,image/webp,video/mp4,video/webm";

type MediaFormat = {
  kind: PostMedia["kind"];
  extensions: string[];
  storedExtension: string;
  magic: (bytes: Uint8Array) => boolean;
};

const signature = (bytes: Uint8Array, offset: number, value: string) =>
  String.fromCharCode(...bytes.subarray(offset, offset + value.length)) === value;

type ImageDimensions = { width: number; height: number };

function dimensions(width: unknown, height: unknown): ImageDimensions | undefined {
  // Metadata is a layout hint: unusually large/unknown images retain the existing fallback.
  return typeof width === "number" && typeof height === "number"
    && Number.isInteger(width) && Number.isInteger(height) && width > 0 && height > 0
    && width <= 65535 && height <= 65535 ? { width, height } : undefined;
}

/** Read only IFD0 orientation. Never follow embedded thumbnails or arbitrary TIFF pointers. */
function exifOrientation(bytes: Uint8Array): number | undefined {
  if (signature(bytes, 0, "Exif\0\0")) bytes = bytes.subarray(6);
  if (bytes.length < 8) return;
  const little = signature(bytes, 0, "II");
  if (!little && !signature(bytes, 0, "MM")) return;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint16(2, little) !== 42) return;
  const offset = view.getUint32(4, little);
  if (offset < 8 || offset + 2 > bytes.length) return;
  const count = view.getUint16(offset, little);
  if (count > 1024 || offset + 2 + count * 12 + 4 > bytes.length) return;
  let orientation = 1;
  let found = false;
  for (let index = 0; index < count; index++) {
    const entry = offset + 2 + index * 12;
    if (view.getUint16(entry, little) !== 0x0112) continue;
    if (found || view.getUint16(entry + 2, little) !== 3 || view.getUint32(entry + 4, little) !== 1) return;
    orientation = view.getUint16(entry + 8, little);
    if (orientation < 1 || orientation > 8) return;
    found = true;
  }
  return orientation;
}

/** Bounded container/header inspection only; this does not decode or validate image pixels. */
export function readPostImageDimensions(bytes: Uint8Array, contentType: string): ImageDimensions | undefined {
  if (bytes.length > POST_IMAGE_MAX_BYTES) return;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let size: ImageDimensions | undefined;
  let orientation = 1;
  let seenExif = false;
  const readExif = (start: number, end: number) => {
    if (seenExif) return false;
    seenExif = true;
    const value = exifOrientation(bytes.subarray(start, end));
    if (value === undefined) return false;
    orientation = value;
    return true;
  };
  const result = () => size && (orientation >= 5 ? { width: size.height, height: size.width } : size);

  if (contentType === "image/png") {
    if (bytes.length < 33 || bytes[0] !== 0x89 || !signature(bytes, 1, "PNG\r\n\x1a\n")) return;
    let offset = 8;
    let imageData = false;
    for (let chunks = 0; chunks < 4096 && offset + 12 <= bytes.length; chunks++) {
      const length = view.getUint32(offset);
      const end = offset + 12 + length;
      if (end > bytes.length) return;
      if (signature(bytes, offset + 4, "IHDR")) {
        if (offset !== 8 || length !== 13) return;
        size = dimensions(view.getUint32(offset + 8), view.getUint32(offset + 12));
        if (!size) return;
      } else if (!size) return;
      if (signature(bytes, offset + 4, "eXIf") && !readExif(offset + 8, end - 4)) return;
      if (signature(bytes, offset + 4, "IDAT")) imageData = true;
      if (signature(bytes, offset + 4, "IEND")) return length === 0 && imageData ? result() : undefined;
      offset = end;
    }
    return;
  }

  if (contentType === "image/jpeg") {
    if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return;
    let offset = 2;
    for (let segments = 0; segments < 4096 && offset < bytes.length; segments++) {
      if (bytes[offset++] !== 0xff) return;
      while (offset < bytes.length && bytes[offset] === 0xff) offset++;
      if (offset >= bytes.length) return;
      const marker = bytes[offset++];
      if (marker === 0 || marker === 0xd8 || marker === 0xd9 || marker === 0xde) return;
      if (marker === 1 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > bytes.length) return;
      const length = view.getUint16(offset);
      const end = offset + length;
      if (length < 2 || end > bytes.length) return;
      if (marker === 0xe1 && signature(bytes, offset + 2, "Exif\0\0") && !readExif(offset + 2, end)) return;
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        if (size || length < 8 || !bytes[offset + 7] || length !== 8 + 3 * bytes[offset + 7]) return;
        size = dimensions(view.getUint16(offset + 5), view.getUint16(offset + 3));
        if (!size) return;
      }
      // Entropy-coded scan data is never decoded. Zero-height DNL and hierarchical JPEGs fall back.
      if (marker === 0xda) return length >= 6 ? result() : undefined;
      offset = end;
    }
    return;
  }

  if (contentType === "image/webp") {
    if (bytes.length < 20 || !signature(bytes, 0, "RIFF") || !signature(bytes, 8, "WEBP")) return;
    const fileEnd = view.getUint32(4, true) + 8;
    if (fileEnd > bytes.length || fileEnd < 20 || fileEnd % 2) return;
    let offset = 12;
    let imageData = false;
    let extended = false;
    let animated = false;
    let expectsExif = false;
    const uint24 = (start: number) => bytes[start] + bytes[start + 1] * 256 + bytes[start + 2] * 65536;
    for (let chunks = 0; chunks < 4096 && offset + 8 <= fileEnd; chunks++) {
      const length = view.getUint32(offset + 4, true);
      const start = offset + 8;
      const end = start + length;
      const paddedEnd = end + length % 2;
      if (paddedEnd > fileEnd) return;
      if (signature(bytes, offset, "VP8X")) {
        if (offset !== 12 || length !== 10) return;
        extended = true;
        animated = Boolean(bytes[start] & 2);
        expectsExif = Boolean(bytes[start] & 8);
        size = dimensions(uint24(start + 4) + 1, uint24(start + 7) + 1);
        if (!size) return;
      } else if (signature(bytes, offset, "VP8 ") || signature(bytes, offset, "VP8L")) {
        if (imageData || animated) return;
        let frame: ImageDimensions | undefined;
        if (signature(bytes, offset, "VP8 ")) {
          if (length < 10 || (bytes[start] & 1) || !signature(bytes, start + 3, "\x9d\x01\x2a")) return;
          frame = dimensions(view.getUint16(start + 6, true) & 0x3fff, view.getUint16(start + 8, true) & 0x3fff);
        } else {
          if (length < 5 || bytes[start] !== 0x2f) return;
          const packed = view.getUint32(start + 1, true);
          if (packed >>> 29) return;
          frame = dimensions((packed & 0x3fff) + 1, ((packed >>> 14) & 0x3fff) + 1);
        }
        if (!frame || (extended && (size?.width !== frame.width || size.height !== frame.height))) return;
        size = frame;
        imageData = true;
      } else if (signature(bytes, offset, "ANMF")) {
        if (!animated || length < 16) return;
        imageData = true; // Layout uses the VP8X canvas, never an individual animation frame.
      } else if (signature(bytes, offset, "EXIF") && !readExif(start, end)) return;
      offset = paddedEnd;
      if (offset === fileEnd) return imageData && (!expectsExif || seenExif) ? result() : undefined;
    }
  }
}

const formats: Record<string, MediaFormat> = {
  "image/png": {
    kind: "image", extensions: ["png"], storedExtension: "png",
    magic: (bytes) => bytes.length >= 24 && bytes[0] === 0x89 && signature(bytes, 1, "PNG\r\n\x1a\n") && signature(bytes, 12, "IHDR"),
  },
  "image/jpeg": {
    kind: "image", extensions: ["jpg", "jpeg"], storedExtension: "jpg",
    magic: (bytes) => bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
  },
  "image/webp": {
    kind: "image", extensions: ["webp"], storedExtension: "webp",
    magic: (bytes) => bytes.length >= 20 && signature(bytes, 0, "RIFF") && signature(bytes, 8, "WEBP"),
  },
  "video/mp4": {
    kind: "video", extensions: ["mp4", "m4v"], storedExtension: "mp4",
    magic: (bytes) => {
      if (bytes.length < 24 || !signature(bytes, 4, "ftyp")) return false;
      const size = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0);
      if (size < 16 || size > bytes.length || size > 1024) return false;
      // MP4 containers can also hold HEIF/AVIF images; only accept video brands.
      const videoBrands = new Set(["isom", "iso2", "iso3", "iso4", "iso5", "iso6", "mp41", "mp42", "avc1", "M4V ", "dash"]);
      for (let offset = 8; offset + 4 <= size; offset += 4) {
        if (offset !== 12 && videoBrands.has(String.fromCharCode(...bytes.subarray(offset, offset + 4)))) return true;
      }
      return false;
    },
  },
  "video/webm": {
    kind: "video", extensions: ["webm"], storedExtension: "webm",
    magic: (bytes) => bytes.length >= 16 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3
      && new TextDecoder().decode(bytes.subarray(4, Math.min(bytes.length, 4096))).includes("webm"),
  },
};

export class PostMediaValidationError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function validatePostMedia(file: File) {
  const format = formats[file.type];
  const extension = file.name.split(".").at(-1)?.toLowerCase() ?? "";
  if (!format || !format.extensions.includes(extension)) {
    throw new PostMediaValidationError("PNG, JPG, WEBP görseli veya MP4, WEBM videosu seçmelisin.", 415);
  }
  const maxBytes = format.kind === "image" ? POST_IMAGE_MAX_BYTES : POST_VIDEO_MAX_BYTES;
  if (!file.size) throw new PostMediaValidationError("Boş dosya paylaşamazsın.", 400);
  if (file.size > maxBytes) {
    throw new PostMediaValidationError(format.kind === "image" ? "Görseller en fazla 8 MB olabilir." : "Videolar en fazla 20 MB olabilir.", 413);
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!format.magic(bytes)) throw new PostMediaValidationError("Dosyanın içeriği belirtilen görsel veya video türüyle eşleşmiyor.", 415);
  const size = format.kind === "image" ? readPostImageDimensions(bytes, file.type) : undefined;
  return { bytes, kind: format.kind, contentType: file.type, fileName: file.name.slice(0, 180), storedExtension: format.storedExtension, ...size };
}

/** Metadata guard runs before reading any file bytes, on both picker and server. */
export function validatePostMediaSelection(files: readonly File[]): string | null {
  if (files.length > POST_PHOTO_MAX_COUNT) return "Bir gönderiye en fazla 4 fotoğraf ekleyebilirsin.";
  if (files.some((file) => !(file instanceof File))) return "Geçerli bir dosya seçmelisin.";
  if (files.length > 1 && files.some((file) => !file.type.startsWith("image/"))) return "Bir gönderide 4 fotoğraf veya tek video paylaşabilirsin; türler birlikte kullanılamaz.";
  if (files.reduce((total, file) => total + file.size, 0) > POST_MEDIA_TOTAL_MAX_BYTES) return "Eklenen dosyaların toplamı en fazla 20 MB olabilir.";
  for (const file of files) {
    const format = formats[file.type];
    const extension = file.name.split(".").at(-1)?.toLowerCase() ?? "";
    if (!format || !format.extensions.includes(extension)) return "PNG, JPG, WEBP fotoğrafı veya MP4, WEBM videosu seçmelisin.";
    if (!file.size) return "Boş dosya paylaşamazsın.";
    if (file.size > (format.kind === "image" ? POST_IMAGE_MAX_BYTES : POST_VIDEO_MAX_BYTES)) return format.kind === "image" ? "Fotoğraflar en fazla 8 MB olabilir." : "Videolar en fazla 20 MB olabilir.";
  }
  return null;
}

export async function validatePostMediaFiles(files: readonly File[]) {
  const error = validatePostMediaSelection(files);
  if (error) {
    let status = 400;
    if (files.every((file) => file instanceof File)) {
      if (files.reduce((total, file) => total + file.size, 0) > POST_MEDIA_TOTAL_MAX_BYTES
        || files.some((file) => file.size > (file.type.startsWith("image/") ? POST_IMAGE_MAX_BYTES : POST_VIDEO_MAX_BYTES))) status = 413;
      else if (files.some((file) => !formats[file.type]?.extensions.includes(file.name.split(".").at(-1)?.toLowerCase() ?? ""))) status = 415;
    }
    throw new PostMediaValidationError(error, status);
  }
  // Sequential inspection bounds temporary memory; every file still undergoes the existing header checks.
  const attachments: Awaited<ReturnType<typeof validatePostMedia>>[] = [];
  for (const file of files) attachments.push(await validatePostMedia(file));
  return attachments;
}

export function postMediaUrl(id: string) {
  return `/api/posts/media?id=${encodeURIComponent(id)}`;
}

/** Caller must authorize the posts before requesting their media metadata. */
export async function hydratePostMedia(db: D1Database, postIds: string[]): Promise<Map<string, PostMedia[]>> {
  const result = new Map<string, PostMedia[]>();
  const ids = [...new Set(postIds)];
  // Stay below D1's bound-parameter limit when hydrating larger lists.
  for (let offset = 0; offset < ids.length; offset += 80) {
    const batch = ids.slice(offset, offset + 80);
    const rows = await db.prepare(
      `SELECT id, post_id, kind, content_type, original_file_name, width, height FROM post_media
       WHERE post_id IN (${batch.map(() => "?").join(",")}) ORDER BY ordinal, created_at, id`,
    ).bind(...batch).all<{ id: string; post_id: string; kind: PostMedia["kind"]; content_type: string; original_file_name: string; width: number | null; height: number | null }>();
    for (const row of rows.results) {
      const size = row.kind === "image" ? dimensions(row.width, row.height) : undefined;
      const media = { id: row.id, kind: row.kind, url: postMediaUrl(row.id), contentType: row.content_type, fileName: row.original_file_name, ...size };
      result.set(row.post_id, [...(result.get(row.post_id) ?? []), media]);
    }
  }
  return result;
}

export function parseMediaRange(header: string | null, size: number): { offset: number; length: number } | null | "invalid" {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (!match[1] && !match[2]) || size <= 0) return "invalid";
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) return "invalid";
    const length = Math.min(size, suffix);
    return { offset: size - length, length };
  }
  const start = Number(match[1]);
  const requestedEnd = match[2] ? Number(match[2]) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(requestedEnd)) return "invalid";
  const end = Math.min(requestedEnd, size - 1);
  if (start >= size || start > end) return "invalid";
  return { offset: start, length: end - start + 1 };
}
