import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import './mockIPC';
import { clearIpcMocks } from './mockIPC';
import { resetTestIdCounter } from './helpers';

afterEach(() => {
  clearIpcMocks();
  resetTestIdCounter();
});

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) =>
    ({
      matches: query.includes('dark'),
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) satisfies Partial<MediaQueryList>,
});

const localStorageMock = (() => {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key: string) => store.get(key) ?? null,
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    removeItem: (key: string) => {
      store.delete(key);
    },
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
  } as Storage;
})();

Object.defineProperty(window, 'localStorage', {
  writable: true,
  value: localStorageMock,
});

if (!HTMLElement.prototype.scrollIntoView) {
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: () => {},
  });
}

if (!globalThis.crypto?.randomUUID) {
  const cryptoObj = globalThis.crypto ?? {};
  Object.defineProperty(globalThis, 'crypto', {
    writable: true,
    value: {
      ...cryptoObj,
      randomUUID: () =>
        'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
          const rand = (Math.random() * 16) | 0;
          const value = char === 'x' ? rand : (rand & 0x3) | 0x8;
          return value.toString(16);
        }),
    },
  });
}
