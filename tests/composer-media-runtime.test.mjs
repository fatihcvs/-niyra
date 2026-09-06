import assert from "node:assert/strict";
import test from "node:test";
import { act, createElement as h, useState } from "react";
import { createMobileDom } from "./helpers/mobile-dom.mjs";

const photo = (name) => new File([new Uint8Array([137, 80, 78, 71])], name, { type: "image/png" });
async function setup() {
  const ui = await createMobileDom();
  const { useComposerMedia } = ui.load("app/use-composer-media.ts");
  const { MobilePostComposer } = ui.load("app/mobile-app.tsx");
  let current;
  function Harness({ locked = false }) {
    const [error, setError] = useState("");
    const media = useComposerMedia({ locked, onError: setError });
    current = media;
    return h(MobilePostComposer, { draft: "", onDraftChange() {}, audience: "platform", onAudienceChange() {}, name: "Yerel Öğrenci", initials: "YÖ", media: media.files[0] ?? null, mediaUrl: media.urls[0] ?? "", mediaFiles: media.files, mediaUrls: media.urls, onMediaChange: media.choose, onRemoveMedia: () => media.remove(0), onRemoveMediaAt: media.remove, onReorderMedia: media.move, onClose() {}, onNavigate() {}, onPublish() { throw new Error("This test must not publish"); }, publishing: false, locked, error });
  }
  const choose = async (files, kind = "image") => {
    const input = ui.host.querySelector(`input[type=file][accept^='${kind}']`);
    Object.defineProperty(input, "files", { value: files, configurable: true });
    await act(async () => input.dispatchEvent(new ui.window.Event("change", { bubbles: true })));
  };
  return { ...ui, choose, current: () => current, render: (locked = false) => ui.render(h(Harness, { locked })) };
}

test("actual composer selects several photos, reorders and removes them with visible numbered controls and stable preview URLs", async () => {
  const ui = await setup();
  const revoked = [];
  const originalRevoke = URL.revokeObjectURL;
  URL.revokeObjectURL = (url) => { revoked.push(url); originalRevoke.call(URL, url); };
  try {
    await ui.render();
    assert.equal(ui.host.querySelector("input[accept^='image']").multiple, true);
    const files = [photo("bir.png"), photo("iki.png"), photo("üç.png")];
    await ui.choose(files);
    assert.equal(ui.host.querySelectorAll("ol li").length, 3);
    assert.equal(ui.host.querySelectorAll("ol img").length, 3);
    const before = [...ui.current().urls];
    await ui.click(ui.host.querySelector('[aria-label="3. fotoğrafı önceye taşı"]'));
    assert.deepEqual(Array.from(ui.current().files, (file) => file.name), ["bir.png", "üç.png", "iki.png"]);
    assert.deepEqual(Array.from(ui.current().urls), [before[0], before[2], before[1]]);
    assert.equal(revoked.length, 0, "Reorder must not reload or revoke an unchanged photo");
    await ui.click(ui.host.querySelector('[aria-label="2. fotoğrafı kaldır"]'));
    assert.deepEqual(Array.from(ui.current().files, (file) => file.name), ["bir.png", "iki.png"]);
    assert.deepEqual(revoked, [before[2]]);
    assert.ok(ui.host.querySelector('[aria-label="1. fotoğrafı önceye taşı"]').disabled);
    assert.ok(ui.host.querySelector('[aria-label="2. fotoğrafı sonraya taşı"]').disabled);
    await ui.close();
    assert.deepEqual([...revoked].sort(), [...before].sort(), "Every remaining object URL is revoked on unmount");
  } finally { URL.revokeObjectURL = originalRevoke; if (ui.host.isConnected) await ui.close(); }
});

test("mixed media, over-capacity selection and wrong file type show an error while preserving the selected photos", async () => {
  const ui = await setup();
  try {
    await ui.render();
    const first = photo("first.png");
    await ui.choose([first]);
    await ui.choose([new File(["video"], "video.mp4", { type: "video/mp4" })], "video");
    assert.match(ui.host.querySelector('[role="alert"]').textContent, /birlikte kullanılamaz/);
    assert.equal(ui.current().files[0], first);
    await ui.choose([2, 3, 4, 5].map((number) => photo(`${number}.png`)));
    assert.match(ui.host.querySelector('[role="alert"]').textContent, /en fazla 4/);
    assert.equal(ui.current().files.length, 1);
    await ui.choose([new File(["svg"], "vector.svg", { type: "image/svg+xml" })]);
    assert.match(ui.host.querySelector('[role="alert"]').textContent, /PNG, JPG/);
    assert.equal(ui.current().files.length, 1);
    assert.equal(ui.host.querySelector('input[accept^="image"]').value, "", "The same chooser selection can be corrected and retried");
  } finally { await ui.close(); }
});

test("an in-flight or uncertain composer locks photo order, removals, picker and audience edits", async () => {
  const ui = await setup();
  try {
    await ui.render();
    const files = [photo("first.png"), photo("second.png")];
    await ui.choose(files);
    await ui.render(true);
    for (const control of ui.host.querySelectorAll("ol button, select, textarea")) assert.equal(control.disabled, true);
    await act(async () => { ui.current().move(1, -1); ui.current().remove(0); });
    await ui.choose([photo("third.png")]);
    assert.deepEqual(Array.from(ui.current().files), files);
    assert.equal(ui.host.querySelector('[role="alert"]'), null);
  } finally { await ui.close(); }
});
