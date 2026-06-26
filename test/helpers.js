import { vi } from 'vitest';

// Minimal in-memory stand-in for a Cloudflare KV namespace.
export function fakeKV() {
  const store = new Map();
  return {
    store,
    get: vi.fn(async (key, type) => {
      const v = store.get(key);
      if (v == null) return null;
      return type === 'json' ? JSON.parse(v) : v;
    }),
    put: vi.fn(async (key, value) => {
      store.set(key, value);
    }),
  };
}

export function baseEnv(overrides = {}) {
  return {
    KV: fakeKV(),
    SLACK_BOT_TOKEN: 'xoxb-test',
    SLACK_CHANNEL: 'C123',
    CHECKIN_EMOJI: 'white_check_mark',
    CHECKIN_MESSAGE: 'React to check in',
    TIMEZONE: 'Europe/Oslo',
    ...overrides,
  };
}
