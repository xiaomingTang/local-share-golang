export function hasWailsSettingsBridge(): boolean {
  const w = globalThis as any;
  return Boolean(w?.go?.main?.App?.GetSetting && w?.go?.main?.App?.SetSetting);
}
