export const SHARE_TOKEN_KEY = "localshare.web.shareToken.v1";

let cachedToken: string =
  typeof window === "undefined"
    ? ""
    : (() => {
        try {
          return sessionStorage.getItem(SHARE_TOKEN_KEY) || "";
        } catch {
          return "";
        }
      })();

export function getWebToken() {
  return cachedToken || "";
}

export function setWebToken(token: string) {
  if (typeof window === "undefined") {
    return;
  }
  const next = (token || "").trim();
  if (next) {
    sessionStorage.setItem(SHARE_TOKEN_KEY, next);
  } else {
    sessionStorage.removeItem(SHARE_TOKEN_KEY);
  }
  cachedToken = next;
  window.dispatchEvent(new Event("webTokenChanged"));
}
