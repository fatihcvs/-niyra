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

for (const [label, path] of [
  ["note library", "/api/notes"],
  ["community directory", "/api/communities"],
  ["notification center", "/api/notifications"],
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
