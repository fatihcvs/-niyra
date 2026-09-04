type D1Value = null | string | number | ArrayBuffer | ArrayBufferView;

interface D1Result<T = Record<string, unknown>> {
  results: T[];
  success: boolean;
  error?: string;
  meta: Record<string, unknown>;
}

type D1Response = D1Result;

interface D1PreparedStatement {
  bind(...values: D1Value[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(columnName?: string): Promise<T | null>;
  run<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  raw<T extends unknown[] = unknown[]>(options?: { columnNames?: boolean }): Promise<T[]>;
}

interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = Record<string, unknown>>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
  exec(query: string): Promise<{ count: number; duration: number }>;
  dump(): Promise<ArrayBuffer>;
}

interface Fetcher {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

interface R2ObjectBody {
  body: ReadableStream<Uint8Array>;
  size: number;
  httpEtag: string;
  writeHttpMetadata(headers: Headers): void;
}

interface R2Bucket {
  put(
    key: string,
    value: ArrayBuffer | ArrayBufferView | ReadableStream,
    options?: {
      httpMetadata?: { contentType?: string; contentDisposition?: string };
      customMetadata?: Record<string, string>;
    },
  ): Promise<unknown>;
  get(key: string, options?: { range?: { offset: number; length: number } }): Promise<R2ObjectBody | null>;
  delete(key: string): Promise<void>;
}

declare module "cloudflare:workers" {
  export const env: {
    DB: D1Database;
    FILES?: R2Bucket;
    ASSETS?: Fetcher;
    [binding: string]: unknown;
  };
}
