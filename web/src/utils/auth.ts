import NiceModal from "@ebay/nice-modal-react";

import { AccessPassDialog } from "src/components/AccessPassDialog";
import { getWebToken, setWebToken } from "common/storage/web-token";
import { SilentError } from "common/error/silent-error";

let inflightEnsure: Promise<string> | null = null;

// When user explicitly dismisses the access-pass dialog, avoid immediately
// re-prompting due to subsequent background requests (e.g. SWR/StrictMode).
const AUTH_DENY_COOLDOWN_MS = 3_000;
let authDeniedUntil = 0;

function markAuthDeniedCooldown() {
  authDeniedUntil = Date.now() + AUTH_DENY_COOLDOWN_MS;
}

function clearAuthDeniedCooldown() {
  authDeniedUntil = 0;
}

export function withTokenQuery(url: string): string {
  const token = getWebToken();
  if (!token) return url;

  const hasQuery = url.includes("?");
  const sep = hasQuery ? "&" : "?";
  return `${url}${sep}token=${encodeURIComponent(token)}`;
}

async function requestAuthToken(pass: string): Promise<string> {
  const resp = await fetch("/api/auth", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ pass }),
  });

  const ct = (resp.headers.get("content-type") || "").toLowerCase();
  const payload = ct.includes("application/json")
    ? ((await resp.json().catch(() => null)) as any)
    : null;

  if (!resp.ok) {
    const msg = payload?.error || `鉴权失败: ${resp.status}`;
    const err = new Error(msg) as Error & {
      status?: number;
      code?: string;
      retryAfter?: number;
    };
    err.status = resp.status;
    err.code = payload?.code;
    err.retryAfter = payload?.retryAfter;
    throw err;
  }

  return String(payload?.token || "");
}

/**
 * 确保获取到可用 token。
 * - 若服务端未启用口令：返回 ""。
 * - 若已启用：弹窗让用户输入口令并换票。
 */
export async function ensureShareToken(): Promise<string> {
  const token = getWebToken();
  if (token) return token;
  if (Date.now() < authDeniedUntil) {
    throw new SilentError("未授权访问");
  }
  if (inflightEnsure) return inflightEnsure;

  inflightEnsure = (async () => {
    // Probe: if auth is disabled, /api/auth with empty pass returns {token:""}.
    try {
      const t = (await requestAuthToken("")) || "";
      setWebToken(t);
      clearAuthDeniedCooldown();
      return t;
    } catch (e: any) {
      if (e?.status !== 401) throw e;
    }

    let token = "";
    try {
      await NiceModal.show(AccessPassDialog, {
        onSave: async (p: string) => {
          token = await requestAuthToken(p);
          setWebToken(token);
          clearAuthDeniedCooldown();
        },
      });
    } catch (e: any) {
      // User manually closed/cancelled the dialog.
      if (e instanceof SilentError) {
        markAuthDeniedCooldown();
      }
      throw e;
    }
    return token;
  })();

  try {
    return await inflightEnsure;
  } finally {
    inflightEnsure = null;
  }
}
