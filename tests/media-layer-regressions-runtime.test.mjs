import assert from "node:assert/strict";
import test from "node:test";
import { act, createElement as h } from "react";
import { createMobileDom } from "./helpers/mobile-dom.mjs";

const media = ["first", "second"].map(id => ({ id, kind: "image", url: `/synthetic-${id}.png`, fileName: `${id}.png`, contentType: "image/png" }));
const posts = ["post-a", "post-b"].map(id => ({ id, name: "Sentetik Öğrenci", text: id, media, likes: 0, comments: 0, liked: false, saved: false }));

async function nestedProfile() {
  const ui = await createMobileDom({ fetch: async () => ({ ok: true, json: async () => ({ posts, notes: [], communities: [], nextCursor: null }) }) });
  // jsdom lacks the browser top-layer implementation; real React portal/events and cleanup are exercised.
  ui.window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  ui.window.HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  const { ProfileContent } = ui.load("app/profile-content.tsx");
  const { PostMediaGallery } = ui.load("app/post-media-gallery.tsx");
  const { profileContentState } = ui.load("lib/profile-content-state.ts");
  profileContentState.setOwnerScope("fixture-owner");
  profileContentState.chooseTab("fixture-owner", "fixture-profile", "images");
  await ui.render(h(ProfileContent, { ownerScope: "fixture-owner", userId: "fixture-profile", own: false, about: null, renderPost: post => h(PostMediaGallery, { media: post.media, description: post.text }) }));
  await ui.click(ui.host.querySelector(".profile-media-tile"));
  await ui.click(ui.host.querySelector('dialog [aria-label="Fotoğrafı büyük aç"]'));
  return ui;
}

test("nested media arrow navigation does not also change the underlying profile post", async () => {
  const ui = await nestedProfile();
  try {
    const native = ui.host.querySelector("dialog");
    const viewer = ui.document.querySelector('[aria-label="Gönderi medyası"]');
    assert.equal(viewer.closest("dialog"), native, "Media portal stays within the native dialog");
    await act(async () => viewer.dispatchEvent(new ui.window.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true })));
    assert.equal(native.querySelector("header small").textContent, "1 / 2");
    assert.equal(ui.document.querySelector('[aria-label="Gönderi medyası"] img').getAttribute("src"), media[1].url);
  } finally { await ui.close(); }
});

test("removing selected media cannot leave invisible modal isolation behind", async () => {
  const ui = await createMobileDom();
  try {
    const { PostMediaGallery } = ui.load("app/post-media-gallery.tsx");
    await ui.render(h(PostMediaGallery, { media, description: "Sentetik medya" }));
    await ui.click(ui.host.querySelector('[aria-label="Fotoğrafı büyük aç"]'));
    await ui.click(ui.document.querySelector('[aria-label="Sonraki medya"]'));
    await ui.render(h(PostMediaGallery, { media: [media[0]], description: "Sentetik medya" }));
    const viewer = ui.document.querySelector('[aria-label="Gönderi medyası"]');
    if (viewer) assert.ok(viewer.querySelector("img"), "A remaining selected attachment is visible");
    else {
      assert.equal(ui.document.body.style.overflow, "");
      assert.equal(ui.document.getElementById("bottom-nav").inert, false);
    }
  } finally { await ui.close(); }
});

test("unmounting a profile with its nested media viewer releases the body scroll lock", async () => {
  const ui = await nestedProfile();
  try {
    assert.equal(ui.document.body.style.overflow, "hidden");
    await ui.render(null);
    assert.equal(ui.document.querySelector('[aria-label="Gönderi medyası"]'), null);
    assert.equal(ui.document.body.style.overflow, "");
    assert.equal(ui.document.getElementById("bottom-nav").inert, false);
  } finally { await ui.close(); }
});

test("profile and attachment viewers unwind Back separately and restore the profile without an extra entry", async () => {
  const ui = await nestedProfile();
  try {
    const depth = ui.window.history.state.kampiraDepth;
    await ui.travel("back");
    assert.equal(ui.document.querySelector('[aria-label="Gönderi medyası"]'), null);
    assert.ok(ui.host.querySelector("dialog[open]"));
    assert.equal(ui.document.body.style.overflow, "hidden");
    await ui.travel("forward");
    assert.ok(ui.document.querySelector('[aria-label="Gönderi medyası"]'));
    assert.equal(ui.window.history.state.kampiraDepth, depth);
    await ui.travel("back");
    await ui.travel("back");
    assert.equal(ui.host.querySelector("dialog"), null);
    assert.equal(ui.document.body.style.overflow, "");
    assert.equal(ui.document.activeElement.className, "profile-media-tile");
    await ui.travel("forward");
    assert.ok(ui.host.querySelector("dialog[open]"));
    assert.equal(ui.window.history.state.kampiraDepth, depth - 1);
  } finally { await ui.close(); }
});

test("removing all attachments closes isolation and cannot restore a nonexistent image", async () => {
  const ui = await createMobileDom();
  try {
    const { PostMediaGallery } = ui.load("app/post-media-gallery.tsx");
    await ui.render(h(PostMediaGallery, { media, description: "Sentetik medya" }));
    await ui.click(ui.host.querySelector('[aria-label="Fotoğrafı büyük aç"]'));
    await ui.render(h(PostMediaGallery, { media: [], description: "Sentetik medya" }));
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 35)); });
    assert.equal(ui.document.querySelector('[aria-label="Gönderi medyası"]'), null);
    assert.equal(ui.document.body.style.overflow, "");
    await ui.travel("forward");
    assert.equal(ui.document.querySelector('[aria-label="Gönderi medyası"]'), null);
    assert.equal(ui.document.getElementById("bottom-nav").inert, false);
  } finally { await ui.close(); }
});
