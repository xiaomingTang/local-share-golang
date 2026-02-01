import ky, { HTTPError, TimeoutError, type Options } from "ky";

import { getWebToken, setWebToken } from "@common/storage/web-token";
import { ensureShareToken } from "./auth";

export class ApiError extends Error {
  status?: number;
  code?: string;
  payload?: any;
  response?: Response;

  constructor(
    message: string,
    opts?: {
      status?: number;
      code?: string;
      payload?: any;
      response?: Response;
    },
  ) {
    super(message);
    this.name = "ApiError";
    this.status = opts?.status;
    this.code = opts?.code;
    this.payload = opts?.payload;
    this.response = opts?.response;
  }
}

/**
 * Optional override for running the web UI against a remote server.
 * - In Wails / embedded contexts, keep it empty to preserve relative "/api" behavior.
 */
const API_BASE_URL = String((import.meta as any)?.env?.VITE_API_BASE_URL || "")
  .trim()
  .replace(/\/+$/, "");

export function apiUrl(path: string): string {
  if (!API_BASE_URL) return path;
  if (/^https?:\/\//i.test(path)) return path;
  if (!path.startsWith("/")) return `${API_BASE_URL}/${path}`;
  return `${API_BASE_URL}${path}`;
}

function maybeRewriteToBaseUrl(request: Request): Request {
  if (!API_BASE_URL) return request;

  const raw = String(request.url || "");
  if (raw.startsWith(API_BASE_URL)) return request;

  try {
    const u = new URL(raw);
    // Only rewrite our API calls; leave other assets alone.
    if (!u.pathname.startsWith("/api/")) return request;
    const rewritten = apiUrl(u.pathname + u.search);
    return new Request(rewritten, request);
  } catch {
    // If request.url isn't a full URL, don't rewrite.
    return request;
  }
}

function isAuthEndpoint(url: string): boolean {
  try {
    const u = new URL(url, "http://localhost");
    return u.pathname === "/api/auth";
  } catch {
    return url.includes("/api/auth");
  }
}

async function parseErrorPayload(
  response: Response,
): Promise<{ payload: any; message: string; code?: string }> {
  const ct = (response.headers.get("content-type") || "").toLowerCase();
  if (ct.includes("application/json")) {
    const payload = (await response
      .clone()
      .json()
      .catch(() => null)) as any;
    const message = String(payload?.error || payload?.message || "请求失败");
    const code = payload?.code ? String(payload.code) : undefined;
    return { payload, message, code };
  }

  const text = await response
    .clone()
    .text()
    .catch(() => "");
  return { payload: text, message: text || `请求失败: ${response.status}` };
}

const DEFAULT_TIMEOUT_MS = 15_000;

/**
 * ky client with:
 * - baseURL support (optional)
 * - X-Share-Token injection
 * - unified error mapping
 * - 401 -> prompt access pass -> retry once
 */
export const http = ky.create({
  timeout: DEFAULT_TIMEOUT_MS,
  hooks: {
    beforeRequest: [
      (request) => {
        request = maybeRewriteToBaseUrl(request);
        const token = getWebToken();
        if (token && !request.headers.has("X-Share-Token")) {
          try {
            request.headers.set("X-Share-Token", token);
          } catch {
            // ignore
          }
        }

        return request;
      },
    ],
    afterResponse: [
      async (request, options, response) => {
        const alreadyRetried = (() => {
          const h = (options.headers || request.headers) as any;
          try {
            if (h instanceof Headers) return h.get("X-Auth-Retry") === "1";
          } catch {}
          return false;
        })();

        if (
          response.status === 401 &&
          !alreadyRetried &&
          !isAuthEndpoint(String(request.url))
        ) {
          setWebToken("");
          await ensureShareToken();

          const retryHeaders = new Headers(
            (options.headers as any) || request.headers,
          );
          retryHeaders.set("X-Auth-Retry", "1");
          const token = getWebToken();
          if (token) retryHeaders.set("X-Share-Token", token);

          const retryOptions: Options = {
            ...(options as any),
            headers: retryHeaders,
          };

          return http(String(request.url), retryOptions);
        }

        if (response.ok) return response;

        const { payload, message, code } = await parseErrorPayload(response);
        throw new ApiError(message, {
          status: response.status,
          code,
          payload,
          response,
        });
      },
    ],
  },
});

export function normalizeHttpError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;

  if (err instanceof TimeoutError) {
    return new ApiError("请求超时", { code: "TIMEOUT" });
  }

  if (err instanceof HTTPError) {
    // Should be rare since we throw our own ApiError in afterResponse.
    return new ApiError(`请求失败: ${err.response.status}`, {
      status: err.response.status,
      response: err.response,
    });
  }

  const anyErr = err as any;
  if (anyErr?.name === "AbortError") {
    return new ApiError("请求已取消", { code: "ABORTED" });
  }

  return new ApiError(anyErr?.message || "请求失败");
}
