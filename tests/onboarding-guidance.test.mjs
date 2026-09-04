import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [pageSource, cssSource] = await Promise.all([
  readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
]);

test("registration explains every missing field and focuses the first one", () => {
  for (const message of [
    "Adını ve soyadını en az 2 karakterle yaz.",
    "Geçerli bir e-posta adresi yaz.",
    "En az 10 karakterli bir parola oluştur.",
    "Parolanı aynı şekilde tekrar yaz.",
  ]) assert.match(pageSource, new RegExp(message.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

  assert.match(pageSource, /id="auth-requirements" role="status" aria-live="polite"/);
  assert.match(pageSource, /querySelector<HTMLInputElement>\(`\[name="\$\{authRequirements\[0\]\.field\}"\]`\)\?\.focus\(\)/);
  assert.match(pageSource, /aria-invalid=\{attempted && !emailIsValid\}/);
  assert.match(cssSource, /\.auth-form input\[aria-invalid="true"\]/);
});

test("academic setup names the exact missing selection and keeps continue actionable", () => {
  for (const message of [
    "Fakülte, yüksekokul veya akademik birimini listeden seç.",
    "Akademik biriminin adını en az 2 karakterle yaz.",
    "Bölüm veya programını listeden seç.",
    "Bölüm veya program adını en az 2 karakterle yaz.",
    "ders daha seç veya ders kodu ve adıyla ekle.",
    "Görünen adını en az 2 karakterle yaz.",
  ]) assert.ok(pageSource.includes(message), `missing onboarding guidance: ${message}`);

  assert.match(pageSource, /const nextDisabled = saving \|\| \(step === 2 && catalogLoading\);/);
  assert.match(pageSource, /function focusMissingOnboardingField\(\)/);
  assert.match(pageSource, /onClick=\{continueOnboarding\}/);
  assert.match(pageSource, /id="onboarding-requirement" role="status" aria-live="polite"/);
  assert.match(pageSource, /aria-describedby=\{stepRequirement \? "onboarding-requirement" : undefined\}/);
  assert.match(cssSource, /\.onboarding-requirement \{/);
  assert.match(cssSource, /\.course-count\.needs-selection small/);
});
