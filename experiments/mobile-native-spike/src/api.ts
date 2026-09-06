/** The experiment speaks the existing cookie API; it never invents or extracts a token. */
export const DEFAULT_ORIGIN = "https://web-production-da44f.up.railway.app";
export type Profile = { publicId: string; displayName: string; handle: string; bio: string; universityName: string; departmentName: string; postCount: number; followerCount: number; followingCount: number; avatarUrl: string | null };
export type Post = { id: string; authorId?: string; name: string; text: string; time: string; course: string; likes: number; comments: number; media: Array<{ id: string; kind: "image" | "video"; url: string; width?: number; height?: number }> };
export type FeedPage = { posts: Post[]; nextCursor: string | null };
export type Person = Profile & { posts: Post[] };
export type Conversation = { id: string; person: { publicId: string; displayName: string; handle: string }; preview: string; unreadCount: number; time: string };
export type Session = { identity: { email: string; displayName: string }; profile: Profile };

export class ApiError extends Error {
  readonly status: number;
  constructor(message: string, status = 0) { super(message); this.name = "ApiError"; this.status = status; }
}
export function apiOrigin(value = DEFAULT_ORIGIN) {
  const parsed = new URL(value);
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash) throw new ApiError("API adresi yalnız HTTPS origin olmalı.");
  return parsed.origin;
}
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ApiError("Sunucu yanıtı beklenen biçimde değil.");
  return value as Record<string, unknown>;
};
const text = (value: unknown) => typeof value === "string" ? value : "";
const number = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : 0;
const nullable = (value: unknown) => typeof value === "string" ? value : null;
function profile(value: unknown): Profile {
  const p = object(value);
  if (!text(p.publicId) || !text(p.displayName)) throw new ApiError("Öğrenci profili doğrulanamadı.");
  return { publicId: text(p.publicId), displayName: text(p.displayName), handle: text(p.handle), bio: text(p.bio), universityName: text(p.universityName), departmentName: text(p.departmentName), postCount: number(p.postCount), followerCount: number(p.followerCount), followingCount: number(p.followingCount), avatarUrl: nullable(p.avatarUrl) };
}
function posts(value: unknown): Post[] {
  if (!Array.isArray(value)) throw new ApiError("Gönderi listesi doğrulanamadı.");
  return value.map((raw) => {
    const p = object(raw);
    if (!text(p.id) || typeof p.text !== "string" || !text(p.name)) throw new ApiError("Gönderi doğrulanamadı.");
    const media: Post["media"] = Array.isArray(p.media) ? p.media.map((rawMedia) => {
      const m = object(rawMedia);
      if (!text(m.id) || !text(m.url) || (m.kind !== "image" && m.kind !== "video")) throw new ApiError("Medya doğrulanamadı.");
      return { id: text(m.id), url: text(m.url), kind: m.kind, width: number(m.width) || undefined, height: number(m.height) || undefined };
    }) : [];
    return { id: text(p.id), authorId: text(p.authorId) || undefined, name: text(p.name), text: text(p.text), time: text(p.time), course: text(p.course), likes: number(p.likes), comments: number(p.comments), media };
  });
}

export function createApi({ origin = DEFAULT_ORIGIN, fetcher = fetch, timeoutMs = 20000 }: { origin?: string; fetcher?: typeof fetch; timeoutMs?: number } = {}) {
  const base = apiOrigin(origin);
  async function request(path: string, init: RequestInit = {}, external?: AbortSignal) {
    const target = new URL(path, base);
    if (target.origin !== base || !target.pathname.startsWith("/api/")) throw new ApiError("API dışına özel istek gönderilemez.");
    const controller = new AbortController(); let timedOut = false;
    const abort = () => controller.abort();
    if (external?.aborted) controller.abort(); external?.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    try {
      const response = await fetcher(target.href, { ...init, credentials: "include", cache: "no-store", headers: { accept: "application/json", ...(init.body ? { "content-type": "application/json" } : {}), ...init.headers }, signal: controller.signal });
      // Do not accept an HTML login redirect as an authenticated data response.
      if (response.redirected || (response.url && new URL(response.url).origin !== base)) throw new ApiError("Oturum yönlendirmesi doğrulanamadı.",401);
      if (!response.headers.get("content-type")?.includes("application/json")) throw new ApiError("Sunucudan geçerli JSON yanıtı alınamadı.",response.status);
      const data = object(await response.json());
      if (external?.aborted) throw new DOMException("Ekran kapandı.","AbortError");
      if (timedOut) throw new ApiError("Bağlantı zaman aşımına uğradı.");
      if (!response.ok) throw new ApiError(text(data.error) || "İşlem tamamlanamadı.",response.status);
      return data;
    } catch (error) { if (timedOut) throw new ApiError("Bağlantı zaman aşımına uğradı."); throw error; }
    finally { clearTimeout(timer); external?.removeEventListener("abort",abort); }
  }
  async function session(signal?: AbortSignal): Promise<Session> {
    const data = await request("/api/profile",{},signal); const identity = object(data.identity);
    if (!text(identity.email)) throw new ApiError("Sunucu oturumu doğrulanamadı.",401);
    if (!data.profile) throw new ApiError("Önce Kampira web uygulamasında akademik profilini tamamla.",409);
    return { identity: { email: text(identity.email), displayName: text(identity.displayName) }, profile: profile(data.profile) };
  }
  return {
    origin: base,
    session,
    async login(email: string, password: string, signal?: AbortSignal) {
      await request("/api/auth/session",{ method: "POST", body: JSON.stringify({ email,password }) },signal);
      const verified = await session(signal);
      if (verified.identity.email.trim().toLowerCase() !== email.trim().toLowerCase()) throw new ApiError("Native çerez oturumu giriş yapılan hesapla eşleşmedi.",401);
      return verified;
    },
    async logout(signal?: AbortSignal) { await request("/api/auth/session",{ method: "DELETE" },signal); },
    async feed(cursor: string | null = null, signal?: AbortSignal): Promise<FeedPage> {
      const data = await request(`/api/posts?feed=all${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,{},signal);
      return { posts: posts(data.posts), nextCursor: nullable(data.nextCursor) };
    },
    async person(id: string, signal?: AbortSignal): Promise<Person> {
      const data = await request(`/api/people?id=${encodeURIComponent(id)}`,{},signal); const person = object(data.person);
      if (person.publicId !== id) throw new ApiError("Profil kimliği beklenen kişiyle eşleşmedi.");
      return { ...profile(person), posts: posts(person.posts) };
    },
    async conversations(signal?: AbortSignal): Promise<Conversation[]> {
      const data = await request("/api/messages",{},signal);
      if (!Array.isArray(data.conversations)) throw new ApiError("Konuşma listesi doğrulanamadı.");
      return data.conversations.map((raw) => { const c = object(raw); const p = object(c.person); if (!text(c.id) || !text(p.publicId)) throw new ApiError("Konuşma kimliği doğrulanamadı."); return { id: text(c.id), person: { publicId: text(p.publicId), displayName: text(p.displayName), handle: text(p.handle) }, preview: text(c.preview), unreadCount: number(c.unreadCount), time: text(c.time) }; });
    },
    async publish(content: string, audience: "campus" | "platform", key: string, signal?: AbortSignal): Promise<Post> {
      if (!content.trim() || content.length > 1200 || !/^[\w-]{16,100}$/.test(key)) throw new ApiError("Gönderi veya yeniden deneme anahtarı geçerli değil.");
      const data = await request("/api/posts",{ method: "POST", headers: { "Idempotency-Key": key }, body: JSON.stringify({ content: content.trim(), audience, courseId: null }) },signal);
      return posts([data.post])[0];
    },
    /** Only same-origin private media routes are eligible; no cookie or bearer is exported. */
    mediaUrl(value: string) {
      const target = new URL(value,base);
      if (target.origin !== base || target.username || target.password || !["/api/posts/media","/api/profile/media"].includes(target.pathname)) return null;
      return target.href;
    },
  };
}
