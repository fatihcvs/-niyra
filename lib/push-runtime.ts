import { getPushConfig } from "./push-config";
import { dispatchPushOutbox } from "./push-delivery";

type PushEnvironment = Record<string, unknown> & { DB: D1Database };
const running = new WeakMap<D1Database, Promise<unknown>>();

/** Coalesce request bursts locally; database leases coordinate separate workers. */
export function runPushDispatch(env: PushEnvironment, limit = 2): Promise<unknown> {
  const config = getPushConfig(env);
  if (!config.web && !config.fcm) return Promise.resolve({ disabled: 1 });
  const pending = running.get(env.DB);
  if (pending) return pending;
  const task = dispatchPushOutbox(env.DB, config, { limit, concurrency: Math.min(4, limit) })
    .finally(() => { if (running.get(env.DB) === task) running.delete(env.DB); });
  running.set(env.DB, task);
  return task;
}

export async function pushDispatchAuthorized(request: Request, secret: unknown) {
  if (typeof secret !== "string" || !/^[A-Za-z0-9_-]{32,128}$/.test(secret)) return false;
  const supplied = request.headers.get("authorization") ?? "";
  if (!/^Bearer [A-Za-z0-9_-]{32,128}$/.test(supplied)) return false;
  const digest = async (value: string) => new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  const [expectedHash, actualHash] = await Promise.all([digest(`Bearer ${secret}`), digest(supplied)]);
  let difference = 0;
  for (let index = 0; index < expectedHash.length; index++) difference |= expectedHash[index] ^ actualHash[index];
  return difference === 0;
}

/** Never log provider bodies, credentials, device identifiers, or recipient data. */
export function reportPushDispatchFailure() { console.error("Push dispatch unavailable; queued deliveries will retry."); }
