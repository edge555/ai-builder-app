import '@testing-library/jest-dom';
import { afterEach, beforeAll, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// Cleanup after each test
afterEach(() => {
    cleanup();
});

// Mock localStorage
const localStorageMock = (() => {
    let store: Record<string, string> = {};

    return {
        getItem: (key: string) => store[key] || null,
        setItem: (key: string, value: string) => {
            store[key] = value.toString();
        },
        removeItem: (key: string) => {
            delete store[key];
        },
        clear: () => {
            store = {};
        },
        get length() {
            return Object.keys(store).length;
        },
        key: (index: number) => {
            const keys = Object.keys(store);
            return keys[index] || null;
        },
    };
})();

Object.defineProperty(window, 'localStorage', {
    value: localStorageMock,
});

Object.defineProperty(window, 'sessionStorage', {
    value: localStorageMock,
});

// Mock matchMedia
Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(), // deprecated
        removeListener: vi.fn(), // deprecated
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
    })),
});

// Mock ResizeObserver
global.ResizeObserver = vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
}));

// Mock IntersectionObserver
global.IntersectionObserver = vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
    root: null,
    rootMargin: '',
    thresholds: [],
    takeRecords: () => [],
}));

// Mock IndexedDB
const indexedDBMock = (() => {
    const databases: Record<string, any> = {};

    return {
        open: vi.fn((name: string, version?: number) => {
            const request = {
                result: null as any,
                error: null,
                onsuccess: null as any,
                onerror: null as any,
                onupgradeneeded: null as any,
            };

            setTimeout(() => {
                if (!databases[name]) {
                    databases[name] = {
                        objectStoreNames: { contains: () => false },
                        createObjectStore: vi.fn((storeName: string) => ({
                            createIndex: vi.fn(),
                            name: storeName,
                        })),
                        transaction: vi.fn((storeNames: string | string[], mode?: string) => ({
                            objectStore: vi.fn((storeName: string) => ({
                                get: vi.fn(() => ({
                                    onsuccess: null,
                                    onerror: null,
                                    result: null,
                                })),
                                put: vi.fn(() => ({
                                    onsuccess: null,
                                    onerror: null,
                                })),
                                delete: vi.fn(() => ({
                                    onsuccess: null,
                                    onerror: null,
                                })),
                                getAll: vi.fn(() => ({
                                    onsuccess: null,
                                    onerror: null,
                                    result: [],
                                })),
                            })),
                        })),
                    };

                    if (request.onupgradeneeded) {
                        request.onupgradeneeded({ target: { result: databases[name] } } as any);
                    }
                }

                request.result = databases[name];
                if (request.onsuccess) {
                    request.onsuccess({ target: { result: databases[name] } } as any);
                }
            }, 0);

            return request;
        }),
        deleteDatabase: vi.fn((name: string) => {
            delete databases[name];
            return {
                onsuccess: null,
                onerror: null,
            };
        }),
    };
})();

Object.defineProperty(window, 'indexedDB', {
    value: indexedDBMock,
});

// Mock window.URL.createObjectURL
Object.defineProperty(window.URL, 'createObjectURL', {
    value: vi.fn(() => 'blob:mock-url'),
});

Object.defineProperty(window.URL, 'revokeObjectURL', {
    value: vi.fn(),
});

// Mock console methods to reduce noise in tests
beforeAll(() => {
    // Keep console.error for debugging but suppress console.log/warn in tests
    global.console = {
        ...console,
        log: vi.fn(),
        warn: vi.fn(),
        // Keep error for debugging
    };
});
