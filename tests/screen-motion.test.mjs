import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const source = ts.transpileModule(readFileSync(new URL("../app/use-screen-motion.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

// Commit dependency changes and effect cleanups in React's order. Animation
// handles are controlled so rapid navigation can be tested without real timers.
function fixture({ appReducedMotion = false, systemReducedMotion = false } = {}) {
  const events = [];
  const animations = [];
  const hooks = [];
  const pendingEffects = [];
  const queries = [];
  let cursor = 0;
  let columnPresent = true;
  const preferences = { systemReducedMotion };

  class Element {
    constructor(name, classes = [], { animationSupported = true } = {}) {
      this.name = name;
      this.children = [];
      this.classList = { contains: (value) => classes.includes(value) };
      if (animationSupported) this.animate = (keyframes, options) => {
        const animation = {
          element: this, keyframes, options, cancelCount: 0,
          cancel() { this.cancelCount += 1; events.push(`cancel:${name}`); },
        };
        animations.push(animation);
        events.push(`animate:${name}`);
        return animation;
      };
    }
  }

  const header = new Element("mobile-header", ["app-mobile-header"]);
  const content = new Element("content");
  const contentChild = new Element("content-child");
  content.children = [contentChild];
  const column = new Element("column", ["feed-column"]);
  column.children = [header, content];
  const navigation = new Element("bottom-navigation", ["app-mobile-nav"]);
  const overlay = new Element("composer", ["app-post-composer"]);
  const shell = new Element("shell", ["site-shell"]);
  shell.children = [column, navigation, overlay];
  const document = {
    documentElement: { dataset: { reduceMotion: String(appReducedMotion) } },
    querySelector(selector) {
      queries.push(selector);
      return selector === ".feed-column" ? (columnPresent ? column : null)
        : selector === ".site-shell" ? shell : null;
    },
  };
  const react = {
    useRef(initial) {
      const slot = cursor++;
      if (!hooks[slot]) hooks[slot] = { current: initial };
      return hooks[slot];
    },
    useLayoutEffect(setup, dependencies) {
      const slot = cursor++;
      const previous = hooks[slot];
      if (!previous || dependencies.length !== previous.dependencies.length
        || dependencies.some((value, index) => !Object.is(value, previous.dependencies[index]))) {
        pendingEffects.push({ slot, setup, dependencies });
      }
    },
  };
  const testModule = { exports: {} };
  runInNewContext(source, {
    module: testModule, exports: testModule.exports, document, HTMLElement: Element,
    window: { matchMedia: () => ({ matches: preferences.systemReducedMotion }) },
    require(specifier) { assert.equal(specifier, "react"); return react; },
  });

  return {
    animations, events, queries, header, content, contentChild, column, navigation, overlay, shell, Element,
    setAppReducedMotion(value) { document.documentElement.dataset.reduceMotion = String(value); },
    setSystemReducedMotion(value) { preferences.systemReducedMotion = value; },
    setColumnPresent(value) { columnPresent = value; },
    render(destination) {
      cursor = 0;
      pendingEffects.length = 0;
      testModule.exports.useScreenMotion(destination);
      for (const { slot, setup, dependencies } of pendingEffects) {
        hooks[slot]?.cleanup?.();
        const cleanup = setup();
        hooks[slot] = { dependencies: [...dependencies], cleanup };
      }
    },
    unmount() {
      for (const hook of hooks) {
        hook?.cleanup?.();
        if (hook) hook.cleanup = undefined;
      }
    },
  };
}

test("initial display and rerenders of the same destination do not animate or inspect the DOM", () => {
  const f = fixture();
  f.render("Akış");
  f.render("Akış");
  assert.equal(f.animations.length, 0);
  assert.deepEqual(f.queries, []);
  f.unmount();
  assert.deepEqual(f.events, []);
});

test("navigation animates content surfaces without touching fixed navigation, the header, or shell", () => {
  const f = fixture();
  const notice = new f.Element("notice");
  f.column.children.push(notice);
  f.render("Akış");
  f.render("Keşfet");

  assert.deepEqual(f.animations.map(({ element }) => element), [f.content, notice]);
  for (const stationary of [f.header, f.column, f.shell, f.navigation, f.overlay, f.contentChild]) {
    assert.ok(!f.animations.some(({ element }) => element === stationary), stationary.name);
  }
  for (const animation of f.animations) {
    assert.ok(animation.options.duration > 0, "navigation feedback should be finite motion");
    assert.ok(Number.isFinite(animation.options.duration));
    assert.ok(animation.keyframes.every((frame) => !["transform", "translate", "scale", "width", "height", "top", "left"].some((property) => property in frame)),
      "screen motion must not change fixed descendant geometry");
  }
  f.unmount();
});

test("rapid navigation cancels the previous content animation before starting the next one", () => {
  const f = fixture();
  f.render("Akış");
  f.render("Keşfet");
  const first = f.animations[0];
  const nextContent = new f.Element("next-content");
  f.column.children = [f.header, nextContent];
  f.render("Notlar");

  assert.equal(first.cancelCount, 1);
  assert.deepEqual(f.events, ["animate:content", "cancel:content", "animate:next-content"]);
  assert.equal(f.animations[1].cancelCount, 0);
  f.render("Notlar");
  assert.equal(f.animations.length, 2, "ordinary state updates must not restart the entry animation");
  assert.equal(f.animations[1].cancelCount, 0);
  f.unmount();
  assert.equal(f.animations[1].cancelCount, 1);
});

test("unmount cancels every active surface once and preserves unrelated animation handles", () => {
  const f = fixture();
  f.column.children.push(new f.Element("notice"));
  const unrelated = f.navigation.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 100 });
  f.render("Akış");
  f.render("Profil");
  const active = f.animations.filter((animation) => animation !== unrelated);
  f.unmount();
  f.unmount();
  assert.deepEqual(active.map(({ cancelCount }) => cancelCount), [1, 1]);
  assert.equal(unrelated.cancelCount, 0, "cleanup should cancel only handles owned by this hook");
});

for (const preference of ["app", "system"]) {
  test(`${preference} reduced-motion preference prevents navigation animations and does not replay skipped routes`, () => {
    const f = fixture({ appReducedMotion: preference === "app", systemReducedMotion: preference === "system" });
    f.render("Akış");
    f.render("Keşfet");
    f.render("Notlar");
    assert.equal(f.animations.length, 0);
    assert.deepEqual(f.queries, [], "reduced motion should avoid animation target work");

    f.setAppReducedMotion(false);
    f.setSystemReducedMotion(false);
    f.render("Notlar");
    assert.equal(f.animations.length, 0, "turning motion back on must not replay a finished navigation");
    f.render("Profil");
    assert.equal(f.animations.length, 1);
    f.unmount();
  });
}

test("navigation with reduced motion enabled cleans up motion started by the previous route", () => {
  const f = fixture();
  f.render("Akış");
  f.render("Keşfet");
  const previousAnimation = f.animations[0];
  f.setSystemReducedMotion(true);
  f.render("Notlar");
  assert.equal(previousAnimation.cancelCount, 1);
  assert.equal(f.animations.length, 1, "the new route must remain still");
  f.unmount();
  assert.equal(previousAnimation.cancelCount, 1);
});

test("missing content during a navigation is safe and later navigation still animates normally", () => {
  const f = fixture();
  f.render("Akış");
  f.setColumnPresent(false);
  assert.doesNotThrow(() => f.render("Keşfet"));
  assert.equal(f.animations.length, 0);
  f.setColumnPresent(true);
  f.render("Keşfet");
  assert.equal(f.animations.length, 0, "mounting delayed content must not replay the entire route");
  f.render("Notlar");
  assert.equal(f.animations.length, 1);
  f.unmount();
});

test("unsupported animation APIs and non-HTML children do not break content navigation", () => {
  const f = fixture();
  const unsupported = new f.Element("older-element", [], { animationSupported: false });
  const foreignChild = { animate() { assert.fail("non-HTML children should not be animated"); } };
  f.column.children = [f.header, unsupported, foreignChild, f.content];
  f.render("Akış");
  assert.doesNotThrow(() => f.render("Keşfet"));
  assert.deepEqual(f.animations.map(({ element }) => element), [f.content]);
  assert.doesNotThrow(() => f.unmount());
  assert.equal(f.animations[0].cancelCount, 1);
});
