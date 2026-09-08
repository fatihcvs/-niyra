export const BETA_STATUS = {
  new: "Talep alındı", needs_info: "Ek bilgi bekleniyor", ready: "Test erişimi için sırada",
  invited: "Test erişimi hazır", testing: "Teste katıldığını bildirdin", completed: "Test tamamlandı",
  declined: "Başvuru kapatıldı", withdrawn: "Başvurudan ayrıldın", triaged: "İncelendi",
  in_progress: "Üzerinde çalışılıyor", resolved: "Çözüldü",
} as const;
export type BetaStatus = keyof typeof BETA_STATUS;
export const BETA_CATEGORIES = { bug: "Hata bildirimi", suggestion: "Öneri", support: "Yardım istiyorum" } as const;
export type BetaMessage = { id: string; authorKind: "applicant" | "staff" | "automation"; content: string; createdAt: string };
export type BetaRequest = {
  id: string; kind: "application" | "feedback"; email: string; displayName: string; university: string;
  platform: "web" | "android" | "both";
  deviceModel: string; androidVersion: string; category: string; subject: string; message: string;
  status: BetaStatus; priority: "normal" | "high" | "urgent"; internalNote: string; playUrl: string;
  revision: number; createdAt: string; updatedAt: string; expiresAt: string;
  adultConfirmed: number; androidConfirmed: number; participationConfirmed: number;
};
