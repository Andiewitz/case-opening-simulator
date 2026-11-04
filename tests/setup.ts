// Runs before any test module (and therefore before the handlers are imported),
// so the table names and config read at module load are deterministic.
process.env.TABLE_USERS = "test-users";
process.env.TABLE_INVENTORY = "test-inventory-items";
process.env.ALLOWED_ORIGINS = "http://localhost:3000";
// Off by default; the throttle has its own test that turns it on.
process.env.OPEN_COOLDOWN_MS = "0";

// Node 26 defines a `localStorage` global that is `undefined` unless the process
// is started with --localstorage-file. It shadows jsdom's implementation, and
// the browser code in src/ reads the bare global, so install a tiny in-memory
// Storage instead. Test-only: browsers always provide a real one.
if (typeof globalThis.localStorage === "undefined") {
  const store = new Map<string, string>();
  const memoryStorage = {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    removeItem: (key: string) => {
      store.delete(key);
    },
    setItem: (key: string, value: string) => {
      store.set(key, String(value));
    },
  };

  Object.defineProperty(globalThis, "localStorage", {
    value: memoryStorage as unknown as Storage,
    configurable: true,
    writable: true,
  });
}
