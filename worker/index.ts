/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { pushDispatchAuthorized, reportPushDispatchFailure, runPushDispatch } from "../lib/push-runtime";

interface Env {
  [binding: string]: unknown;
  ASSETS: Fetcher;
  DB: D1Database;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/__internal/push-dispatch") {
      if (request.method !== "POST" || !await pushDispatchAuthorized(request, env.PUSH_JOB_SECRET)) {
        return new Response(null, { status: 404, headers: { "cache-control": "no-store" } });
      }
      try {
        return Response.json(await runPushDispatch(env, 4), { headers: { "cache-control": "no-store" } });
      } catch {
        reportPushDispatchFailure();
        return new Response(null, { status: 503, headers: { "cache-control": "no-store" } });
      }
    }

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    const response = await handler.fetch(request, env, ctx);
    if (response.ok && url.pathname.startsWith("/api/") && ["POST", "PATCH", "PUT", "DELETE"].includes(request.method)) {
      ctx.waitUntil(runPushDispatch(env, 2).catch(reportPushDispatchFailure));
    }
    return response;
  },
  async scheduled(_event: unknown, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runPushDispatch(env, 20).catch(reportPushDispatchFailure));
  },
};

export default worker;
