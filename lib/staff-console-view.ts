export type StaffRecord = Record<string, unknown>;
export const staffSections = {
  owner: ["overview", "admins", "settings", "audit", "account-deletion", "updates"],
  admin: ["overview", "reports", "content", "users", "account-deletion", "decisions", "updates"],
} as const;

export function staffTabFromSearch(mode: "owner" | "admin", search: string) {
  const tab = new URLSearchParams(search).get("tab") ?? "overview";
  return (staffSections[mode] as readonly string[]).includes(tab)
    ? tab
    : "overview";
}

export function paginateRecords<T>(
  records: T[],
  requestedPage: number,
  size = 12,
) {
  const pageSize = Math.max(1, Math.floor(size) || 12);
  const pages = Math.max(1, Math.ceil(records.length / pageSize));
  const page = Math.max(1, Math.min(pages, Math.floor(requestedPage) || 1));
  return {
    rows: records.slice((page - 1) * pageSize, page * pageSize),
    page,
    pages,
    total: records.length,
    from: records.length ? (page - 1) * pageSize + 1 : 0,
    to: Math.min(page * pageSize, records.length),
  };
}

export function staffStatus(value: unknown) {
  const labels: Record<string, string> = {
    active: "Aktif",
    disabled: "Devre dışı",
    suspended: "Askıda",
    open: "İncelemede",
    appealed: "İtiraz",
    resolved: "Sonuçlandı",
    hidden: "Gizli",
    published: "Yayında",
    processing: "İşleniyor",
    rejected: "Reddedildi",
    archived: "Arşivde",
    deleted: "Silindi",
    reserved: "Rezerve",
    sold: "Satıldı",
    closed: "Kapalı",
  };
  const key = String(value ?? "");
  return Object.hasOwn(labels, key) ? labels[key] : key || "Belirtilmedi";
}

export function staffEntity(value: unknown) {
  const labels: Record<string, string> = {
    post: "Gönderi",
    comment: "Yorum",
    note: "Not",
    "note-comment": "Not yorumu",
    community: "Topluluk",
    "community-event": "Topluluk etkinliği",
    pulse: "Kampüs Anlık",
    listing: "İlan",
    place: "Mekân",
    "housing-message": "Yurt deneyimi",
    event: "Etkinlik",
    price: "Fiyat",
    "direct-message": "Özel mesaj",
    user: "Kullanıcı",
    "account-deletion-request": "Hesap silme talebi",
    meetup: "Buluşma isteği",
    staff: "Yönetici",
    platform: "Platform",
    report: "Şikâyet",
  };
  const key = String(value ?? "platform");
  return Object.hasOwn(labels, key) ? labels[key] : key;
}

export function reportReason(value: unknown) {
  const labels: Record<string, string> = {
    spam: "Spam",
    harassment: "Taciz / zorbalık",
    privacy: "Gizlilik ihlali",
    copyright: "Telif hakkı",
    misinformation: "Yanlış bilgi",
    other: "Diğer",
  };
  const key = String(value ?? "other");
  return Object.hasOwn(labels, key) ? labels[key] : key;
}

export function auditAction(value: unknown) {
  const key = String(value ?? "");
  const labels: Record<string, string> = {
    "staff.admin_created": "Admin oluşturuldu",
    "staff.admin_active": "Admin etkinleştirildi",
    "staff.admin_disabled": "Admin devre dışı bırakıldı",
    "staff.admin_password_reset": "Admin parolası sıfırlandı",
    "staff.password_changed": "Parola değiştirildi",
    "staff.owner_bootstrapped": "Owner hesabı kuruldu",
    "staff.login": "Yönetim girişi",
    "staff.logout": "Yönetim çıkışı",
    "platform.settings_updated": "Platform ayarları güncellendi",
    "moderation.report_resolved": "Şikâyet sonuçlandırıldı",
    "moderation.content_hide": "İçerik gizlendi",
    "moderation.content_restore": "İçerik geri getirildi",
    "user.suspended": "Hesap askıya alındı",
    "user.active": "Hesap yeniden açıldı",
    "account.deletion_review_started": "Hesap silme talebi incelemeye alındı",
  };
  return Object.hasOwn(labels, key) ? labels[key] : key;
}

export function auditDetails(value: unknown): StaffRecord {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : {};
  } catch {
    return {};
  }
}

export function staffTimestamp(value: unknown) {
  const text = String(value ?? "");
  return Date.parse(
    /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(text)
      ? text.replace(" ", "T") + "Z"
      : text,
  );
}

export function sevenDayActivity(rows: StaffRecord[], generatedAt: unknown) {
  const parsed = staffTimestamp(generatedAt);
  const end = new Date(Number.isFinite(parsed) ? parsed : Date.now());
  end.setUTCHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(end.getTime() - (6 - index) * 86400000)
      .toISOString()
      .slice(0, 10);
    const row = rows.find((item) => item.day === day);
    return {
      day,
      accounts: Math.max(0, Number(row?.accounts ?? 0) || 0),
      content: Math.max(0, Number(row?.content ?? 0) || 0),
      reports: Math.max(0, Number(row?.reports ?? 0) || 0),
    };
  });
}

export function auditCsv(rows: StaffRecord[]) {
  const cell = (value: unknown) => {
    let text = String(value ?? "");
    // Spreadsheet applications must treat untrusted names/reasons as text.
    if (/^[\s]*[=+@-]/u.test(text) || /^[\t\r\n]/u.test(text))
      text = "'" + text;
    return `"${text.replace(/"/g, '""')}"`;
  };
  const values = rows.map((row) => {
    const details = auditDetails(row.detail);
    return [
      row.created_at,
      auditAction(row.action),
      row.actor_name ?? row.actor_username ?? "Sistem",
      staffEntity(row.entity_type),
      row.entity_id,
      details.reason ?? details.decision ?? "",
    ];
  });
  return (
    "\uFEFF" +
    [["Tarih", "İşlem", "Yetkili", "Alan", "Kayıt", "Gerekçe"], ...values]
      .map((row) => row.map(cell).join(","))
      .join("\r\n")
  );
}
