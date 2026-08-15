// Imports TypeScript sources directly, so this file needs Node's built-in type
// stripping (unflagged since Node 22.18). package.json still allows 22.13; bump
// the engines floor if the suite has to run on an older runtime.
import assert from "node:assert/strict";
import test from "node:test";
import { REQUIRE_CAMPUS_EMAIL, isCampusEmail } from "../lib/campus-access.ts";
import { createHandle, publicDisplayName } from "../lib/user-identity.ts";

test("campus membership follows the mail domain, not the sign-in provider", () => {
  assert.equal(isCampusEmail("ogrenci@omu.edu.tr"), true);
  assert.equal(isCampusEmail("ogrenci@student.omu.edu.tr"), true, "alt alan adı kampüs sayılır");
  assert.equal(isCampusEmail("OGRENCI@OMU.EDU.TR"), true, "alan adı büyük/küçük harf duyarsız");

  assert.equal(isCampusEmail("ogrenci@gmail.com"), false);
  assert.equal(isCampusEmail("omu.edu.tr@evil.com"), false, "kampüs alan adı yerel kısımda geçerli değil");
  assert.equal(isCampusEmail("ogrenci@notomu.edu.tr"), false, "son ek benzerliği kampüs sayılmaz");
  assert.equal(isCampusEmail("ogrenci@omu.edu.tr.evil.com"), false);
  assert.equal(isCampusEmail("kimliksiz"), false);
  assert.equal(isCampusEmail(""), false);
});

test("closed pilot gate stays documented and explicit", () => {
  // Faz 7'ye kadar kapı kapalı: doğrulanmamış hesap profil oluşturabilir ama
  // "doğrulanmış öğrenci" sayılmaz. Bu değer değiştiğinde bilinçli değişsin.
  assert.equal(typeof REQUIRE_CAMPUS_EMAIL, "boolean");
});

test("public display name never exposes the verified email address", () => {
  assert.equal(
    publicDisplayName({ email: "ahmet.yilmaz@omu.edu.tr", fullName: null }),
    "ahmet.yilmaz",
  );
  assert.doesNotMatch(
    publicDisplayName({ email: "ahmet.yilmaz@gmail.com", fullName: null }),
    /@/,
    "ad claim'i yokken e-posta adresi herkese açık ad olarak kullanılamaz",
  );
  assert.equal(
    publicDisplayName({ email: "ahmet@omu.edu.tr", fullName: "Ahmet Yılmaz" }),
    "Ahmet Yılmaz",
  );
  assert.equal(
    publicDisplayName({ email: "ahmet@omu.edu.tr", fullName: "   " }),
    "ahmet",
    "boş ad claim'i yedek adı devreye alır",
  );
});

test("handle keeps ASCII letters that Turkish lowercasing would drop", () => {
  assert.equal(createHandle("IREM@omu.edu.tr"), "irem");
  assert.equal(createHandle("ahmet.yilmaz@omu.edu.tr"), "ahmet.yilmaz");
  assert.equal(createHandle("@omu.edu.tr"), "ogrenci", "boş yerel kısım yedek handle alır");
});
