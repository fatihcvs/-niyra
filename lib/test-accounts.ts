import { cleanDisplayName, hashPassword, passwordValidationError, sha256 } from "./app-auth";
import type { BetaReviewer } from "./beta-requests";

export class TestAccountError extends Error { constructor(public status: number, message: string) { super(message); } }
export const testAccountJson = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "private, no-store", "referrer-policy": "no-referrer" } });
export const privateTestAccountResponse = (response: Response) => { response.headers.set("cache-control", "private, no-store"); response.headers.set("referrer-policy", "no-referrer"); return response; };
export const testAccountFailure = (error: unknown) => testAccountJson({ error: error instanceof TestAccountError ? error.message : "İşlem tamamlanamadı. Aynı isteği güvenle yeniden deneyebilirsin." }, error instanceof TestAccountError ? error.status : 503);
export type TestAccount = { id: string; loginEmail: string; displayName: string; kind: "generated" | "applicant" | "existing-beta"; status: "pending" | "active" | "revoked"; createdAt: string; applicationId: string | null };
const accountSelect = `SELECT t.id,t.user_email AS loginEmail,u.display_name AS displayName,t.kind,t.status,t.created_at AS createdAt,t.source_application_id AS applicationId FROM test_accounts t JOIN users u ON u.email=t.user_email`;
const requestId = (value: unknown) => { if (typeof value !== "string" || !/^[A-Za-z0-9_-]{8,80}$/.test(value)) throw new TestAccountError(422, "İşlem anahtarı geçerli değil."); return value; };
const idValue = (value: unknown) => { if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,160}$/.test(value)) throw new TestAccountError(422, "Hesap kimliği geçerli değil."); return value; };
const randomToken = () => { let text = ""; for (const byte of crypto.getRandomValues(new Uint8Array(32))) text += String.fromCharCode(byte); return btoa(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, ""); };
const alias = () => `beta-${crypto.randomUUID().replace(/-/g, "")}@test.kampira.net`;
const cursor = (value: string | null) => {
  if (!value) return null;
  try { const parsed = JSON.parse(atob(value)); if (!Array.isArray(parsed) || parsed.length !== 2 || typeof parsed[0] !== "string" || parsed[0].length > 40 || typeof parsed[1] !== "string" || parsed[1].length > 160) throw new Error(); return parsed as [string, string]; }
  catch { throw new TestAccountError(422, "Sayfa bilgisi geçerli değil."); }
};
export async function listTestAccounts(db: D1Database, value: string | null) {
  const after = cursor(value);
  const result = await db.prepare(`${accountSelect} ${after ? "WHERE (t.created_at<? OR (t.created_at=? AND t.id<?))" : ""} ORDER BY t.created_at DESC,t.id DESC LIMIT 31`)
    .bind(...(after ? [after[0], after[0], after[1]] : [])).all<TestAccount>();
  const items = result.results.slice(0, 30), last = items.at(-1);
  return { items, nextCursor: result.results.length > 30 && last ? btoa(JSON.stringify([last.createdAt, last.id])) : null };
}

/** Plaintext is returned only by the winning initial transaction; replay/list never reconstruct a password. */
export async function issueStaffTestAccount(db: D1Database, body: Record<string, unknown>, actor: BetaReviewer) {
  const operationId = requestId(body.requestId), action = body.action ?? "create";
  if (action !== "create" && action !== "reset") throw new TestAccountError(422, "İşlem geçerli değil.");
  if (action === "reset" && actor.automated) throw new TestAccountError(403, "Parola yenileme yönetim panelinden yapılmalı.");
  const name = cleanDisplayName(body.displayName) || "Kampira Test", target = action === "reset" ? idValue(body.id) : "";
  const hash = await sha256(JSON.stringify({ action, name: action === "create" ? name : "", target }));
  const readOperation = () => db.prepare("SELECT account_id,request_hash,operation_nonce FROM test_account_operations WHERE id=?").bind(operationId).first<{ account_id: string | null; request_hash: string; operation_nonce: string }>();
  const prior = await readOperation();
  if (prior) {
    if (prior.request_hash !== hash) throw new TestAccountError(409, "Bu işlem anahtarı başka bilgilerle kullanıldı.");
    const account = prior.account_id ? await db.prepare(`${accountSelect} WHERE t.id=?`).bind(prior.account_id).first<TestAccount>() : null;
    return { account, credentials: null, replayed: true };
  }
  const password = `Kp!${randomToken()}9a`, credential = await hashPassword(password), nonce = crypto.randomUUID();
  const accountId = action === "create" ? crypto.randomUUID() : target, publicId = crypto.randomUUID(), email = alias();
  const opOwn = "EXISTS(SELECT 1 FROM test_account_operations WHERE id=? AND operation_nonce=?)";
  const statements: D1PreparedStatement[] = [];
  if (action === "create") {
    statements.push(
      db.prepare(`INSERT INTO users(email,public_id,display_name,handle) SELECT ?,?,?,? WHERE ${actor.guard} AND NOT EXISTS(SELECT 1 FROM test_account_operations WHERE id=?)`).bind(email, publicId, name, `beta${publicId.replace(/-/g, "").slice(0, 20)}`, ...actor.values, operationId),
      db.prepare(`INSERT INTO test_accounts(id,user_email,kind,status,created_by_staff_id) SELECT ?,email,'generated','active',? FROM users WHERE public_id=? AND ${actor.guard}`).bind(accountId, actor.staffId, publicId, ...actor.values),
      db.prepare(`INSERT INTO test_account_operations(id,account_id,action,request_hash,operation_nonce) SELECT ?,id,'create',?,? FROM test_accounts WHERE id=? AND ${actor.guard} ON CONFLICT(id) DO NOTHING`).bind(operationId, hash, nonce, accountId, ...actor.values),
      db.prepare(`INSERT INTO user_credentials(user_email,password_hash,password_salt,password_iterations) SELECT user_email,?,?,? FROM test_accounts WHERE id=? AND ${opOwn}`).bind(credential.hash, credential.salt, credential.iterations, accountId, operationId, nonce),
    );
  } else {
    statements.push(
      db.prepare(`INSERT INTO test_account_operations(id,account_id,action,request_hash,operation_nonce) SELECT ?,t.id,'reset',?,? FROM test_accounts t JOIN users u ON u.email=t.user_email WHERE t.id=? AND t.kind='generated' AND t.status='active' AND u.status='active' AND ${actor.guard} ON CONFLICT(id) DO NOTHING`).bind(operationId, hash, nonce, accountId, ...actor.values),
      db.prepare(`UPDATE user_credentials SET password_hash=?,password_salt=?,password_iterations=?,updated_at=CURRENT_TIMESTAMP WHERE user_email=(SELECT user_email FROM test_accounts WHERE id=?) AND ${opOwn}`).bind(credential.hash, credential.salt, credential.iterations, accountId, operationId, nonce),
      db.prepare(`DELETE FROM user_sessions WHERE user_email=(SELECT user_email FROM test_accounts WHERE id=?) AND ${opOwn}`).bind(accountId, operationId, nonce),
    );
  }
  statements.push(db.prepare(`INSERT INTO staff_audit_logs(id,staff_id,action,entity_type,entity_id,detail) SELECT ?,?,?,'test-account',?,'{}' WHERE ${opOwn}`).bind(crypto.randomUUID(), actor.staffId, `test-account.${action}`, accountId, operationId, nonce));
  await db.batch(statements);
  const saved = await readOperation();
  if (!saved) throw new TestAccountError(403, "Hesap veya yönetim erişimi değişti. Listeyi yenile.");
  if (saved.request_hash !== hash) throw new TestAccountError(409, "İşlem bilgileri değişti.");
  const account = await db.prepare(`${accountSelect} WHERE t.id=?`).bind(saved.account_id).first<TestAccount>();
  return { account, credentials: saved.operation_nonce === nonce && account ? { loginEmail: account.loginEmail, password } : null, replayed: saved.operation_nonce !== nonce };
}

async function activationToken(outboxId: string, nonce: string, accountId: string) {
  const { env } = await import("cloudflare:workers");
  const secret = (env as unknown as Record<string, unknown>).BETA_REVIEW_SECRET;
  if (typeof secret !== "string" || !/^[A-Za-z0-9_-]{43,128}$/.test(secret)) throw new Error("Test account delivery unavailable");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`kampira/test-account-activation/v1:${outboxId}:${nonce}:${accountId}`));
  let binary = ""; for (const byte of new Uint8Array(signature)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

/** Append after the beta request INSERT in the same batch. No credential is returned by public intake. */
export async function prepareApplicantAccount(db: D1Database, application: { id: string; email: string; displayName: string }) {
  const recipientHash = await sha256(application.email), existing = await db.prepare(`SELECT t.id,t.user_email,t.status,a.expires_at,a.token_hash,EXISTS(SELECT 1 FROM user_credentials c WHERE c.user_email=t.user_email) AS has_credentials FROM test_accounts t LEFT JOIN test_account_activations a ON a.account_id=t.id WHERE t.recipient_hash=?`)
    .bind(recipientHash).first<{ id: string; user_email: string; status: string; expires_at: string | null; token_hash: string | null; has_credentials: number }>();
  // An application is never authority to replace an established password or restore revoked access.
  if (existing?.status === "active" || existing?.has_credentials || (existing?.status === "pending" && existing.token_hash && existing.expires_at && Date.parse(`${existing.expires_at.replace(" ", "T")}Z`) > Date.now())) return [];
  const accountId = existing?.id ?? crypto.randomUUID(), email = existing?.user_email ?? alias(), publicId = crypto.randomUUID(), outboxId = crypto.randomUUID(), nonce = randomToken();
  const tokenHash = await sha256(await activationToken(outboxId, nonce, accountId));
  const validApplication = "EXISTS(SELECT 1 FROM beta_requests WHERE id=? AND kind='application' AND email=? AND status!='withdrawn' AND expires_at>CURRENT_TIMESTAMP AND adult_confirmed=1)";
  const values = [application.id, application.email];
  const statements: D1PreparedStatement[] = [];
  if (!existing) {
    statements.push(db.prepare(`INSERT INTO users(email,public_id,display_name,handle) SELECT ?,?,?,? WHERE ${validApplication} AND NOT EXISTS(SELECT 1 FROM test_accounts WHERE recipient_hash=?)`).bind(email, publicId, cleanDisplayName(application.displayName) || "Kampira Test", `beta${publicId.replace(/-/g, "").slice(0, 20)}`, ...values, recipientHash),
      db.prepare(`INSERT INTO test_accounts(id,user_email,kind,status,recipient_hash,source_application_id,issuance_nonce) SELECT ?,email,'applicant','pending',?,?,? FROM users WHERE public_id=?`).bind(accountId, recipientHash, application.id, nonce, publicId));
  } else {
    statements.push(db.prepare(`UPDATE test_accounts SET status='pending',source_application_id=?,issuance_nonce=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status!='active' AND ${validApplication} AND NOT EXISTS(SELECT 1 FROM test_account_activations WHERE account_id=? AND token_hash IS NOT NULL AND expires_at>CURRENT_TIMESTAMP) AND NOT EXISTS(SELECT 1 FROM user_credentials WHERE user_email=test_accounts.user_email) AND EXISTS(SELECT 1 FROM users WHERE email=test_accounts.user_email AND status='active')`).bind(application.id, nonce, accountId, ...values, accountId));
  }
  const own = "EXISTS(SELECT 1 FROM test_accounts WHERE id=? AND source_application_id=? AND issuance_nonce=? AND status='pending')";
  statements.push(
    db.prepare(`UPDATE test_account_outbox SET state='cancelled',recipient_email='',token_nonce='',lease_hash=NULL,lease_expires_at=NULL WHERE account_id=? AND ${own}`).bind(accountId, accountId, application.id, nonce),
    db.prepare(`INSERT INTO test_account_outbox(id,account_id,application_id,recipient_email,token_nonce) SELECT ?,?,?,?,? WHERE ${own} ON CONFLICT(application_id) DO NOTHING`).bind(outboxId, accountId, application.id, application.email, nonce, accountId, application.id, nonce),
    db.prepare(`INSERT INTO test_account_activations(account_id,outbox_id,token_hash) SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM test_account_outbox WHERE id=?) ON CONFLICT(account_id) DO UPDATE SET outbox_id=excluded.outbox_id,token_hash=excluded.token_hash,expires_at=excluded.expires_at,consumed_at=NULL`).bind(accountId, outboxId, tokenHash, outboxId),
  );
  return statements;
}

export async function expireTestAccountDeliveries(db: D1Database) {
  await db.batch([
    db.prepare("UPDATE test_account_activations SET token_hash=NULL WHERE expires_at<=CURRENT_TIMESTAMP"),
    db.prepare(`UPDATE test_account_outbox SET state=CASE WHEN state='sent' THEN 'sent' WHEN state='claimed' AND EXISTS(SELECT 1 FROM test_account_activations WHERE outbox_id=test_account_outbox.id AND consumed_at IS NOT NULL) THEN 'claimed' ELSE 'cancelled' END,recipient_email='',token_nonce='',updated_at=CURRENT_TIMESTAMP
      WHERE (expires_at<=CURRENT_TIMESTAMP OR NOT EXISTS(SELECT 1 FROM test_account_activations a JOIN test_accounts t ON t.id=a.account_id JOIN users u ON u.email=t.user_email WHERE a.outbox_id=test_account_outbox.id AND a.token_hash IS NOT NULL AND t.status='pending' AND u.status='active')) AND (token_nonce!='' OR recipient_email!='')`),
    db.prepare("UPDATE test_account_outbox SET state='unknown',lease_hash=NULL,lease_expires_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE state='claimed' AND lease_expires_at<=CURRENT_TIMESTAMP"),
  ]);
}
const activeTokenQuery = `SELECT t.id,t.user_email AS loginEmail,a.expires_at AS expiresAt,a.outbox_id AS outboxId FROM test_account_activations a JOIN test_accounts t ON t.id=a.account_id JOIN users u ON u.email=t.user_email JOIN beta_requests b ON b.id=t.source_application_id
  WHERE a.token_hash=? AND a.expires_at>CURRENT_TIMESTAMP AND a.consumed_at IS NULL AND t.status='pending' AND u.status='active' AND b.status!='withdrawn' AND b.expires_at>CURRENT_TIMESTAMP`;
export async function inspectTestActivation(db: D1Database, value: unknown) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(value)) throw new TestAccountError(404, "Etkinleştirme bağlantısı geçersiz veya süresi dolmuş.");
  await expireTestAccountDeliveries(db);
  const tokenHash = await sha256(value), account = await db.prepare(activeTokenQuery).bind(tokenHash).first<{ id: string; loginEmail: string; expiresAt: string; outboxId: string }>();
  if (!account) throw new TestAccountError(404, "Etkinleştirme bağlantısı geçersiz veya süresi dolmuş.");
  return { account, tokenHash };
}
export async function activateTestAccount(db: D1Database, token: unknown, password: unknown) {
  const { account, tokenHash } = await inspectTestActivation(db, token), error = passwordValidationError(password, account.loginEmail);
  if (error) throw new TestAccountError(422, error);
  const credential = await hashPassword(password as string);
  const guard = `EXISTS(${activeTokenQuery}) AND NOT EXISTS(SELECT 1 FROM user_credentials WHERE user_email=?)`;
  const result = await db.batch([
    db.prepare(`INSERT INTO user_credentials(user_email,password_hash,password_salt,password_iterations) SELECT ?,?,?,? WHERE ${guard}`).bind(account.loginEmail, credential.hash, credential.salt, credential.iterations, tokenHash, account.loginEmail),
    db.prepare("UPDATE test_accounts SET status='active',updated_at=CURRENT_TIMESTAMP WHERE id=? AND changes()>0").bind(account.id),
    db.prepare("UPDATE test_account_activations SET token_hash=NULL,consumed_at=CURRENT_TIMESTAMP WHERE account_id=? AND changes()>0").bind(account.id),
    db.prepare("UPDATE test_account_outbox SET token_nonce='',updated_at=CURRENT_TIMESTAMP WHERE account_id=? AND EXISTS(SELECT 1 FROM test_accounts WHERE id=? AND status='active')").bind(account.id, account.id),
  ]);
  if (!result[0].meta.changes) throw new TestAccountError(409, "Bağlantı kullanılmış veya hesap durumu değişmiş. Giriş ekranını kullanabilirsin.");
  return { activated: true, loginEmail: account.loginEmail };
}

export async function listTestAccountMail(db: D1Database, params: URLSearchParams) {
  await expireTestAccountDeliveries(db);
  const state = params.get("state") ?? "pending";
  if (!["pending", "claimed", "sent", "unknown", "cancelled"].includes(state)) throw new TestAccountError(422, "Kuyruk durumu geçerli değil.");
  const after = cursor(params.get("cursor"));
  const result = await db.prepare(`SELECT id,account_id AS accountId,state,attempts,provider_message_id AS providerMessageId,created_at AS createdAt,expires_at AS expiresAt FROM test_account_outbox WHERE state=? ${after ? "AND (created_at<? OR (created_at=? AND id<?))" : ""} ORDER BY created_at DESC,id DESC LIMIT 31`)
    .bind(state, ...(after ? [after[0], after[0], after[1]] : [])).all<{ id: string; createdAt: string }>();
  const items = result.results.slice(0, 30), last = items.at(-1);
  return { items, nextCursor: result.results.length > 30 && last ? btoa(JSON.stringify([last.createdAt, last.id])) : null };
}
export async function claimTestAccountMail(db: D1Database, input: Record<string, unknown>, actor: BetaReviewer) {
  await expireTestAccountDeliveries(db);
  const id = idValue(input.id), leaseToken = randomToken(), leaseHash = await sha256(leaseToken);
  const result = await db.prepare(`UPDATE test_account_outbox SET state='claimed',lease_hash=?,lease_expires_at=datetime('now','+15 minutes'),attempts=attempts+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND state='pending' AND expires_at>CURRENT_TIMESTAMP AND attempts<5 AND ${actor.guard}
    AND EXISTS(SELECT 1 FROM test_account_activations a JOIN test_accounts t ON t.id=a.account_id JOIN users u ON u.email=t.user_email JOIN beta_requests b ON b.id=t.source_application_id WHERE a.outbox_id=test_account_outbox.id AND a.token_hash IS NOT NULL AND a.expires_at>CURRENT_TIMESTAMP AND t.status='pending' AND u.status='active' AND b.status!='withdrawn' AND b.expires_at>CURRENT_TIMESTAMP)` ).bind(leaseHash, id, ...actor.values).run();
  if (!result.meta.changes) throw new TestAccountError(409, "Bu teslimat başka bir işlemde veya yeniden inceleme gerektiriyor.");
  const row = await db.prepare(`SELECT o.account_id,o.recipient_email,o.token_nonce,t.user_email,a.token_hash FROM test_account_outbox o JOIN test_accounts t ON t.id=o.account_id JOIN test_account_activations a ON a.outbox_id=o.id JOIN users u ON u.email=t.user_email JOIN beta_requests b ON b.id=t.source_application_id WHERE o.id=? AND o.lease_hash=? AND o.state='claimed' AND a.token_hash IS NOT NULL AND a.expires_at>CURRENT_TIMESTAMP AND t.status='pending' AND u.status='active' AND b.status!='withdrawn' AND b.expires_at>CURRENT_TIMESTAMP`).bind(id, leaseHash).first<{ account_id: string; recipient_email: string; token_nonce: string; user_email: string; token_hash: string }>();
  if (!row) throw new TestAccountError(409, "Teslimat durumu değişti.");
  const token = await activationToken(id, row.token_nonce, row.account_id);
  if (await sha256(token) !== row.token_hash) throw new TestAccountError(503, "Etkinleştirme anahtarı değişmiş; teslimat yönetim incelemesi gerektiriyor.");
  return { id, leaseToken, to: row.recipient_email, subject: "Kampira test hesabın: etkinleştirme ve giriş", text: `Merhaba,\n\nKampira test başvurun için hesabın hazırlandı.\n\nGiriş e-postan: ${row.user_email}\nParolanı belirlemek ve hesabını etkinleştirmek için:\nhttps://kampira.net/beta/etkinlestir#${token}\n\nBağlantı tek kullanımlıktır ve üç gün içinde geçerlidir. Giriş: https://kampira.net/\n\nAndroid testine başvurduysan Google Play erişimi ayrıca açılır; bu mesaj mağaza erişiminin açıldığı anlamına gelmez.\nGörüş ve sorunların: https://kampira.net/geri-bildirim\nBu başvuruyu sen yapmadıysan bağlantıyı kullanma; destek@kampira.net üzerinden haber verebilirsin.\n\nKampira` };
}
export async function acknowledgeTestAccountMail(db: D1Database, input: Record<string, unknown>, actor: BetaReviewer) {
  const id = idValue(input.id), outcome = input.outcome;
  if (typeof input.leaseToken !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(input.leaseToken) || (outcome !== "sent" && outcome !== "unknown")) throw new TestAccountError(422, "Teslimat sonucu geçerli değil.");
  const messageId = typeof input.providerMessageId === "string" && /^[A-Za-z0-9@._:<>=-]{1,200}$/.test(input.providerMessageId) ? input.providerMessageId : null;
  if (outcome === "sent" && !messageId) throw new TestAccountError(422, "Gönderilen mesajın sağlayıcı kimliği gerekli.");
  const result = await db.prepare(`UPDATE test_account_outbox SET state=?,provider_message_id=?,sent_at=CASE WHEN ?='sent' THEN CURRENT_TIMESTAMP ELSE sent_at END,lease_hash=NULL,lease_expires_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=? AND state='claimed' AND lease_hash=? AND lease_expires_at>CURRENT_TIMESTAMP AND ${actor.guard}`)
    .bind(outcome, messageId, outcome, id, await sha256(input.leaseToken), ...actor.values).run();
  if (!result.meta.changes) throw new TestAccountError(409, "Teslimat kilidi değişti; göndermeden önce kuyruk durumunu doğrula.");
  return { id, state: outcome };
}

/** Only an owner/admin who checked the provider may resolve an uncertain delivery. */
export async function resolveTestAccountMail(db: D1Database, input: Record<string, unknown>, actor: BetaReviewer) {
  if (actor.automated) throw new TestAccountError(403, "Belirsiz teslimat yönetim panelinden doğrulanmalı.");
  const id = idValue(input.id), resolution = input.resolution;
  if (input.providerChecked !== true || (resolution !== "sent" && resolution !== "not_sent")) throw new TestAccountError(422, "Önce sağlayıcıdaki gönderim kaydını doğrula.");
  const messageId = typeof input.providerMessageId === "string" && /^[A-Za-z0-9@._:<>=-]{1,200}$/.test(input.providerMessageId) ? input.providerMessageId : null;
  if (resolution === "sent" && !messageId) throw new TestAccountError(422, "Gönderilen mesajın sağlayıcı kimliği gerekli.");
  const state = resolution === "sent" ? "sent" : "pending";
  const result = await db.batch([
    db.prepare(`UPDATE test_account_outbox SET state=?,provider_message_id=?,sent_at=CASE WHEN ?='sent' THEN CURRENT_TIMESTAMP ELSE sent_at END,lease_hash=NULL,lease_expires_at=NULL,updated_at=CURRENT_TIMESTAMP
      WHERE id=? AND state='unknown' AND ${actor.guard} AND (?='sent' OR (attempts<5 AND expires_at>CURRENT_TIMESTAMP AND EXISTS(SELECT 1 FROM test_account_activations a JOIN test_accounts t ON t.id=a.account_id JOIN users u ON u.email=t.user_email WHERE a.outbox_id=test_account_outbox.id AND a.token_hash IS NOT NULL AND a.expires_at>CURRENT_TIMESTAMP AND t.status='pending' AND u.status='active')))`)
      .bind(state, messageId, state, id, ...actor.values, state),
    db.prepare("INSERT INTO staff_audit_logs(id,staff_id,action,entity_type,entity_id,detail) SELECT ?,?,'test-account.mail-resolved','test-account-mail',?,? WHERE changes()>0").bind(crypto.randomUUID(), actor.staffId, id, JSON.stringify({ resolution })),
  ]);
  if (!result[0].meta.changes) throw new TestAccountError(409, "Teslimat veya yönetim erişimi değişti; listeyi yenile.");
  return { id, state };
}
