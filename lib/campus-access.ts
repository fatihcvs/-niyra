/**
 * Campus membership rules for the Üniyra pilot.
 *
 * Sign-in with ChatGPT establishes *an identity*, not university membership.
 * Everything in this module exists to keep those two ideas apart: a student is
 * "doğrulanmış" only when the verified identity carries a campus address.
 */

/** Accepted campus mail domains. A subdomain of a listed domain also matches. */
export const CAMPUS_EMAIL_DOMAINS = ["omu.edu.tr"] as const;

/**
 * Faz 7 (kapalı üniversite pilotu) kapısı.
 *
 * `false` (varsayılan): herkes akademik profil oluşturabilir, ancak kampüs
 * e-postası olmayan hesap "doğrulanmış öğrenci" sayılmaz ve rozeti almaz.
 * `true`: yalnızca kampüs e-postasıyla giriş yapanlar profil oluşturabilir.
 *
 * Bu değeri `true` yapmadan önce mevcut pilot kullanıcılarının kampüs
 * adresiyle giriş yaptığını doğrula; aksi hâlde profillerini güncelleyemezler.
 */
export const REQUIRE_CAMPUS_EMAIL: boolean = false;

/** True when the address belongs to a campus domain (or one of its subdomains). */
export function isCampusEmail(email: string): boolean {
  const separator = email.lastIndexOf("@");
  if (separator < 0) return false;

  const domain = email.slice(separator + 1).trim().toLowerCase();
  if (!domain) return false;

  return CAMPUS_EMAIL_DOMAINS.some(
    (campusDomain) => domain === campusDomain || domain.endsWith(`.${campusDomain}`),
  );
}
