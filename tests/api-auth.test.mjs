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
        "oai-authenticated-user-email": "student@omu.edu.tr",
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
        "oai-authenticated-user-email": "student@omu.edu.tr",
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
        "oai-authenticated-user-email": "student@omu.edu.tr",
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
      headers: { "oai-authenticated-user-email": "student@omu.edu.tr" },
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
      headers: { "oai-authenticated-user-email": "student@omu.edu.tr" },
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
      headers: { "oai-authenticated-user-email": "student@omu.edu.tr" },
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
        "oai-authenticated-user-email": "student@omu.edu.tr",
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
        "oai-authenticated-user-email": "student@omu.edu.tr",
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
        "oai-authenticated-user-email": "student@omu.edu.tr",
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
      headers: { "oai-authenticated-user-email": "student@omu.edu.tr" },
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
