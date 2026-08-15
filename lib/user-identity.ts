/** Identity fields that every server route receives from the verified session. */
export type VerifiedIdentity = {
  email: string;
  fullName: string | null;
};

/**
 * Public handle derived from the email local part. ASCII lowercase is
 * intentional: Turkish locale lowercasing maps "I" to "ı", which the allowed
 * character filter then drops ("IREM" would become "rem").
 */
export function createHandle(email: string): string {
  // `>= 0` matters: for a local-part-less address the prefix must be empty so
  // the fallback handle wins, never the mail domain.
  const separator = email.lastIndexOf("@");
  const prefix = separator >= 0 ? email.slice(0, separator) : email;
  const handle = prefix.toLowerCase().replace(/[^a-z0-9._]/g, "");
  return handle || "ogrenci";
}

/**
 * Name other students see. The verified email address is never published:
 * without a full-name claim we fall back to the handle, which carries no
 * deliverable address.
 */
export function publicDisplayName(identity: VerifiedIdentity): string {
  return identity.fullName?.trim() || createHandle(identity.email);
}

export function initialsOf(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase("tr-TR") ?? "")
    .join("") || "Ü";
}

/** Turkish relative timestamp for SQLite `CURRENT_TIMESTAMP` values (UTC). */
export function relativeTime(createdAt: string): string {
  const created = new Date(createdAt.replace(" ", "T") + (createdAt.includes("Z") ? "" : "Z"));
  const minutes = Math.max(0, Math.floor((Date.now() - created.getTime()) / 60_000));
  if (minutes < 1) return "şimdi";
  if (minutes < 60) return `${minutes} dk`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} sa`;
  return `${Math.floor(hours / 24)} gün`;
}
