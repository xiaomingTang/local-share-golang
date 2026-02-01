import NiceModal from "@ebay/nice-modal-react";

import { AccessPassDialog } from "../components/AccessPassDialog";
import { getWebToken, setWebToken } from "@common/storage/web-token";

let inflightEnsure: Promise<string> | null = null;

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
  if (inflightEnsure) return inflightEnsure;

  inflightEnsure = (async () => {
    // Probe: if auth is disabled, /api/auth with empty pass returns {token:""}.
    try {
      const t = await requestAuthToken("");
      if (!t) {
        setWebToken("");
        return "";
      }
      // Unlikely: server returns token even for empty pass.
      setWebToken(t);
      return t;
    } catch (e: any) {
      if (e?.status !== 401) throw e;
    }

    let lastMsg = "该共享已启用访问口令。请输入口令后继续。口令不会被保存。";
    for (let attempt = 0; attempt < 3; attempt++) {
      const pass = (await NiceModal.show(AccessPassDialog, {
        title: "需要访问口令",
        description: lastMsg,
      })) as string;

      try {
        const token = await requestAuthToken(pass);
        setWebToken(token);
        return token;
      } catch (e: any) {
        if (e?.status === 401) {
          lastMsg = e?.message || "访问口令错误，请重试。";
          continue;
        }
        throw e;
      }
    }

    throw new Error("访问口令错误次数过多");
  })();

  try {
    return await inflightEnsure;
  } finally {
    inflightEnsure = null;
  }
}
