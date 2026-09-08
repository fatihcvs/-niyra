import { sameOriginRequest, sha256 } from "./app-auth";
import { enforceRateLimit } from "./server-api";
import { BETA_CATEGORIES, BETA_STATUS, type BetaMessage, type BetaRequest, type BetaStatus } from "./beta-types";
import { purgeExpiredBetaRequests } from "./beta-retention";
import { prepareApplicantAccount } from "./test-accounts";

export class BetaError extends Error { constructor(public status: number, message: string) { super(message); } }
export const betaJson = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "private, no-store", "referrer-policy": "no-referrer" } });
export const betaFailure = (error: unknown) => error instanceof BetaError ? betaJson({ error: error.message }, error.status) : betaJson({ error: "İşlem tamamlanamadı. Bilgilerini koruyup yeniden dene." }, 503);
export const betaText = (value: unknown, max: number, min = 0) => {
  if (typeof value !== "string" || value.trim().length < min || value.trim().length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) throw new BetaError(422, "Alanlardan biri eksik veya izin verilen uzunluğu aşıyor.");
  return value.trim();
};
export function betaToken(value: unknown) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(value)) throw new BetaError(404, "Takip kodu bulunamadı veya süresi doldu.");
  return value;
}
export async function betaBody(request: Request) {
  if (!sameOriginRequest(request)) throw new BetaError(403, "İstek kaynağı doğrulanamadı.");
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new BetaError(415, "Geçerli bir form gönder.");
  const reader = request.body?.getReader(); if (!reader) throw new BetaError(422, "Form bilgileri gerekli.");
  const decoder = new TextDecoder(); let content = "", bytes = 0;
  try {
    while (true) {
      const chunk = await reader.read(); if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > 16384) { await reader.cancel(); throw new BetaError(413, "Form bilgileri çok uzun."); }
      content += decoder.decode(chunk.value, { stream: true });
    }
    content += decoder.decode();
  } finally { reader.releaseLock(); }
  try { const data = JSON.parse(content); if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error(); return data as Record<string, unknown>; }
  catch { throw new BetaError(422, "Form bilgileri okunamadı."); }
}
export async function limitBeta(db: D1Database, request: Request, scope: string, limit = 20) {
  const ip = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const result = await enforceRateLimit(db, `beta:${await sha256(ip.slice(0, 200))}`, scope, limit, 3600);
  if (!result.allowed) throw new BetaError(429, "Çok sık istek gönderildi. Bir süre sonra yeniden dene.");
}
const select = `SELECT id,kind,email,platform,display_name AS displayName,university,device_model AS deviceModel,
  android_version AS androidVersion,category,subject,message,status,priority,internal_note AS internalNote,play_url AS playUrl,
  revision,created_at AS createdAt,updated_at AS updatedAt,expires_at AS expiresAt,
  adult_confirmed AS adultConfirmed,android_confirmed AS androidConfirmed,participation_confirmed AS participationConfirmed FROM beta_requests`;

export async function submitBetaRequest(db: D1Database, request: Request, input: Record<string, unknown>) {
  await limitBeta(db, request, "submit", 10);
  if (input.website) throw new BetaError(422, "Form gönderilemedi. Sayfayı yenileyip yeniden dene.");
  const token = betaToken(input.token), accessHash = await sha256(token);
  const kind = input.kind; if (kind !== "application" && kind !== "feedback") throw new BetaError(422, "Form türü geçerli değil.");
  const platform = input.platform ?? "android";
  if (typeof platform !== "string" || !["web", "android", "both"].includes(platform)) throw new BetaError(422, "Test platformunu seç.");
  if (input.consent !== true) throw new BetaError(422, "Başvuru bilgisi açıklamasını onaylamalısın.");
  const email = betaText(input.email ?? "", 254).toLowerCase();
  if ((kind === "application" || email) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new BetaError(422, "Geçerli bir e-posta adresi yaz.");
  const adult = input.adult === true, android = input.android === true, participation = input.participation === true;
  const mobile = platform === "android" || platform === "both";
  if (kind === "application" && (!adult || (mobile && (!android || !participation)))) throw new BetaError(422, mobile ? "Test için 18 yaş ve üzeri olmalı, Android cihaz kullanmalı ve 14 gün katılabilmelisin." : "Test için 18 yaş ve üzeri olmalısın.");
  const category = kind === "application" ? "application" : betaText(input.category, 20, 1);
  if (kind === "feedback" && !Object.hasOwn(BETA_CATEGORIES, category)) throw new BetaError(422, "Geri bildirim türünü seç.");
  const fields = { kind, email, displayName: betaText(input.displayName ?? "", 80), university: betaText(input.university ?? "", 120),
    deviceModel: betaText(input.deviceModel ?? "", 120, kind === "application" && mobile ? 2 : 0), androidVersion: betaText(input.androidVersion ?? "", 30),
    category, subject: kind === "application" ? platform === "web" ? "Web test başvurusu" : platform === "both" ? "Web ve Android test başvurusu" : "Android kapalı test başvurusu" : betaText(input.subject, 160, 5),
    message: betaText(input.message ?? "", 3000, kind === "feedback" ? 10 : 0), adult, android, participation };
  const submissionHash = await sha256(JSON.stringify({ ...fields, platform })), legacyHash = input.platform === undefined ? await sha256(JSON.stringify(fields)) : null;
  const previous = await db.prepare("SELECT id,submission_hash FROM beta_requests WHERE access_hash=? AND expires_at>CURRENT_TIMESTAMP").bind(accessHash).first<{ id: string; submission_hash: string }>();
  if (previous) {
    if (previous.submission_hash !== submissionHash && previous.submission_hash !== legacyHash) throw new BetaError(409, "Bu gönderim daha önce farklı bilgilerle alındı. Takip sayfasından ek bilgi gönderebilirsin.");
    return { id: previous.id, received: true, ...(kind === "application" ? { accountDelivery: "email" } : {}) };
  }
  if (email) {
    const rate = await enforceRateLimit(db, `beta-email:${await sha256(email)}`, "beta-submit", 5, 86400);
    if (!rate.allowed) throw new BetaError(429, "Bu adres için günlük gönderim sınırına ulaşıldı. Mevcut takip kodunu kullanabilirsin.");
  }
  const source: Record<string, string> = {};
  if (input.source && typeof input.source === "object") for (const key of ["utm_source", "utm_medium", "utm_campaign", "utm_content"]) {
    const value = (input.source as Record<string, unknown>)[key]; if (typeof value === "string" && /^[\w.-]{1,100}$/.test(value)) source[key] = value;
  }
  const id = crypto.randomUUID();
  const issuance = kind === "application" ? await prepareApplicantAccount(db, { id, email, displayName: fields.displayName }) : [];
  await db.batch([db.prepare(`INSERT INTO beta_requests(id,kind,access_hash,submission_hash,email,display_name,university,device_model,android_version,
    category,subject,message,adult_confirmed,android_confirmed,participation_confirmed,consent_version,source_json,platform)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'beta-2026-09-08-test-account-v1',?,?) ON CONFLICT(access_hash) DO NOTHING`)
    .bind(id, kind, accessHash, submissionHash, email, fields.displayName, fields.university, fields.deviceModel, fields.androidVersion,
      category, fields.subject, fields.message, Number(adult), Number(android), Number(participation), JSON.stringify(source), platform), ...issuance]);
  const saved = await db.prepare("SELECT id,submission_hash FROM beta_requests WHERE access_hash=?").bind(accessHash).first<{ id: string; submission_hash: string }>();
  if (!saved || saved.submission_hash !== submissionHash) throw new BetaError(409, "Gönderim bilgileri değişti. Takip kodunu kullanarak kontrol et.");
  return { id: saved.id, received: true, ...(kind === "application" ? { accountDelivery: "email" } : {}) };
}

export async function readBetaStatus(db: D1Database, token: unknown) {
  const row = await db.prepare(`${select} WHERE access_hash=? AND expires_at>CURRENT_TIMESTAMP`).bind(await sha256(betaToken(token))).first<BetaRequest>();
  if (!row) throw new BetaError(404, "Takip kodu bulunamadı veya süresi doldu.");
  const messages = await db.prepare(`SELECT id,author_kind AS authorKind,content,created_at AS createdAt FROM beta_request_messages
    WHERE request_id=? ORDER BY created_at,id LIMIT 100`).bind(row.id).all<BetaMessage>();
  const publicRequest = { id: row.id, kind: row.kind, platform: row.platform, status: row.status, subject: row.subject, message: row.message,
    displayName: row.displayName, deviceModel: row.deviceModel, playUrl: row.playUrl, revision: row.revision,
    createdAt: row.createdAt, updatedAt: row.updatedAt, expiresAt: row.expiresAt };
  return { request: publicRequest, messages: messages.results };
}

export async function betaFollowup(db: D1Database, input: Record<string, unknown>) {
  const token = betaToken(input.token), { request: current } = await readBetaStatus(db, token);
  if (current.status === "withdrawn") throw new BetaError(409, "Bu başvuru kapatıldı.");
  if (input.action === "withdraw") {
    if (input.confirm !== true) throw new BetaError(422, "Başvurudan ayrılmayı onaylamalısın.");
    await db.batch([
      db.prepare(`UPDATE beta_requests SET status='withdrawn',email='',display_name='',university='',device_model='',android_version='',subject='Kapatılan talep',message='',internal_note='',play_url='',source_json='{}',revision=revision+1,updated_at=CURRENT_TIMESTAMP
        WHERE id=? AND status!='withdrawn'`).bind(current.id),
      db.prepare("DELETE FROM beta_request_messages WHERE request_id=?").bind(current.id),
    ]);
  } else if (input.action === "joined") {
    await db.prepare(`UPDATE beta_requests SET status='testing',revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND kind='application' AND platform!='web' AND status='invited'`).bind(current.id).run();
  } else if (input.action === "message") {
    const message = betaText(input.message, 3000, 5), id = betaText(input.requestId, 80, 8);
    if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(id)) throw new BetaError(422, "Mesaj tekrar anahtarı geçerli değil.");
    const count = await db.prepare("SELECT COUNT(*) AS n FROM beta_request_messages WHERE request_id=?").bind(current.id).first<{ n: number }>();
    if ((count?.n ?? 0) >= 100) throw new BetaError(422, "Bu görüşme doldu. Yeni bir destek talebi açabilirsin.");
    await db.batch([
      db.prepare(`INSERT INTO beta_request_messages(id,request_id,author_kind,content)
        SELECT ?,?,'applicant',? WHERE EXISTS(SELECT 1 FROM beta_requests WHERE id=? AND status!='withdrawn' AND expires_at>CURRENT_TIMESTAMP)
        AND (SELECT COUNT(*) FROM beta_request_messages WHERE request_id=?)<100 ON CONFLICT(id) DO NOTHING`).bind(id, current.id, message, current.id, current.id),
      db.prepare(`UPDATE beta_requests SET status=CASE WHEN status='needs_info' THEN 'new' WHEN status='resolved' THEN 'triaged' ELSE status END,
        revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND changes()>0`).bind(current.id),
    ]);
    const saved = await db.prepare("SELECT request_id,content,author_kind FROM beta_request_messages WHERE id=?").bind(id).first<{ request_id: string; content: string; author_kind: string }>();
    if (!saved || saved.request_id !== current.id || saved.content !== message || saved.author_kind !== "applicant") throw new BetaError(409, "Mesajın güncel durumu değişti. Takip sayfasını yenile.");
  } else throw new BetaError(422, "Takip işlemi geçerli değil.");
  return readBetaStatus(db, token);
}

export async function listBetaRequests(db: D1Database, search: URLSearchParams) {
  await purgeExpiredBetaRequests(db);
  const kind = search.get("kind") ?? "application", status = search.get("status") ?? "open", cursor = search.get("cursor") ?? "";
  const [beforeDate = "", beforeId = ""] = cursor.split("|");
  if (!["application", "feedback"].includes(kind) || (status !== "open" && status !== "all" && !Object.hasOwn(BETA_STATUS, status)) || cursor.length > 100 || (cursor && (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(beforeDate) || !/^[a-f0-9-]{36}$/.test(beforeId)))) throw new BetaError(422, "Kuyruk filtresi geçerli değil.");
  const rows = await db.prepare(`${select} WHERE kind=? AND (?='all' OR (?='open' AND status NOT IN ('withdrawn','declined','completed','resolved')) OR status=?)
    AND (?='' OR created_at<? OR (created_at=? AND id<?)) ORDER BY created_at DESC,id DESC LIMIT 31`).bind(kind, status, status, status, beforeDate, beforeDate, beforeDate, beforeId).all<BetaRequest>();
  const items = rows.results.slice(0, 30), last = items.at(-1);
  return { items, nextCursor: rows.results.length > 30 && last ? `${last.createdAt}|${last.id}` : null };
}

export type BetaReviewer = { staffId: string | null; automated: boolean; guard: string; values: D1Value[] };
export async function reviewBetaRequest(db: D1Database, input: Record<string, unknown>, actor: BetaReviewer) {
  const id = betaText(input.id, 80, 1), revision = input.revision;
  if (typeof revision !== "number" || !Number.isSafeInteger(revision) || revision < 0) throw new BetaError(422, "Güncel kayıt sürümü gerekli.");
  const current = await db.prepare(`${select} WHERE id=? AND expires_at>CURRENT_TIMESTAMP`).bind(id).first<BetaRequest>();
  if (!current) throw new BetaError(404, "Kayıt bulunamadı.");
  if (current.status === "withdrawn") throw new BetaError(409, "Bu kişi başvurusundan ayrılmış.");
  const status = betaText(input.status, 30, 1) as BetaStatus;
  const allowed = current.kind === "application" ? ["new", "needs_info", "ready", "invited", "testing", "completed", "declined"] : ["new", "needs_info", "triaged", "in_progress", "resolved"];
  if (!allowed.includes(status)) throw new BetaError(422, "Bu kayıt için durum geçerli değil.");
  if (status === "ready" && (!current.adultConfirmed || (current.platform !== "web" && (!current.androidConfirmed || !current.participationConfirmed)))) throw new BetaError(422, "Test katılım koşulları eksik.");
  if (actor.automated && (current.status !== "new" || !(current.kind === "application" ? ["ready", "needs_info"] : ["triaged", "needs_info"]).includes(status))) throw new BetaError(403, "Otomasyon yalnız yeni başvuruları ön değerlendirebilir.");
  const note = betaText(input.internalNote ?? current.internalNote, 3000), reply = betaText(input.reply ?? "", 3000);
  const priority = input.priority ?? current.priority; if (!["normal", "high", "urgent"].includes(String(priority))) throw new BetaError(422, "Öncelik geçerli değil.");
  let playUrl = current.playUrl;
  if (input.playUrl !== undefined) {
    playUrl = betaText(input.playUrl, 500);
    if (playUrl) { let url: URL; try { url = new URL(playUrl); } catch { throw new BetaError(422, "Google Play test bağlantısı geçerli değil."); }
      if (url.protocol !== "https:" || url.hostname !== "play.google.com" || url.pathname !== "/apps/testing/app.kampira.mobile" || Boolean(url.port) || url.username || url.password) throw new BetaError(422, "Kampira kapalı test katılım bağlantısını kullan.");
    }
  }
  if (status === "invited" && current.platform !== "web" && (!playUrl || (current.status !== "invited" && input.accessConfirmed !== true))) throw new BetaError(422, "Google hesabının Play Console listesine eklendiğini ve kapalı test bağlantısını doğrula.");
  const result = await db.batch([
    db.prepare(`UPDATE beta_requests SET status=?,priority=?,internal_note=?,play_url=?,revision=revision+1,updated_at=CURRENT_TIMESTAMP
      WHERE id=? AND revision=? AND status!='withdrawn' AND expires_at>CURRENT_TIMESTAMP AND ${actor.guard}`)
      .bind(status, String(priority), note, playUrl, id, revision, ...actor.values),
    db.prepare(`INSERT INTO staff_audit_logs(id,staff_id,action,entity_type,entity_id,detail)
      SELECT ?,?,'beta.reviewed','beta-request',?,? WHERE changes()>0`)
      .bind(crypto.randomUUID(), actor.staffId, id, JSON.stringify({ from: current.status, to: status, revision: revision + 1, automated: actor.automated })),
    db.prepare(`INSERT INTO beta_request_messages(id,request_id,author_kind,content) SELECT ?,?,?,? WHERE changes()>0 AND ?!=''`)
      .bind(crypto.randomUUID(), id, actor.automated ? "automation" : "staff", reply, reply),
  ]);
  if (!result[0].meta.changes) throw new BetaError(409, "Kayıt veya yönetim oturumu değişti. Güncel durumu yükle.");
  return { updated: true, id, revision: revision + 1 };
}
