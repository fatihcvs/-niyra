/** Independent public-form records expire even when no one opens the support UI. */
export async function purgeExpiredBetaRequests(db: D1Database) {
  await db.prepare("DELETE FROM beta_requests WHERE expires_at<=CURRENT_TIMESTAMP").run();
  await db.prepare("DELETE FROM rate_limit_windows WHERE (actor_email LIKE 'beta:%' OR actor_email LIKE 'beta-email:%') AND window_start<CAST(strftime('%s','now','-2 days') AS INTEGER)").run();
}
