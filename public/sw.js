/* Only public installation assets belong in this cache. Never add app pages,
   API responses, uploads, profile media, messages or session-bearing resources. */
const CACHE_PREFIX = "kampira-install-";
const CACHE_NAME = `${CACHE_PREFIX}v1`;
const OFFLINE_URL = "/offline.html";
const PUBLIC_ASSETS = new Map([
  [OFFLINE_URL, "text/html"],
  ["/manifest.webmanifest", "application/"],
  ["/app-icons/kampira-192.png", "image/png"],
  ["/app-icons/kampira-512.png", "image/png"],
  ["/app-icons/kampira-maskable-512.png", "image/png"],
  ["/app-icons/kampira-180.png", "image/png"],
]);

// Push payloads contain opaque IDs only. Account/session access is checked again
// on delivery and on click; no private response or credential is persisted.
let pushGeneration = 0;
const PUSH_ID = /^[A-Za-z0-9_-]{1,160}$/;
const PUSH_VIEWS = new Set(["feed", "discover", "messages", "pulse", "match", "campus", "library", "market", "notes", "communities", "notifications", "saved", "safety", "settings", "profile"]);
const PUSH_PARAMETERS = new Set(["view", "post", "comment", "profile", "conversation", "message", "listing", "event", "note", "community", "communityEvent", "meetup"]);

function pushHref(value) {
  if (typeof value !== "string" || value.length > 1024 || !value.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(value)) return null;
  try {
    const url = new URL(value, self.location.origin);
    if (url.origin !== self.location.origin || url.pathname !== "/" || url.hash || url.username || url.password) return null;
    for (const [key, part] of url.searchParams) if (!PUSH_PARAMETERS.has(key) || url.searchParams.getAll(key).length !== 1 || !PUSH_ID.test(part)) return null;
    if (url.searchParams.has("view") && !PUSH_VIEWS.has(url.searchParams.get("view"))) return null;
    return `${url.pathname}${url.search}`;
  } catch { return null; }
}

function pushIdentity(value) {
  if (!value || value.v !== 1 || ![value.notificationId, value.subscriptionId, value.accountId].every((id) => typeof id === "string" && PUSH_ID.test(id))) return null;
  return { v: 1, notificationId: value.notificationId, subscriptionId: value.subscriptionId, accountId: value.accountId };
}

async function currentPushReceipt(identity, purpose = "receive") {
  if (!await self.registration.pushManager.getSubscription()) return null;
  const query = new URLSearchParams({ notificationId: identity.notificationId, subscriptionId: identity.subscriptionId });
  if (purpose === "click") query.set("purpose", "click");
  const response = await fetch(`/api/push-subscriptions?${query}`, {
    credentials: "include", cache: "no-store", headers: { "X-Account-Context": identity.accountId },
  });
  if (!response.ok || response.redirected) return null;
  const { receipt } = await response.json();
  if (!receipt || receipt.accountId !== identity.accountId || receipt.notificationId !== identity.notificationId || receipt.subscriptionId !== identity.subscriptionId) return null;
  const href = pushHref(receipt.href);
  return href ? { ...identity, href } : null;
}

async function closePushNotifications(tag) {
  const notices = await self.registration.getNotifications(tag ? { tag } : undefined);
  for (const notice of notices) if (notice.tag.startsWith("kampira:")) notice.close();
}

self.addEventListener("push", (event) => {
  event.waitUntil((async () => {
    let payload;
    try { payload = event.data?.json(); } catch { return; }
    const identity = pushIdentity(payload);
    if (!identity) return;
    const generation = pushGeneration;
    try {
      const receipt = await currentPushReceipt(identity);
      if (!receipt || generation !== pushGeneration) return;
      const tag = `kampira:${identity.notificationId}`;
      await self.registration.showNotification("Kampira", {
        body: "Yeni bir bildirimin var.", tag, renotify: false,
        icon: "/app-icons/kampira-192.png", badge: "/app-icons/kampira-192.png", data: receipt,
      });
      if (generation !== pushGeneration) await closePushNotifications(tag);
    } catch { /* Offline, revoked and unknown receipts never display stale account notifications. */ }
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const identity = pushIdentity(event.notification.data);
    if (!identity) return;
    const generation = pushGeneration;
    try {
      const receipt = await currentPushReceipt(identity, "click");
      if (!receipt || generation !== pushGeneration) return;
      const href = new URL(receipt.href, self.location.origin).href;
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      if (generation !== pushGeneration) return;
      const candidates = windows.filter((client) => { try { const url = new URL(client.url); return url.origin === self.location.origin && url.pathname === "/"; } catch { return false; } });
      const client = candidates.find((item) => item.focused) || candidates[0];
      if (client) {
        const navigated = client.url === href ? client : await client.navigate(href);
        if (navigated && generation === pushGeneration) await navigated.focus();
      } else if (generation === pushGeneration) await self.clients.openWindow(href);
    } catch { /* A signed-out or inaccessible target stays closed. */ }
  })());
});

self.addEventListener("message", (event) => {
  if (!event.source?.url) return;
  try { if (new URL(event.source.url).origin !== self.location.origin) return; } catch { return; }
  if (event.data?.type === "KAMPIRA_PUSH_CHECK") { event.ports?.[0]?.postMessage({ pushVersion: 1 }); return; }
  if (event.data?.type !== "KAMPIRA_PUSH_CLEAR") return;
  pushGeneration++;
  event.waitUntil((async () => {
    await closePushNotifications();
    for (const client of await self.clients.matchAll({ type: "window" })) client.postMessage({ type: "KAMPIRA_PUSH_REVOKED" });
  })().catch(() => {}));
});

self.addEventListener("pushsubscriptionchange", (event) => {
  // Never silently enroll a new endpoint to whichever account happens to be open.
  // Refreshing requires explicit consent in the current account's preferences.
  pushGeneration++;
  event.waitUntil((async () => {
    await closePushNotifications();
    if (event.newSubscription) await event.newSubscription.unsubscribe();
    for (const client of await self.clients.matchAll({ type: "window" })) client.postMessage({ type: "KAMPIRA_PUSH_REFRESH_REQUIRED" });
  })().catch(() => {}));
});

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.all([...PUBLIC_ASSETS].map(async ([path, contentType]) => {
      const response = await fetch(new Request(path, { credentials: "omit", cache: "reload" }));
      if (!response.ok || response.redirected || !(response.headers.get("content-type") || "").startsWith(contentType)) {
        throw new Error(`Kampira public installation asset unavailable: ${path}`);
      }
      await cache.put(path, response);
    }));
    // Updates wait until existing tabs close, preserving unsaved drafts.
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME).map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  if (!url.search && PUBLIC_ASSETS.has(url.pathname)) {
    event.respondWith((async () => {
      const cached = await (await caches.open(CACHE_NAME)).match(url.pathname);
      return cached || fetch(request, { credentials: "omit", cache: "no-store" });
    })());
    return;
  }

  // All non-navigation requests, including authenticated API and media, bypass
  // this service worker. No response from those routes is cached or replayed.
  if (request.mode !== "navigate") return;
  // API/media downloads must retain their own error and authorization semantics.
  if (/^\/(?:api|_next|_vinext|uploads|files|media)(?:\/|$)/.test(url.pathname)) return;

  event.respondWith((async () => {
    try {
      return await fetch(request, { cache: "no-store" });
    } catch {
      const fallback = await (await caches.open(CACHE_NAME)).match(OFFLINE_URL);
      return fallback || new Response("Kampira'ya bağlanılamadı. İnternet bağlantını kontrol edip yeniden dene.", {
        status: 503,
        headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
      });
    }
  })());
});
