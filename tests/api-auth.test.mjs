import assert from "node:assert/strict";
import test from "node:test";

async function builtWorker() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("api-auth-test", `${process.pid}-${Date.now()}`);
  const builtModule = await import(workerUrl.href);
  return builtModule.default;
}

const runtimeEnv = {
  ASSETS: {
    fetch: async () => new Response("Not found", { status: 404 }),
  },
};

const runtimeContext = {
  waitUntil() {},
  passThroughOnException() {},
};

const platformHeaders = {
  host: "uniyra.test.chatgpt.site",
  "oai-authenticated-user-id": "test-platform-user",
  "oai-authenticated-user-email": "student@omu.edu.tr",
};

test("academic profile API rejects requests without verified identity", async () => {
  const worker = await builtWorker();
  const response = await worker.fetch(
    new Request("http://localhost/api/profile", { headers: { accept: "application/json" } }),
    runtimeEnv,
    runtimeContext,
  );

  assert.equal(response.status, 401);
  assert.match(response.headers.get("content-type") ?? "", /^application\/json\b/i);
});

test("Railway-style requests cannot spoof platform identity headers", async () => {
  const worker = await builtWorker();
  const response = await worker.fetch(
    new Request("http://localhost/api/profile", {
      headers: {
        "oai-authenticated-user-id": "spoofed-user",
        "oai-authenticated-user-email": "spoofed@omu.edu.tr",
      },
    }),
    runtimeEnv,
    runtimeContext,
  );

  assert.equal(response.status, 401);
});

test("academic profile updates reject cross-origin browser requests", async () => {
  const worker = await builtWorker();
  const response = await worker.fetch(
    new Request("http://localhost/api/profile", {
      method: "PUT",
      headers: { "content-type": "application/json", origin: "https://attacker.example", ...platformHeaders },
      body: JSON.stringify({ displayName: "Runtime Student" }),
    }),
    runtimeEnv,
    runtimeContext,
  );

  assert.equal(response.status, 403);
});

test("academic profile updates validate the editable display name before database access", async () => {
  const worker = await builtWorker();
  const response = await worker.fetch(
    new Request("http://localhost/api/profile", {
      method: "PUT",
      headers: { "content-type": "application/json", ...platformHeaders },
      body: JSON.stringify({
        displayName: "A",
        universityId: "omu",
        classYear: 3,
      }),
    }),
    runtimeEnv,
    runtimeContext,
  );

  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /görünen ad/i);
});

test("profile detail updates validate usernames before database access", async () => {
  const worker = await builtWorker();
  const response = await worker.fetch(
    new Request("http://localhost/api/profile", {
      method: "PUT",
      headers: { "content-type": "application/json", ...platformHeaders },
      body: JSON.stringify({ action: "update-details", displayName: "Runtime Student", handle: "geçersiz kullanıcı", bio: "", links: [] }),
    }),
    runtimeEnv,
    runtimeContext,
  );

  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /kullanıcı adı/i);
});

test("profile detail updates reject unsafe external links before database access", async () => {
  const worker = await builtWorker();
  const response = await worker.fetch(
    new Request("http://localhost/api/profile", {
      method: "PUT",
      headers: { "content-type": "application/json", ...platformHeaders },
      body: JSON.stringify({ action: "update-details", displayName: "Runtime Student", handle: "runtime.student", bio: "Merhaba", links: [{ title: "Portfolyo", url: "javascript:alert(1)" }] }),
    }),
    runtimeEnv,
    runtimeContext,
  );

  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /bağlantı/i);
});

test("profile media rejects anonymous reads", async () => {
  const worker = await builtWorker();
  const response = await worker.fetch(new Request("http://localhost/api/profile/media?user=student&kind=avatar"), runtimeEnv, runtimeContext);
  assert.equal(response.status, 401);
});

test("profile media uploads reject cross-origin browser requests", async () => {
  const worker = await builtWorker();
  const form = new FormData();
  form.set("kind", "avatar");
  form.set("image", new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "avatar.png", { type: "image/png" }));
  const response = await worker.fetch(new Request("http://localhost/api/profile/media", {
    method: "POST",
    headers: { origin: "https://attacker.example", ...platformHeaders },
    body: form,
  }), runtimeEnv, runtimeContext);
  assert.equal(response.status, 403);
});

test("self-service registration validates account fields before database access", async () => {
  const worker = await builtWorker();
  const response = await worker.fetch(
    new Request("http://localhost/api/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName: "A", email: "not-an-email", password: "weak" }),
    }),
    runtimeEnv,
    runtimeContext,
  );

  assert.equal(response.status, 400);
});

test("self-service registration rejects cross-origin browser requests", async () => {
  const worker = await builtWorker();
  const response = await worker.fetch(
    new Request("http://localhost/api/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://attacker.example" },
      body: JSON.stringify({ displayName: "Runtime Student", email: "student@example.edu", password: "StrongPassword123" }),
    }),
    runtimeEnv,
    runtimeContext,
  );

  assert.equal(response.status, 403);
});

test("self-service registration accepts its public HTTPS origin behind Railway TLS termination", async () => {
  const worker = await builtWorker();
  const response = await worker.fetch(
    new Request("http://web-production-da44f.up.railway.app/api/auth/register", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        host: "web-production-da44f.up.railway.app",
        origin: "https://web-production-da44f.up.railway.app",
        "x-forwarded-proto": "https",
      },
      body: JSON.stringify({ displayName: "Runtime Student", email: "student@example.edu", password: "StrongPassword123" }),
    }),
    runtimeEnv,
    runtimeContext,
  );

  assert.notEqual(response.status, 403);
  assert.equal(response.status, 503);
});

test("login returns a generic error for malformed credentials", async () => {
  const worker = await builtWorker();
  const response = await worker.fetch(
    new Request("http://localhost/api/auth/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "invalid", password: "wrong" }),
    }),
    runtimeEnv,
    runtimeContext,
  );

  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, "E-posta veya parola hatalı.");
});

test("staff login returns a generic error for malformed credentials", async () => {
  const worker = await builtWorker();
  const response = await worker.fetch(
    new Request("http://localhost/api/staff/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "", password: "" }),
    }),
    runtimeEnv,
    runtimeContext,
  );
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, "Kullanıcı adı veya parola hatalı.");
});

test("staff login rejects cross-origin browser requests", async () => {
  const worker = await builtWorker();
  const response = await worker.fetch(
    new Request("http://localhost/api/staff/session", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://attacker.example" },
      body: JSON.stringify({ username: "admin", password: "admin123" }),
    }),
    runtimeEnv,
    runtimeContext,
  );
  assert.equal(response.status, 403);
});

for (const route of ["owner", "admin"]) {
  test(`${route} mutations reject cross-origin browser requests`, async () => {
    const worker = await builtWorker();
    const response = await worker.fetch(
      new Request(`http://localhost/api/${route}`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: "https://attacker.example" },
        body: JSON.stringify({ action: "noop" }),
      }),
      runtimeEnv,
      runtimeContext,
    );
    assert.equal(response.status, 403);
  });
}

test("post API rejects anonymous write attempts", async () => {
  const worker = await builtWorker();
  const response = await worker.fetch(
    new Request("http://localhost/api/posts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: "Kimliksiz gönderi" }),
    }),
    runtimeEnv,
    runtimeContext,
  );

  assert.equal(response.status, 401);
  assert.match(response.headers.get("content-type") ?? "", /^application\/json\b/i);
});

test("campus pulse rejects anonymous reads", async () => {
  const worker = await builtWorker();
  const response = await worker.fetch(
    new Request("http://localhost/api/campus-pulse", { headers: { accept: "application/json" } }),
    runtimeEnv,
    runtimeContext,
  );

  assert.equal(response.status, 401);
});

test("campus pulse images reject anonymous reads", async () => {
  const worker = await builtWorker();
  const response = await worker.fetch(
    new Request("http://localhost/api/campus-pulse/image?id=post-id"),
    runtimeEnv,
    runtimeContext,
  );

  assert.equal(response.status, 401);
});

test("campus pulse rejects unknown feed kinds before database access", async () => {
  const worker = await builtWorker();
  const response = await worker.fetch(
    new Request("http://localhost/api/campus-pulse?kind=secret", { headers: platformHeaders }),
    runtimeEnv,
    runtimeContext,
  );

  assert.equal(response.status, 400);
});

test("campus pulse validates live expiry before database access", async () => {
  const worker = await builtWorker();
  const response = await worker.fetch(
    new Request("http://localhost/api/campus-pulse", {
      method: "POST",
      headers: { "content-type": "application/json", ...platformHeaders },
      body: JSON.stringify({ kind: "live", category: "food", content: "Yemekhane sırası hızlı ilerliyor.", durationHours: 99 }),
    }),
    runtimeEnv,
    runtimeContext,
  );

  assert.equal(response.status, 400);
});

test("campus pulse requires meaningful confession content", async () => {
  const worker = await builtWorker();
  const response = await worker.fetch(
    new Request("http://localhost/api/campus-pulse", {
      method: "POST",
      headers: { "content-type": "application/json", ...platformHeaders },
      body: JSON.stringify({ kind: "confession", category: "social", content: "kısa" }),
    }),
    runtimeEnv,
    runtimeContext,
  );

  assert.equal(response.status, 400);
});

test("campus pulse does not accept images on anonymous confessions", async () => {
  const worker = await builtWorker();
  const form = new FormData();
  form.set("kind", "confession");
  form.set("category", "social");
  form.set("content", "Bu hafta kendimi biraz yalnız hissediyorum.");
  form.set("image", new File([Uint8Array.from([0x89, 0x50, 0x4e, 0x47])], "campus.png", { type: "image/png" }));
  const response = await worker.fetch(
    new Request("http://localhost/api/campus-pulse", { method: "POST", headers: platformHeaders, body: form }),
    runtimeEnv,
    runtimeContext,
  );

  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /yalnızca Kampüs Anlık/i);
});

test("campus pulse verifies image signatures before storage access", async () => {
  const worker = await builtWorker();
  const form = new FormData();
  form.set("kind", "live");
  form.set("category", "event");
  form.set("content", "Kampüs meydanındaki etkinlik şu anda başladı.");
  form.set("durationHours", "3");
  form.set("image", new File(["not-a-real-png"], "campus.png", { type: "image/png" }));
  const response = await worker.fetch(
    new Request("http://localhost/api/campus-pulse", { method: "POST", headers: platformHeaders, body: form }),
    runtimeEnv,
    runtimeContext,
  );

  assert.equal(response.status, 415);
  assert.match((await response.json()).error, /dosya türüyle eşleşmiyor/i);
});

test("social matching rejects anonymous reads", async () => {
  const worker = await builtWorker();
  const response = await worker.fetch(
    new Request("http://localhost/api/social-match", { headers: { accept: "application/json" } }),
    runtimeEnv,
    runtimeContext,
  );

  assert.equal(response.status, 401);
});

test("social matching validates profile preferences before database access", async () => {
  const worker = await builtWorker();
  const response = await worker.fetch(
    new Request("http://localhost/api/social-match", {
      method: "POST",
      headers: { "content-type": "application/json", ...platformHeaders },
      body: JSON.stringify({ action: "save-profile", interests: ["music"], intents: [], availability: "someday" }),
    }),
    runtimeEnv,
    runtimeContext,
  );

  assert.equal(response.status, 400);
});

test("social matching rejects invalid meetup dates before database access", async () => {
  const worker = await builtWorker();
  const response = await worker.fetch(
    new Request("http://localhost/api/social-match", {
      method: "POST",
      headers: { "content-type": "application/json", ...platformHeaders },
      body: JSON.stringify({ action: "request", targetPublicId: "student-id", activity: "coffee", message: "Kampüste bir kahve içelim mi?", proposedTime: "not-a-date" }),
    }),
    runtimeEnv,
    runtimeContext,
  );

  assert.equal(response.status, 400);
});

test("campus guide rejects anonymous reads", async () => {
  const worker = await builtWorker();
  const response = await worker.fetch(new Request("http://localhost/api/campus-guide"), runtimeEnv, runtimeContext);
  assert.equal(response.status, 401);
});

test("campus guide validates paired coordinates before database access", async () => {
  const worker = await builtWorker();
  const response = await worker.fetch(new Request("http://localhost/api/campus-guide", {
    method: "POST",
    headers: { "content-type": "application/json", ...platformHeaders },
    body: JSON.stringify({ action: "place", name: "Merkez Kütüphane", category: "library", description: "Sessiz çalışma alanı ve grup odaları.", latitude: 41.2, longitude: "" , accessibility: [] }),
  }), runtimeEnv, runtimeContext);
  assert.equal(response.status, 400);
});

test("campus guide validates event chronology before database access", async () => {
  const worker = await builtWorker();
  const response = await worker.fetch(new Request("http://localhost/api/campus-guide", {
    method: "POST",
    headers: { "content-type": "application/json", ...platformHeaders },
    body: JSON.stringify({ action: "event", name: "Kampüs Etkinliği", category: "social", description: "Öğrenciler için kampüs buluşması.", startsAt: "not-a-date" }),
  }), runtimeEnv, runtimeContext);
  assert.equal(response.status, 400);
});

test("library occupancy rejects anonymous reads", async () => {
  const worker = await builtWorker();
  const response = await worker.fetch(new Request("http://localhost/api/library-occupancy"), runtimeEnv, runtimeContext);
  assert.equal(response.status, 401);
});

test("library occupancy rejects fabricated capacities before database access", async () => {
  const worker = await builtWorker();
  const response = await worker.fetch(new Request("http://localhost/api/library-occupancy", {
    method: "POST", headers: { "content-type": "application/json", ...platformHeaders },
    body: JSON.stringify({ action: "area", name: "Merkez Kütüphane", floorLabel: "2. Kat", zoneLabel: "Sessiz Alan", description: "Prizli ve sessiz çalışma alanı.", capacity: 0, features: ["quiet"] }),
  }), runtimeEnv, runtimeContext);
  assert.equal(response.status, 400);
});

test("library occupancy only accepts bounded check-in durations before database access", async () => {
  const worker = await builtWorker();
  const response = await worker.fetch(new Request("http://localhost/api/library-occupancy", {
    method: "POST", headers: { "content-type": "application/json", ...platformHeaders },
    body: JSON.stringify({ action: "check-in", areaId: "area-test", durationMinutes: 1440 }),
  }), runtimeEnv, runtimeContext);
  assert.equal(response.status, 400);
});

test("campus market rejects anonymous reads", async () => {
  const worker = await builtWorker();
  const response = await worker.fetch(new Request("http://localhost/api/campus-market"), runtimeEnv, runtimeContext);
  assert.equal(response.status, 401);
});

test("campus market image uploads reject anonymous requests", async () => {
  const worker = await builtWorker();
  const form = new FormData();
  form.set("listingId", "listing-test");
  form.append("images", new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "urun.png", { type: "image/png" }));
  const response = await worker.fetch(new Request("http://localhost/api/campus-market/images", { method: "POST", body: form }), runtimeEnv, runtimeContext);
  assert.equal(response.status, 401);
});

test("campus market image uploads validate file signatures before database access", async () => {
  const worker = await builtWorker();
  const form = new FormData();
  form.set("listingId", "listing-test");
  form.append("images", new File(["not an image"], "urun.png", { type: "image/png" }));
  const response = await worker.fetch(new Request("http://localhost/api/campus-market/images", {
    method: "POST", headers: platformHeaders, body: form,
  }), runtimeEnv, runtimeContext);
  assert.equal(response.status, 415);
});

test("campus market validates listing prices before database access", async () => {
  const worker = await builtWorker();
  const response = await worker.fetch(new Request("http://localhost/api/campus-market", {
    method: "POST", headers: { "content-type": "application/json", ...platformHeaders },
    body: JSON.stringify({ action: "listing", kind: "sell", category: "books", title: "Ders kitabı", description: "Temiz ve eksiksiz ders kitabı.", condition: "used-good", price: "yanlış" }),
  }), runtimeEnv, runtimeContext);
  assert.equal(response.status, 400);
});

test("campus market requires sourced price observations before database access", async () => {
  const worker = await builtWorker();
  const response = await worker.fetch(new Request("http://localhost/api/campus-market", {
    method: "POST", headers: { "content-type": "application/json", ...platformHeaders },
    body: JSON.stringify({ action: "price", category: "food", placeName: "Kafe", itemName: "Çay", price: 20, observedAt: new Date().toISOString(), sourceNote: "x" }),
  }), runtimeEnv, runtimeContext);
  assert.equal(response.status, 400);
});

test("post API rejects malformed create payloads before database access", async () => {
  const worker = await builtWorker();
  const response = await worker.fetch(
    new Request("http://localhost/api/posts", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...platformHeaders,
      },
      body: JSON.stringify({ content: "Ders gönderisi", courseId: 42 }),
    }),
    runtimeEnv,
    runtimeContext,
  );

  assert.equal(response.status, 400);
});

test("post API rejects anonymous edit attempts", async () => {
  const worker = await builtWorker();
  const response = await worker.fetch(
    new Request("http://localhost/api/posts", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: "example", content: "Değiştirilen gönderi" }),
    }),
    runtimeEnv,
    runtimeContext,
  );

  assert.equal(response.status, 401);
  assert.match(response.headers.get("content-type") ?? "", /^application\/json\b/i);
});

test("post API rejects anonymous delete attempts", async () => {
  const worker = await builtWorker();
  const response = await worker.fetch(
    new Request("http://localhost/api/posts", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: "example" }),
    }),
    runtimeEnv,
    runtimeContext,
  );

  assert.equal(response.status, 401);
  assert.match(response.headers.get("content-type") ?? "", /^application\/json\b/i);
});

test("post API rejects malformed edit payloads before database access", async () => {
  const worker = await builtWorker();
  const response = await worker.fetch(
    new Request("http://localhost/api/posts", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        ...platformHeaders,
      },
      body: JSON.stringify({ id: 42, content: { text: "Geçersiz" } }),
    }),
    runtimeEnv,
    runtimeContext,
  );

  assert.equal(response.status, 400);
});

test("post API rejects malformed delete payloads before database access", async () => {
  const worker = await builtWorker();
  const response = await worker.fetch(
    new Request("http://localhost/api/posts", {
      method: "DELETE",
      headers: {
        "content-type": "application/json",
        ...platformHeaders,
      },
      body: JSON.stringify({ id: 42 }),
    }),
    runtimeEnv,
    runtimeContext,
  );

  assert.equal(response.status, 400);
});

test("post API rejects malformed feed cursors before database access", async () => {
  const worker = await builtWorker();
  const response = await worker.fetch(
    new Request("http://localhost/api/posts?cursor=not-a-cursor", {
      headers: platformHeaders,
    }),
    runtimeEnv,
    runtimeContext,
  );

  assert.equal(response.status, 400);
});

test("post API accepts ranked feed cursor shape before database access", async () => {
  const worker = await builtWorker();
  const cursor = encodeURIComponent("8::2026-09-03 12:00:00::example-post");
  const response = await worker.fetch(
    new Request(`http://localhost/api/posts?cursor=${cursor}`, {
      headers: platformHeaders,
    }),
    runtimeEnv,
    runtimeContext,
  );

  assert.equal(response.status, 503);
});

test("post API rejects oversized shared post identifiers before database access", async () => {
  const worker = await builtWorker();
  const response = await worker.fetch(
    new Request(`http://localhost/api/posts?id=${"a".repeat(81)}`, {
      headers: platformHeaders,
    }),
    runtimeEnv,
    runtimeContext,
  );

  assert.equal(response.status, 400);
});

test("social actions reject anonymous interaction attempts", async () => {
  const worker = await builtWorker();
  const response = await worker.fetch(
    new Request("http://localhost/api/post-actions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ postId: "example", type: "like" }),
    }),
    runtimeEnv,
    runtimeContext,
  );

  assert.equal(response.status, 401);
  assert.match(response.headers.get("content-type") ?? "", /^application\/json\b/i);
});

test("social actions reject malformed post identifiers before database access", async () => {
  const worker = await builtWorker();
  const response = await worker.fetch(
    new Request("http://localhost/api/post-actions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...platformHeaders,
      },
      body: JSON.stringify({ postId: 42, type: "like" }),
    }),
    runtimeEnv,
    runtimeContext,
  );

  assert.equal(response.status, 400);
});

test("social actions reject malformed comments before database access", async () => {
  const worker = await builtWorker();
  const response = await worker.fetch(
    new Request("http://localhost/api/post-actions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...platformHeaders,
      },
      body: JSON.stringify({ postId: "example", type: "comment", content: 42 }),
    }),
    runtimeEnv,
    runtimeContext,
  );

  assert.equal(response.status, 400);
});

test("comment API rejects anonymous reads", async () => {
  const worker = await builtWorker();
  const response = await worker.fetch(
    new Request("http://localhost/api/comments?postId=example", {
      headers: { accept: "application/json" },
    }),
    runtimeEnv,
    runtimeContext,
  );

  assert.equal(response.status, 401);
  assert.match(response.headers.get("content-type") ?? "", /^application\/json\b/i);
});

test("comment API rejects anonymous delete attempts", async () => {
  const worker = await builtWorker();
  const response = await worker.fetch(
    new Request("http://localhost/api/comments", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: "example" }),
    }),
    runtimeEnv,
    runtimeContext,
  );

  assert.equal(response.status, 401);
  assert.match(response.headers.get("content-type") ?? "", /^application\/json\b/i);
});

test("comment API rejects malformed post identifiers before database access", async () => {
  const worker = await builtWorker();
  const response = await worker.fetch(
    new Request("http://localhost/api/comments", {
      method: "DELETE",
      headers: {
        "content-type": "application/json",
        ...platformHeaders,
      },
      body: JSON.stringify({ id: 42 }),
    }),
    runtimeEnv,
    runtimeContext,
  );

  assert.equal(response.status, 400);
});

test("comment API requires a post identifier before database access", async () => {
  const worker = await builtWorker();
  const response = await worker.fetch(
    new Request("http://localhost/api/comments", {
      headers: platformHeaders,
    }),
    runtimeEnv,
    runtimeContext,
  );

  assert.equal(response.status, 400);
});

test("student directory rejects anonymous reads", async () => {
  const worker = await builtWorker();
  const response = await worker.fetch(
    new Request("http://localhost/api/people", { headers: { accept: "application/json" } }),
    runtimeEnv,
    runtimeContext,
  );

  assert.equal(response.status, 401);
  assert.match(response.headers.get("content-type") ?? "", /^application\/json\b/i);
});

test("follow system rejects anonymous writes", async () => {
  const worker = await builtWorker();
  const response = await worker.fetch(
    new Request("http://localhost/api/follows", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ targetId: "example" }),
    }),
    runtimeEnv,
    runtimeContext,
  );

  assert.equal(response.status, 401);
  assert.match(response.headers.get("content-type") ?? "", /^application\/json\b/i);
});

test("direct messages reject cross-origin writes before database access", async () => {
  const worker = await builtWorker();
  const response = await worker.fetch(
    new Request("http://localhost/api/messages", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://attacker.example", ...platformHeaders },
      body: JSON.stringify({ recipientId: "example", body: "unsafe" }),
    }),
    runtimeEnv,
    runtimeContext,
  );
  assert.equal(response.status, 403);
});

for (const [label, path] of [
  ["note library", "/api/notes"],
  ["note comments", "/api/note-comments?noteId=example"],
  ["community directory", "/api/communities"],
  ["community events", "/api/community-events?communityId=example"],
  ["notification center", "/api/notifications"],
  ["direct messages", "/api/messages"],
  ["unified search", "/api/search?q=mat"],
  ["safety center", "/api/safety"],
]) {
  test(`${label} rejects anonymous reads`, async () => {
    const worker = await builtWorker();
    const response = await worker.fetch(
      new Request(`http://localhost${path}`, { headers: { accept: "application/json" } }),
      runtimeEnv,
      runtimeContext,
    );
    assert.equal(response.status, 401);
    assert.match(response.headers.get("content-type") ?? "", /^application\/json\b/i);
  });
}

test("note upload rejects unsupported files before storage access", async () => {
  const worker = await builtWorker();
  const form = new FormData();
  form.set("title", "Örnek not");
  form.set("courseId", "mat101");
  form.set("file", new File(["unsafe"], "payload.exe", { type: "application/octet-stream" }));
  const response = await worker.fetch(
    new Request("http://localhost/api/notes", {
      method: "POST",
      headers: platformHeaders,
      body: form,
    }),
    runtimeEnv,
    runtimeContext,
  );
  assert.equal(response.status, 415);
});

test("community creation rejects invalid join policies before database access", async () => {
  const worker = await builtWorker();
  const response = await worker.fetch(
    new Request("http://localhost/api/communities", {
      method: "POST",
      headers: { "content-type": "application/json", ...platformHeaders },
      body: JSON.stringify({ name: "Matematik çevresi", description: "Birlikte düzenli matematik çalışırız.", joinPolicy: "secret" }),
    }),
    runtimeEnv,
    runtimeContext,
  );
  assert.equal(response.status, 400);
});

test("community event creation rejects malformed details before database access", async () => {
  const worker = await builtWorker();
  const response = await worker.fetch(
    new Request("http://localhost/api/community-events", {
      method: "POST",
      headers: { "content-type": "application/json", ...platformHeaders },
      body: JSON.stringify({ communityId: "example", title: "X", description: "Kısa", location: "", startsAt: "not-a-date" }),
    }),
    runtimeEnv,
    runtimeContext,
  );
  assert.equal(response.status, 400);
});

test("safety reports reject malformed entity types before database access", async () => {
  const worker = await builtWorker();
  const response = await worker.fetch(
    new Request("http://localhost/api/safety", {
      method: "POST",
      headers: { "content-type": "application/json", ...platformHeaders },
      body: JSON.stringify({ action: "report", entityType: "unknown", entityId: "example", reason: "spam" }),
    }),
    runtimeEnv,
    runtimeContext,
  );
  assert.equal(response.status, 400);
});
