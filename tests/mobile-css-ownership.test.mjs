import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import postcss from "postcss";

const tooling = createRequire(new URL("../scripts/mobile-quality/package.json", import.meta.url));
const { JSDOM } = tooling("jsdom");
const layout = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");
const files = [...layout.matchAll(/import "\.\/(.+\.css)"/g)].map((match) => match[1]);
// workspace-ui is imported by globals before the remaining layout stylesheets.
const ordered = ["workspace-ui.css", ...files];
const sheets = new Map(ordered.map((file) => [file, postcss.parse(readFileSync(new URL(`../app/${file}`, import.meta.url), "utf8"), { from: file })]));

// These are declaration/selector contracts, not a CSS layout engine or device proof.
function enabled(node, width, reduced = false) {
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (parent.type !== "atrule") continue;
    if (parent.name.endsWith("keyframes")) return false;
    if (parent.name !== "media") continue;
    const min = parent.params.match(/min-width:\s*(\d+)px/);
    const max = parent.params.match(/max-width:\s*(\d+)px/);
    if (min && width < Number(min[1])) return false;
    if (max && width > Number(max[1])) return false;
    if (/prefers-reduced-motion:\s*reduce\b/.test(parent.params) && !reduced) return false;
    if (/prefers-reduced-motion:\s*no-preference/.test(parent.params) && reduced) return false;
  }
  return true;
}

function rules(file, selector, width = 390, reduced = false) {
  const result = [];
  sheets.get(file).walkRules((rule) => {
    if (rule.selectors.includes(selector) && enabled(rule, width, reduced)) result.push(rule);
  });
  return result;
}

function value(file, selector, property, width = 390, reduced = false) {
  let winner;
  for (const rule of rules(file, selector, width, reduced)) {
    rule.walkDecls(property, (declaration) => {
      if (!winner?.important || declaration.important) winner = declaration;
    });
  }
  return winner?.value;
}

test("all imported styles parse and mobile shell geometry has one owner", () => {
  assert.ok(files.indexOf("mobile-app.css") < files.indexOf("visual-polish.css"));
  assert.ok(files.indexOf("visual-polish.css") < files.indexOf("interaction-motion.css"));
  assert.match(readFileSync(new URL("../app/globals.css", import.meta.url), "utf8"), /@import "\.\/workspace-ui\.css"/);
  const geometry = /^(?:display|position|inset|top|right|bottom|left|z-index|width|height|min-width|min-height|max-width|max-height|padding(?:-.+)?|margin(?:-.+)?|gap|grid-template-columns)$/;
  for (const [file, sheet] of sheets) {
    if (file === "mobile-app.css") continue;
    sheet.walkRules((rule) => {
      // Press/selection animation selectors may mention NavItem; they do not own its box.
      if (!/\.app-mobile-(?:nav|header)(?:[-\s.:>,]|$)/.test(rule.selector)) return;
      rule.walkDecls((declaration) => assert.ok(!geometry.test(declaration.prop), `${file}: ${rule.selector} must not redefine ${declaration.prop}`));
    });
  }
});

test("320, 390, 767, 768 and 780 use the mobile shell; 781 switches it off", () => {
  for (const width of [320, 390, 767, 768, 780, 781]) {
    const mobile = width <= 780;
    assert.equal(value("mobile-app.css", ".app-mobile-header", "display", width), mobile ? "flex" : "none", `header ${width}`);
    assert.equal(value("mobile-app.css", ".app-mobile-nav", "display", width), mobile ? "grid" : "none", `nav ${width}`);
    assert.equal(value("mobile-app.css", ".app-mobile-nav-indicator", "display", width), mobile ? "grid" : "none", `indicator ${width}`);
    assert.equal(value("social-design.css", ".site-shell", "display", width), mobile ? "block" : undefined);
  }
  assert.equal(value("social-design.css", ".site-shell", "grid-template-columns", 781), "64px minmax(0,1fr)");
});

test("bottom clearance and message list reserve the same safe-area-aware nav height", () => {
  const token = value("mobile-app.css", ":root", "--app-mobile-nav-height");
  const base = Number(token.match(/^calc\((\d+)px \+ env\(safe-area-inset-bottom\)\)$/)?.[1]);
  assert.ok(Number.isFinite(base));
  assert.equal(value("mobile-app.css", ".app-mobile-nav", "height"), "var(--app-mobile-nav-height)");
  assert.equal(value("mobile-app.css", "html[data-theme] .site-shell-messages .feed-column", "padding-bottom"), "var(--app-mobile-nav-height)");
  const feed = value("mobile-app.css", "html[data-theme] .site-shell .feed-column", "padding");
  const clearance = Number(feed.match(/^0 16px calc\(var\(--app-mobile-nav-height\) \+ (\d+)px\)$/)?.[1]);
  assert.ok(clearance >= 12, "the final feed action needs clearance beyond the fixed nav");
  const padding = value("mobile-app.css", ".app-mobile-nav", "padding");
  const [, top, side, bottom] = padding.match(/^(\d+)px max\((\d+)px,env\(safe-area-inset-right\)\) calc\((\d+)px \+ env\(safe-area-inset-bottom\)\) max\(\d+px,env\(safe-area-inset-left\)\)$/);
  const minHeight = Number.parseFloat(value("mobile-app.css", ".app-mobile-nav-item", "min-height"));
  assert.ok(minHeight >= 48);
  assert.ok(base - Number(top) - Number(bottom) - 1 >= minHeight, "nav padding and border must leave room for every target");
  for (const width of [320, 390, 780]) {
    for (const inset of [0, 20, 34]) {
      assert.ok((width - 2 * Math.max(Number(side), inset)) / 5 >= 48, `${width}px width / ${inset}px horizontal insets`);
      assert.equal((base + inset + clearance) - (base + inset), clearance);
    }
  }
});

test("sticky headers share their offset and sit above feed tabs, below nav and composer", () => {
  assert.equal(value("mobile-app.css", ".app-mobile-header", "min-height"), "var(--app-mobile-header-height)");
  assert.equal(value("mobile-app.css", "html[data-theme] .feed-tabs", "top"), "var(--app-mobile-header-height)");
  assert.match(value("mobile-app.css", ":root", "--app-mobile-header-height"), /env\(safe-area-inset-top\)/);
  const header = Number(value("mobile-app.css", ".app-mobile-header", "z-index"));
  const workspace = Number(value("mobile-workspaces.css", 'html[data-theme] .workspace-header[data-mobile-header="workspace"]', "z-index"));
  const tabs = Number(value("mobile-app.css", "html[data-theme] .feed-tabs", "z-index"));
  const nav = Number(value("mobile-app.css", ".app-mobile-nav", "z-index"));
  const composer = Number(value("mobile-app.css", ".app-post-composer", "z-index"));
  assert.ok(tabs < header && header === workspace && header < nav && nav < composer);
  assert.equal(value("mobile-app.css", ".app-post-composer", "height"), "var(--app-viewport-height,100dvh)");
  assert.equal(value("mobile-app.css", ".app-post-composer", "top"), "var(--app-viewport-top,0)");
  for (const file of ordered) {
    for (const selector of [".site-shell", ".feed-column"]) {
      for (const rule of rules(file, selector)) {
        rule.walkDecls(/^(transform|translate|scale|filter|perspective|contain)$/, (declaration) => {
          assert.equal(declaration.value, "none", `${file}: ${selector} must not establish a moving/fixed containing block`);
        });
      }
    }
  }
});

test("real state selectors hide the nav only for active overlays, chat threads or keyboard", () => {
  const dom = new JSDOM('<html data-theme="dark"><body><main class="site-shell"><section class="feed-column"><section id="content"></section></section><nav class="app-mobile-nav"></nav></main></body></html>');
  try {
    const document = dom.window.document;
    const nav = document.querySelector("nav");
    const content = document.querySelector("#content");
    const selectors = [];
    sheets.get("mobile-app.css").walkRules((rule) => {
      if (!enabled(rule, 390) || !rule.nodes.some((node) => node.prop === "display" && node.value === "none")) return;
      for (const selector of rule.selectors) if (selector.includes(".app-mobile-nav") && selector !== ".app-mobile-nav" && selector !== ".app-mobile-nav-indicator") selectors.push(selector);
    });
    const hidden = () => selectors.some((selector) => nav.matches(selector));
    assert.equal(hidden(), false);
    for (const attribute of ["data-mobile-overlay", "data-message-thread"]) {
      content.setAttribute(attribute, "false");
      assert.equal(hidden(), false);
      content.setAttribute(attribute, "true");
      assert.equal(hidden(), true, attribute);
      content.removeAttribute(attribute);
      assert.equal(hidden(), false);
    }
    document.documentElement.dataset.keyboardOpen = "true";
    assert.equal(hidden(), true);
    delete document.documentElement.dataset.keyboardOpen;
    assert.equal(hidden(), false);
  } finally { dom.window.close(); }
  assert.equal(value("mobile-app.css", 'html[data-theme] .site-shell-messages:has([data-message-thread="true"]) .feed-column', "padding-bottom"), "0");
  assert.equal(value("mobile-app.css", ".app-mobile-nav-indicator", "pointer-events"), "none");
});

test("both app and OS reduced-motion stop repeating animations and root smooth scrolling", () => {
  for (const [appReduced, osReduced] of [[false, false], [true, false], [false, true], [true, true]]) {
    const declarations = ['.spinner{animation-iteration-count:infinite;animation-duration:1s;transition-duration:1s}'];
    // Extract only motion rules so JSDOM need not emulate the site's grid, env() or layout.
    for (const sheet of sheets.values()) sheet.walkRules((rule) => {
      if (!enabled(rule, 390, osReduced)) return;
      const props = rule.nodes.filter((node) => node.type === "decl" && /^(scroll-behavior|animation-iteration-count|animation-duration|transition-duration)$/.test(node.prop));
      if (props.length) declarations.push(`${rule.selector}{${props.map((node) => node.toString()).join(";")}}`);
    });
    const dom = new JSDOM(`<html data-theme="dark" data-reduce-motion="${appReduced}"><head><style>${declarations.join("\n")}</style></head><body><i class="spinner"></i></body></html>`);
    try {
      const get = (selector) => dom.window.getComputedStyle(dom.window.document.querySelector(selector));
      const reduced = appReduced || osReduced;
      assert.equal(get("html").scrollBehavior, reduced ? "auto" : "smooth");
      assert.equal(get(".spinner").animationIterationCount, reduced ? "1" : "infinite");
      assert.equal(get(".spinner").animationDuration, reduced ? ".01ms" : "1s");
      assert.equal(get(".spinner").transitionDuration, reduced ? ".01ms" : "1s");
    } finally { dom.window.close(); }
  }
});
