import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = async (path) => readFile(new URL(path, import.meta.url), "utf8");

test("notes has a dedicated past-exam experience with required metadata", async () => {
  const [workspace, route, schema] = await Promise.all([
    source("../app/product-features.tsx"),
    source("../app/api/notes/route.ts"),
    source("../db/schema.ts"),
  ]);
  assert.match(workspace, /Çıkmış Sorular/);
  assert.match(workspace, /name="examYear"/);
  assert.match(workspace, /name="examTerm"/);
  assert.match(workspace, /name="examKind"/);
  assert.match(route, /noteType === "cikmis-soru"/);
  assert.match(route, /Çıkmış soru için yıl, dönem ve sınav türünü seçmelisin/);
  assert.match(schema, /examYear: integer\("exam_year"\)/);
  assert.match(schema, /notes_exam_course_year_idx/);
});

test("student housing supports safe anonymous experience sharing and moderation", async () => {
  const [workspace, route, admin, registry] = await Promise.all([
    source("../app/campus-guide.tsx"),
    source("../app/api/housing/route.ts"),
    source("../app/api/admin/route.ts"),
    source("../lib/admin-registry.ts"),
  ]);
  assert.match(workspace, /Yurtlar ve konaklama/);
  assert.match(workspace, /Güvenli karar ver/);
  assert.match(workspace, /name="anonymous"/);
  assert.match(route, /category = 'housing'/);
  assert.match(route, /is_anonymous/);
  assert.match(route, /user_blocks/);
  assert.match(admin, /housing_discussions/);
  assert.match(registry, /housing-message/);
});
