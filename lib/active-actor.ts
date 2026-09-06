/** Bind the authenticated account generation, independently of a shared container's creator. */
export const ACTIVE_ACTOR_SQL = "EXISTS (SELECT 1 FROM users active_actor WHERE active_actor.email = ? AND active_actor.public_id = ? AND active_actor.status = 'active')";

export class ActiveActorError extends Error {
  constructor() { super("Hesap durumu değişti. İşlem tamamlanmadı."); this.name = "ActiveActorError"; }
}

export function activeActor(db: D1Database, email: string, publicId: string) {
  const statement = (sql: string, values: D1Value[] = []) => {
    if (!sql.includes(ACTIVE_ACTOR_SQL)) throw new Error("Missing active actor SQL fence");
    return db.prepare(sql).bind(...values, email, publicId);
  };
  const assert = async () => {
    if (!await db.prepare(`SELECT 1 AS active WHERE ${ACTIVE_ACTOR_SQL}`).bind(email, publicId).first()) throw new ActiveActorError();
  };
  return {
    statement,
    async run(sql: string, values: D1Value[] = []) { await statement(sql, values).run(); await assert(); },
    async first<T>(sql: string, values: D1Value[] = []) { const result = await statement(sql, values).first<T>(); await assert(); return result; },
    async batch(statements: D1PreparedStatement[]) { await db.batch(statements); await assert(); },
    async audit(action: string, entityType: string, entityId: string, detail: Record<string, unknown> = {}) {
      await statement(`INSERT INTO audit_logs (id, actor_email, action, entity_type, entity_id, detail)
        SELECT ?, ?, ?, ?, ?, ? WHERE ${ACTIVE_ACTOR_SQL}`,
      [crypto.randomUUID(), email, action, entityType, entityId, JSON.stringify(detail)]).run();
      await assert();
    },
    async notify(input: { userEmail: string; kind: string; title: string; body?: string; entityType?: string; entityId?: string }) {
      if (input.userEmail === email) return;
      await statement(`INSERT INTO notifications (id, user_email, actor_email, kind, title, body, entity_type, entity_id)
        SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE ${ACTIVE_ACTOR_SQL}`,
      [crypto.randomUUID(), input.userEmail, email, input.kind, input.title, input.body ?? "", input.entityType ?? null, input.entityId ?? null]).run();
      await assert();
    },
  };
}
