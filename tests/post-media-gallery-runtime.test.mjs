import assert from "node:assert/strict";
import test from "node:test";
import { createElement as h } from "react";
import { createMobileDom } from "./helpers/mobile-dom.mjs";
const media = ["first", "second"].map((id) => ({ id, kind: "image", url: `/fixture-${id}.png`, fileName: `${id}.png`, contentType: "image/png" }));

test("photo viewer supports real next/previous, browser Back, focus return and Forward without duplicate history", async () => {
  const ui = await createMobileDom();
  try {
    const Gallery = ui.load("app/post-media-gallery.tsx").PostMediaGallery;
    await ui.render(h(Gallery, { media, description: "İki kampüs fotoğrafı" }));
    const opener = ui.host.querySelector('[aria-label="Fotoğrafı büyük aç"]');
    await ui.click(opener);
    const dialog = () => ui.document.querySelector('[role="dialog"]');
    assert.ok(dialog());
    assert.equal(ui.document.getElementById("bottom-nav").inert, true);
    assert.equal(dialog().querySelector('[aria-label="Önceki medya"]').disabled, true);
    await ui.click(dialog().querySelector('[aria-label="Sonraki medya"]'));
    assert.equal(dialog().querySelector("img").getAttribute("src"), media[1].url);
    assert.equal(dialog().querySelector('[aria-label="Sonraki medya"]').disabled, true);
    await ui.travel("back");
    assert.equal(dialog(), null);
    assert.equal(ui.document.activeElement, opener);
    assert.equal(ui.document.getElementById("bottom-nav").inert, false);
    const depth = ui.window.history.length;
    await ui.travel("forward");
    assert.equal(dialog().querySelector("img").getAttribute("src"), media[1].url);
    assert.equal(ui.window.history.length, depth);
    await ui.key("Escape");
    assert.equal(dialog(), null);
  } finally { await ui.close(); }
});

test("media failure in the viewer leaves the post and other attachment recoverable", async () => {
  const ui = await createMobileDom();
  try {
    const Gallery = ui.load("app/post-media-gallery.tsx").PostMediaGallery;
    await ui.render(h("article", null, h("p", null, "Gönderi metni"), h(Gallery, { media, description: "Medya" })));
    await ui.click(ui.host.querySelector('[aria-label="Fotoğrafı büyük aç"]'));
    const { act } = await import("react");
    await act(async () => ui.document.querySelector('[role="dialog"] img').dispatchEvent(new ui.window.Event("error")));
    assert.match(ui.document.querySelector('[role="dialog"]').textContent, /Görsel yüklenemedi/);
    assert.match(ui.host.textContent, /Gönderi metni/);
    await ui.click(ui.document.querySelector('[aria-label="Sonraki medya"]'));
    assert.equal(ui.document.querySelector('[role="dialog"] img').getAttribute("src"), media[1].url);
  } finally { await ui.close(); }
});
