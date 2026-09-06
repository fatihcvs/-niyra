import { createECDH, createPrivateKey } from "node:crypto";

export type PushConfig = {
  web: { subject: string; publicKey: string; privateKey: string } | null;
  fcm: { projectId: string; clientEmail: string; privateKey: string } | null;
};

const text = (value: unknown) => typeof value === "string" ? value.trim() : "";

/** No credentials are generated implicitly; incomplete configuration is unavailable. */
export function getPushConfig(env: Record<string, unknown>): PushConfig {
  const subject = text(env.PUSH_VAPID_SUBJECT);
  const publicKey = text(env.PUSH_VAPID_PUBLIC_KEY);
  const privateKey = text(env.PUSH_VAPID_PRIVATE_KEY);
  let subjectValid = false;
  try { const parsed = new URL(subject); subjectValid = parsed.protocol === "https:" || (parsed.protocol === "mailto:" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(parsed.pathname)); } catch { /* Unconfigured. */ }
  let web: PushConfig["web"] = null;
  try {
    const curve = createECDH("prime256v1");
    curve.setPrivateKey(Buffer.from(privateKey, "base64url"));
    if (subjectValid && /^[A-Za-z0-9_-]{87}$/.test(publicKey) && /^[A-Za-z0-9_-]{43}$/.test(privateKey)
      && curve.getPublicKey().toString("base64url") === publicKey) web = { subject, publicKey, privateKey };
  } catch { /* Malformed or mismatched VAPID keys fail closed. */ }
  const projectId = text(env.FCM_PROJECT_ID);
  const clientEmail = text(env.FCM_CLIENT_EMAIL);
  const fcmPrivateKey = text(env.FCM_PRIVATE_KEY).replace(/\\n/g, "\n");
  let fcm: PushConfig["fcm"] = null;
  if (/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(projectId)
    && /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.iam\.gserviceaccount\.com$/.test(clientEmail)
    && /^-----BEGIN PRIVATE KEY-----\n[\s\S]+\n-----END PRIVATE KEY-----$/.test(fcmPrivateKey)
  ) {
    try {
      const key = createPrivateKey(fcmPrivateKey);
      if (key.asymmetricKeyType === "rsa" && (key.asymmetricKeyDetails?.modulusLength ?? 0) >= 2048) fcm = { projectId, clientEmail, privateKey: fcmPrivateKey };
    } catch { /* No usable service-account signing key. */ }
  }
  return { web, fcm };
}
