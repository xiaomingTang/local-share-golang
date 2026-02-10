import { getWebToken } from "../web-token";
import { hasWailsSettingsBridge } from "./settingsBridge";

type SettingsChangeListener = (value: unknown) => void;

const settingsListeners = new Map<string, Set<SettingsChangeListener>>();
let settingsEs: EventSource | null = null;
let settingsEsToken = "";
let tokenListenerBound = false;

function buildEventsUrl() {
  const token = getWebToken();
  if (!token) return "/api/events";
  return `/api/events?token=${encodeURIComponent(token)}`;
}

function onSettingsChanged(ev: MessageEvent) {
  let payload: { key?: string; value?: unknown } = {};
  try {
    payload = JSON.parse(String(ev.data || "{}")) as {
      key?: string;
      value?: unknown;
    };
  } catch {
    return;
  }
  const key = typeof payload.key === "string" ? payload.key : "";
  if (!key) return;
  const listeners = settingsListeners.get(key);
  if (!listeners || listeners.size === 0) return;
  for (const listener of listeners) {
    listener(payload.value);
  }
}

function connectSettingsEvents() {
  if (typeof window === "undefined") return;
  if (typeof window.EventSource === "undefined") return;
  if (hasWailsSettingsBridge()) return;

  const token = getWebToken();
  if (settingsEs && settingsEsToken === token) return;
  if (settingsEs) {
    settingsEs.close();
  }
  settingsEsToken = token;
  settingsEs = new EventSource(buildEventsUrl());
  settingsEs.addEventListener("settingsChanged", onSettingsChanged);
}

function ensureSettingsEvents() {
  if (typeof window === "undefined") return;
  if (!tokenListenerBound) {
    tokenListenerBound = true;
    window.addEventListener("webTokenChanged", () => {
      if (settingsEs) {
        settingsEs.close();
        settingsEs = null;
      }
      connectSettingsEvents();
    });
  }
  connectSettingsEvents();
}

function countSettingsListeners() {
  let total = 0;
  for (const set of settingsListeners.values()) {
    total += set.size;
  }
  return total;
}

export function addSettingsListener(
  key: string,
  listener: SettingsChangeListener,
) {
  const set = settingsListeners.get(key) ?? new Set<SettingsChangeListener>();
  set.add(listener);
  settingsListeners.set(key, set);
  ensureSettingsEvents();
}

export function removeSettingsListener(
  key: string,
  listener: SettingsChangeListener,
) {
  const set = settingsListeners.get(key);
  if (!set) return;
  set.delete(listener);
  if (set.size === 0) {
    settingsListeners.delete(key);
  }
  if (countSettingsListeners() === 0 && settingsEs) {
    settingsEs.close();
    settingsEs = null;
  }
}
