export const PLATFORM_SETTING_DEFAULTS = {
  registrationOpen: true,
  noteUploadsOpen: true,
  communityCreationOpen: true,
  housingContributionsOpen: true,
  maintenanceMode: false,
  maintenanceMessage: "Üniyra üzerinde planlı bir bakım çalışması yürütülüyor.",
} as const;

export type PlatformSettingKey = keyof typeof PLATFORM_SETTING_DEFAULTS;
export type PlatformSettings = {
  registrationOpen: boolean;
  noteUploadsOpen: boolean;
  communityCreationOpen: boolean;
  housingContributionsOpen: boolean;
  maintenanceMode: boolean;
  maintenanceMessage: string;
};

export async function getPlatformSettings(db: D1Database): Promise<PlatformSettings> {
  const keys = Object.keys(PLATFORM_SETTING_DEFAULTS);
  const rows = await db.prepare(
    `SELECT key, value_json FROM platform_settings WHERE key IN (${keys.map(() => "?").join(", ")})`,
  ).bind(...keys).all<{ key: string; value_json: string }>();
  const settings: PlatformSettings = { ...PLATFORM_SETTING_DEFAULTS };
  for (const row of rows.results) {
    if (!(row.key in settings)) continue;
    try {
      const value = JSON.parse(row.value_json) as unknown;
      if (row.key === "maintenanceMessage" && typeof value === "string") settings.maintenanceMessage = value.slice(0, 240);
      if (row.key !== "maintenanceMessage" && typeof value === "boolean") {
        (settings as unknown as Record<string, unknown>)[row.key] = value;
      }
    } catch {
      // Invalid legacy settings fall back to safe defaults.
    }
  }
  return settings;
}

export async function getBooleanPlatformSetting(db: D1Database, key: Exclude<PlatformSettingKey, "maintenanceMessage">) {
  const row = await db.prepare(`SELECT value_json FROM platform_settings WHERE key = ? LIMIT 1`).bind(key).first<{ value_json: string }>();
  if (!row) return PLATFORM_SETTING_DEFAULTS[key];
  try {
    const value = JSON.parse(row.value_json) as unknown;
    return typeof value === "boolean" ? value : PLATFORM_SETTING_DEFAULTS[key];
  } catch {
    return PLATFORM_SETTING_DEFAULTS[key];
  }
}

export async function savePlatformSettings(db: D1Database, staffId: string, input: Partial<PlatformSettings>) {
  const statements: D1PreparedStatement[] = [];
  for (const key of Object.keys(PLATFORM_SETTING_DEFAULTS) as PlatformSettingKey[]) {
    if (!(key in input)) continue;
    const value = input[key];
    const normalized = key === "maintenanceMessage"
      ? (typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, 240) : PLATFORM_SETTING_DEFAULTS.maintenanceMessage)
      : Boolean(value);
    statements.push(db.prepare(
      `INSERT INTO platform_settings (key, value_json, updated_by_staff_id)
       VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json,
         updated_by_staff_id = excluded.updated_by_staff_id, updated_at = CURRENT_TIMESTAMP`,
    ).bind(key, JSON.stringify(normalized), staffId));
  }
  if (statements.length) await db.batch(statements);
  return getPlatformSettings(db);
}
