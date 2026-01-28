const DEFAULT_TTL = 315360000000; // 10 years

export type Setter<T> = T | Func<[T], T>;

export class TypedStorage<S extends Record<string, any>> {
  ttl: number;

  constructor(options?: { ttl?: number }) {
    this.ttl = options?.ttl ?? DEFAULT_TTL;
  }

  set<K extends keyof S>(
    key: K,
    value: Setter<S[K] | null>,
    ttl = DEFAULT_TTL,
  ) {
    type V = S[K] | null;
    try {
      let finalValue: V;
      if (typeof value === "function") {
        const currentValue = this.get(key);
        finalValue = (value as Func<[V], V>)(currentValue);
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

  get<K extends keyof S>(key: K, fallback?: undefined): S[K] | null;
  get<K extends keyof S>(key: K, fallback: S[K]): S[K];
  get<K extends keyof S>(key: K, fallback?: S[K] | undefined): S[K] | null {
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
