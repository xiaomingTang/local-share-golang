const DEFAULT_TTL = 315360000000; // 10 years

export class TypedStorage<S extends Record<string, any>> {
  ttl: number;

  constructor(options?: { ttl?: number }) {
    this.ttl = options?.ttl ?? DEFAULT_TTL;
  }

  set<K extends keyof S>(
    key: K,
    value: S[K] | Func<[S[K] | null], S[K] | null>,
    ttl = DEFAULT_TTL,
  ) {
    try {
      let finalValue: S[K] | null;
      if (typeof value === "function") {
        const currentValue = this.get(key);
        finalValue = (value as Func<[S[K] | null], S[K] | null>)(currentValue);
      } else {
        finalValue = value;
      }
      if (finalValue === null || finalValue === undefined) {
        localStorage.removeItem(String(key));
        return;
      }
      localStorage.setItem(
        String(key),
        JSON.stringify({ value: finalValue, expires: Date.now() + ttl }),
      );
    } catch (error) {
      // ignore
    }
  }

  get<K extends keyof S>(key: K): S[K] | null;
  get<K extends keyof S>(key: K, fallback: S[K]): S[K];
  get<K extends keyof S>(key: K, fallback?: S[K]): S[K] | null {
    try {
      const raw = localStorage.getItem(String(key));
      if (!raw) return fallback ?? null;
      const { value, expires } = JSON.parse(raw);
      if (Date.now() > expires) {
        localStorage.removeItem(String(key));
        return fallback ?? null;
      }
      return value ?? fallback ?? null;
    } catch (error) {
      return fallback ?? null;
    }
  }
}
