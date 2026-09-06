import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import ts from "typescript";
import { pathToFileURL } from "node:url";

const root = path.resolve(import.meta.dirname, "../..");
const semanticSource = ts.createSourceFile("semantics.ts", readFileSync(path.join(root, "lib/icon-semantics.ts"), "utf8"), ts.ScriptTarget.Latest, true);
const meanings = {};
function readMeanings(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(semanticSource) === "phosphorMeanings") {
    let object = node.initializer;
    if (ts.isAsExpression(object)) object = object.expression;
    for (const property of object.properties) meanings[property.name.getText(semanticSource)] = property.initializer.text;
  }
  ts.forEachChild(node, readMeanings);
}
readMeanings(semanticSource);
const iconSource = ts.createSourceFile("ui-icon.tsx", readFileSync(path.join(root, "app/ui-icon.tsx"), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const uiGlyphs = {};
function readUiGlyphs(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(iconSource) === "icons" && ts.isObjectLiteralExpression(node.initializer)) {
    for (const property of node.initializer.properties) uiGlyphs[property.name.getText(iconSource)] = property.initializer.getText(iconSource);
  }
  ts.forEachChild(node, readUiGlyphs);
}
readUiGlyphs(iconSource);
function attribute(node, name) {
  const attr = node.attributes.properties.find((item) => ts.isJsxAttribute(item) && item.name.getText() === name);
  if (!attr) return null;
  if (!attr.initializer) return true;
  if (ts.isStringLiteral(attr.initializer)) return attr.initializer.text;
  const expression = attr.initializer.expression;
  if (expression && (ts.isStringLiteral(expression) || ts.isNumericLiteral(expression))) return expression.text;
  return "dynamic-unresolved";
}
export function collectIconInventory() {
  const files = execFileSync("rg", ["--files", "app", "-g", "*.tsx"], { cwd: root, encoding: "utf8" }).trim().split(/\r?\n/).sort();
  const usages = [];
  const imported = new Set();
  for (const file of files) {
    const source = ts.createSourceFile(file, readFileSync(path.join(root, file), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const names = new Map();
    for (const statement of source.statements) if (ts.isImportDeclaration(statement) && statement.moduleSpecifier.text.startsWith("@phosphor-icons/react")) {
      for (const element of statement.importClause?.namedBindings?.elements ?? []) { const glyph = element.propertyName?.text ?? element.name.text; names.set(element.name.text, glyph); imported.add(glyph); }
    }
    function visit(node) {
      if (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) {
        const tag = node.tagName.getText(source);
        if (names.has(tag) || tag === "UiIcon" || /^(Icon|SectionIcon|Component)$/.test(tag)) {
          let owner = node.parent;
          while (owner && !(ts.isJsxElement(owner) && /^(button|a|IconButton|Button)$/.test(owner.openingElement.tagName.getText(source)))) owner = owner.parent;
          const glyph = names.get(tag) ?? (tag === "UiIcon" ? uiGlyphs[attribute(node, "name")] : null) ?? "dynamic-unresolved";
          usages.push({ file: file.replaceAll("\\", "/"), line: source.getLineAndCharacterOfPosition(node.getStart()).line + 1, component: tag, glyph, meaning: meanings[glyph] ?? "dynamic-unresolved", semanticName: tag === "UiIcon" ? attribute(node, "name") : null, size: attribute(node, "size") ?? "library-default", weight: attribute(node, "weight") ?? "regular-default", selected: attribute(node, "selected"), accessibleName: owner ? attribute(owner.openingElement, "aria-label") ?? attribute(owner.openingElement, "label") ?? "visible-or-dynamic-owner-text" : "context-owner-unresolved", disabled: owner ? attribute(owner.openingElement, "disabled") ?? attribute(owner.openingElement, "busy") ?? false : "context-owner-unresolved" });
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
  return { version: 1, scope: "All app/**/*.tsx Phosphor imports and direct/dynamic icon JSX; no browser/device inference", glyphs: [...imported].sort().map((glyph) => ({ glyph, meaning: meanings[glyph] ?? "unregistered" })), unresolvedPolicy: "Dynamic names, sizes and control labels remain explicitly unresolved until caller/runtime review; counts do not mean accessibility acceptance", summary: { files: files.length, importedGlyphs: imported.size, jsxUsages: usages.length, dynamicGlyphUsages: usages.filter((item) => item.glyph === "dynamic-unresolved").length, unregisteredGlyphs: [...imported].filter((name) => !meanings[name]) }, usages };
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const inventory = collectIconInventory();
  writeFileSync(path.join(root, "docs/mobile/F02_ICON_INVENTORY.json"), JSON.stringify(inventory, null, 2) + "\n");
  console.log(JSON.stringify(inventory.summary));
}
