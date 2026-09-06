import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = ts.transpileModule(readFileSync(new URL("../app/post-media-view.tsx", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;

// Execute the real component and its public event handlers. The small hook host
// preserves state between renders without introducing a browser dependency.
function mount(props) {
  const states = [];
  let cursor = 0;
  const testModule = { exports: {} };
  runInNewContext(source, {
    module: testModule, exports: testModule.exports,
    require(specifier) {
      if (specifier !== "react") return require(specifier);
      return { useCallback(callback) { return callback; }, useState(initial) {
        const slot = cursor++;
        if (!(slot in states)) states[slot] = typeof initial === "function" ? initial() : initial;
        return [states[slot], (next) => { states[slot] = typeof next === "function" ? next(states[slot]) : next; }];
      } };
    },
  });
  return { render() { cursor = 0; return testModule.exports.PostMediaView(props); } };
}

function elements(node) {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap(elements);
  return [node, ...elements(node.props?.children)];
}

const photo = { id: "photo-1", kind: "image", url: "/api/posts/media?id=photo-1", contentType: "image/png", fileName: "kampus.png" };
const clip = { ...photo, id: "video-1", kind: "video", url: "/api/posts/media?id=video-1", contentType: "video/mp4", fileName: "kampus.mp4" };

test("post photos preserve the supplied accessible description and escape it as text", () => {
  const description = 'Kampüs bahçesi: "merhaba" & <arkadaşlar>';
  const tree = mount({ media: photo, description }).render();
  const image = elements(tree).find((node) => node.props?.src === photo.url);
  assert.equal(image.props.alt, description);
  const html = renderToStaticMarkup(tree);
  assert.match(html, /alt="Kampüs bahçesi: &quot;merhaba&quot; &amp; &lt;arkadaşlar&gt;"/);
  assert.doesNotMatch(html, /<arkadaşlar>/);
  assert.doesNotMatch(html, /post-media-fallback/);
});

for (const media of [photo, clip]) {
  test(`${media.kind} failures expose a labelled retry and recreate the same media on retry`, () => {
    const view = mount({ media, description: "Kampüsten bir paylaşım" });
    const initial = elements(view.render()).find((node) => node.props?.src === media.url);
    assert.equal(typeof initial.props.onError, "function");
    initial.props.onError();

    const failed = view.render();
    assert.ok(elements(failed).some((node) => node.props?.role === "status"));
    assert.ok(!elements(failed).some((node) => node.props?.src === media.url));
    const failedHtml = renderToStaticMarkup(failed);
    assert.match(failedHtml, media.kind === "image" ? /Görsel yüklenemedi/ : /Video yüklenemedi/);
    const retry = elements(failed).find((node) => node.type === "button" && node.props["aria-label"] === "Medyayı yeniden yükle");
    assert.ok(retry);
    assert.equal(retry.props.type, "button");
    retry.props.onClick();

    const recovered = view.render();
    const retriedMedia = elements(recovered).find((node) => node.props?.src === media.url);
    assert.ok(retriedMedia, "retry must render the original media URL again");
    assert.notEqual(retriedMedia.key, initial.key, "retry must create a new media element, not reuse the failed one");
    assert.doesNotMatch(renderToStaticMarkup(recovered), /post-media-fallback/);
    retriedMedia.props.onError();
    assert.ok(elements(view.render()).some((node) => node.props?.role === "status"), "a second failure stays recoverable");
  });
}

test("post videos retain native controls, inline playback and a descriptive accessible name", () => {
  const description = "Bahar şenliğindeki konser";
  const tree = mount({ media: clip, description }).render();
  const video = elements(tree).find((node) => node.type === "video");
  assert.ok(video);
  assert.equal(video.props["aria-label"], description);
  assert.equal(video.props.controls, true);
  assert.equal(video.props.playsInline, true);
  assert.equal(video.props.preload, "metadata");
  assert.notEqual(video.props.autoPlay, true);
  assert.match(renderToStaticMarkup(tree), /<video[^>]+aria-label="Bahar şenliğindeki konser"/);
});

test("a failed attachment does not remove another attachment in the same post", () => {
  const first = mount({ media: photo, description: "Birinci fotoğraf" });
  const secondMedia = { ...photo, id: "photo-2", url: "/api/posts/media?id=photo-2" };
  const second = mount({ media: secondMedia, description: "İkinci fotoğraf" });
  elements(first.render()).find((node) => node.props?.src === photo.url).props.onError();
  assert.ok(elements(first.render()).some((node) => node.props?.role === "status"));
  assert.ok(elements(second.render()).some((node) => node.props?.src === secondMedia.url));
  assert.doesNotMatch(renderToStaticMarkup(second.render()), /post-media-fallback/);
});

test("a cached broken image is recoverable even when its error event happened before hydration", () => {
  const view = mount({ media: photo, description: "Kampüs fotoğrafı" });
  const initial = elements(view.render()).find((node) => node.props?.src === photo.url);
  assert.equal(typeof initial.props.ref, "function");
  initial.props.ref({ complete: true, naturalWidth: 0, getAttribute: (name) => name === "src" ? photo.url : null });
  const failed = view.render();
  assert.match(renderToStaticMarkup(failed), /Görsel yüklenemedi/);
  const retry = elements(failed).find((node) => node.type === "button" && node.props["aria-label"] === "Medyayı yeniden yükle");
  retry.props.onClick();
  const recovered = elements(view.render()).find((node) => node.props?.src === photo.url);
  recovered.props.ref({ complete: true, naturalWidth: 640, getAttribute: () => photo.url });
  assert.doesNotMatch(renderToStaticMarkup(view.render()), /post-media-fallback/);
});

for (const [name, imageState] of [
  ["a successfully cached photo", { complete: true, naturalWidth: 640, getAttribute: () => photo.url }],
  ["a photo still loading", { complete: false, naturalWidth: 0, getAttribute: () => photo.url }],
  ["an element without a source", { complete: true, naturalWidth: 0, getAttribute: () => null }],
  ["a detached image ref", null],
]) {
  test(`the cached-image check does not report ${name} as broken`, () => {
    const view = mount({ media: photo, description: "Kampüs fotoğrafı" });
    const image = elements(view.render()).find((node) => node.props?.src === photo.url);
    image.props.ref(imageState);
    assert.ok(elements(view.render()).some((node) => node.props?.src === photo.url));
    assert.doesNotMatch(renderToStaticMarkup(view.render()), /post-media-fallback/);
  });
}

test("the direct loader preserves absolute authenticated media URLs and their query strings", () => {
  const url = "https://campus.test/api/posts/media?id=photo%2F1&signature=fixture%2Bonly%3D";
  const media = { ...photo, url };
  const image = elements(mount({ media, description: "Kampüs fotoğrafı" }).render()).find((node) => node.props?.src === url);
  assert.equal(typeof image.props.loader, "function");
  assert.equal(image.props.loader({ src: url, width: 320, quality: 75 }), url);
  assert.equal(image.props.loader({ src: url, width: 900, quality: 100 }), url);
  assert.equal(image.props.unoptimized, true);
});

for (const trigger of ["ref", "load"]) {
  test(`a one-pixel image detected on ${trigger} gets empty-file copy and retry clears that state`, () => {
    const view = mount({ media: photo, description: "Kampüs fotoğrafı" });
    const original = elements(view.render()).find((node) => node.props?.src === photo.url);
    const emptyImage = { complete: true, naturalWidth: 1, naturalHeight: 1, getAttribute: () => photo.url };
    if (trigger === "ref") original.props.ref(emptyImage);
    else original.props.onLoad({ currentTarget: emptyImage });
    const empty = view.render();
    const html = renderToStaticMarkup(empty);
    assert.match(html, /Görsel görüntülenemiyor/);
    assert.match(html, /Bu dosyada görüntülenebilir bir fotoğraf bulunmuyor/);
    assert.doesNotMatch(html, /Bağlantını kontrol/);

    elements(empty).find((node) => node.type === "button" && node.props["aria-label"] === "Medyayı yeniden yükle").props.onClick();
    const retry = elements(view.render()).find((node) => node.props?.src === photo.url);
    assert.ok(retry);
    assert.notEqual(retry.key, original.key);
    retry.props.onError();
    const normalFailure = renderToStaticMarkup(view.render());
    assert.match(normalFailure, /Görsel yüklenemedi/);
    assert.match(normalFailure, /Bağlantını kontrol/);
    assert.doesNotMatch(normalFailure, /Bu dosyada görüntülenebilir/);
  });
}

for (const [width, height] of [[1, 900], [900, 1], [40, 40]]) {
  test(`a valid ${width} by ${height} image stays visible instead of being treated as an empty pixel`, () => {
    const view = mount({ media: photo, description: "Kampüs fotoğrafı" });
    const image = elements(view.render()).find((node) => node.props?.src === photo.url);
    const loaded = { complete: true, naturalWidth: width, naturalHeight: height, getAttribute: () => photo.url };
    image.props.ref(loaded);
    image.props.onLoad({ currentTarget: loaded });
    assert.ok(elements(view.render()).some((node) => node.props?.src === photo.url));
    assert.doesNotMatch(renderToStaticMarkup(view.render()), /post-media-fallback/);
  });
}
