export type PostMedia = {
  id: string;
  kind: "image" | "video";
  url: string;
  contentType: string;
  fileName: string;
};

export const POST_IMAGE_MAX_BYTES = 8 * 1024 * 1024;
export const POST_VIDEO_MAX_BYTES = 20 * 1024 * 1024;
export const POST_MEDIA_ACCEPT = "image/png,image/jpeg,image/webp,video/mp4,video/webm";

type MediaFormat = {
  kind: PostMedia["kind"];
  extensions: string[];
  storedExtension: string;
  magic: (bytes: Uint8Array) => boolean;
};

const signature = (bytes: Uint8Array, offset: number, value: string) =>
  String.fromCharCode(...bytes.subarray(offset, offset + value.length)) === value;

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
  return { bytes, kind: format.kind, contentType: file.type, fileName: file.name.slice(0, 180), storedExtension: format.storedExtension };
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
      `SELECT id, post_id, kind, content_type, original_file_name FROM post_media
       WHERE post_id IN (${batch.map(() => "?").join(",")}) ORDER BY created_at, id`,
    ).bind(...batch).all<{ id: string; post_id: string; kind: PostMedia["kind"]; content_type: string; original_file_name: string }>();
    for (const row of rows.results) {
      const media = { id: row.id, kind: row.kind, url: postMediaUrl(row.id), contentType: row.content_type, fileName: row.original_file_name };
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
