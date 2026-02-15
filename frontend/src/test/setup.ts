import '@testing-library/jest-dom';
import { cleanup } from '@testing-library/react';

// Note: afterEach, beforeAll, and vi are globally available due to globals: true in vitest.config.ts

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
    const databases: Record<string, {
        version: number;
        stores: Record<string, {
            data: Map<string, any>;
            keyPath: string | string[];
            indexes: Record<string, { keyPath: string }>;
        }>;
    }> = {};

    const createRequest = (result: any = null, autoFire: boolean = true) => {
        const req: any = {
            result,
            error: null,
            onsuccess: null,
            onerror: null,
            readyState: 'pending',
        };
        if (autoFire) {
            setTimeout(() => {
                req.readyState = 'done';
                if (req.onsuccess) req.onsuccess({ target: req });
            }, 0);
        }
        return req;
    };

    return {
        open: vi.fn((name: string, version: number = 1) => {
            const request: any = {
                result: null,
                error: null,
                onsuccess: null,
                onerror: null,
                onupgradeneeded: null,
            };

            setTimeout(() => {
                let dbState = databases[name];
                const isNew = !dbState;
                const isUpgrade = dbState && dbState.version < version;

                if (!dbState) {
                    dbState = { version, stores: {} };
                    databases[name] = dbState;
                }

                const dbMock: any = {
                    version: dbState.version,
                    objectStoreNames: {
                        contains: (sName: string) => !!dbState.stores[sName],
                    },
                    createObjectStore: vi.fn((sName: string, options: any = {}) => {
                        dbState.stores[sName] = {
                            data: new Map(),
                            keyPath: options.keyPath || 'id',
                            indexes: {},
                        };
                        const storeMock: any = {
                            name: sName,
                            createIndex: vi.fn((idxName: string, keyPath: string) => {
                                dbState.stores[sName].indexes[idxName] = { keyPath };
                            }),
                        };
                        return storeMock;
                    }),
                    transaction: vi.fn((_storeNames: string | string[]) => {
                        return {
                            objectStore: vi.fn((sName: string) => {
                                const store = dbState.stores[sName];
                                if (!store) throw new Error(`Store ${sName} not found`);

                                const getKeyValue = (val: any) => {
                                    if (Array.isArray(store.keyPath)) {
                                        return JSON.stringify(store.keyPath.map(k => val[k]));
                                    }
                                    return val[store.keyPath as string];
                                };

                                const storeOps: any = {
                                    get: vi.fn((key: any) => createRequest(store.data.get(key))),
                                    put: vi.fn((val: any) => {
                                        store.data.set(getKeyValue(val), val);
                                        return createRequest(getKeyValue(val));
                                    }),
                                    delete: vi.fn((key: any) => {
                                        store.data.delete(key);
                                        return createRequest();
                                    }),
                                    getAll: vi.fn((query: any) => {
                                        let results = Array.from(store.data.values());
                                        if (query) {
                                            results = results.filter(v => v[store.keyPath as string] === query);
                                        }
                                        return createRequest(results);
                                    }),
                                    openCursor: vi.fn(() => {
                                        const results = Array.from(store.data.values());
                                        let index = 0;
                                        const cursorRequest = createRequest(null, false);

                                        const next = () => {
                                            if (index < results.length) {
                                                const cursor = {
                                                    value: results[index],
                                                    delete: () => store.data.delete(getKeyValue(results[index])),
                                                    update: (v: any) => store.data.set(getKeyValue(v), v),
                                                    continue: () => {
                                                        index++;
                                                        next();
                                                    }
                                                };
                                                cursorRequest.result = cursor;
                                                if (cursorRequest.onsuccess) cursorRequest.onsuccess({ target: cursorRequest });
                                            } else {
                                                cursorRequest.result = null;
                                                if (cursorRequest.onsuccess) cursorRequest.onsuccess({ target: cursorRequest });
                                            }
                                        };
                                        setTimeout(next, 0);
                                        return cursorRequest;
                                    }),
                                    index: vi.fn((idxName: string) => {
                                        const idx = store.indexes[idxName];
                                        return {
                                            getAll: vi.fn((val: any) => {
                                                const results = Array.from(store.data.values()).filter(v => v[idx.keyPath] === val);
                                                return createRequest(results);
                                            }),
                                            openCursor: vi.fn((range: any) => {
                                                const targetVal = range?._only;
                                                const results = Array.from(store.data.values()).filter(v => !targetVal || v[idx.keyPath] === targetVal);
                                                let index = 0;
                                                const cursorRequest = createRequest(null, false);
                                                const next = () => {
                                                    if (index < results.length) {
                                                        const cursor = {
                                                            value: results[index],
                                                            delete: () => store.data.delete(getKeyValue(results[index])),
                                                            continue: () => {
                                                                index++;
                                                                next();
                                                            }
                                                        };
                                                        cursorRequest.result = cursor;
                                                        if (cursorRequest.onsuccess) cursorRequest.onsuccess({ target: cursorRequest });
                                                    } else {
                                                        cursorRequest.result = null;
                                                        if (cursorRequest.onsuccess) cursorRequest.onsuccess({ target: cursorRequest });
                                                    }
                                                };
                                                setTimeout(next, 0);
                                                return cursorRequest;
                                            })
                                        };
                                    })
                                };
                                return storeOps;
                            }),
                            oncomplete: null,
                            onerror: null,
                        };
                    }),
                    close: vi.fn(),
                };

                if (isNew || isUpgrade) {
                    if (request.onupgradeneeded) {
                        request.onupgradeneeded({
                            target: { result: dbMock, transaction: dbMock.transaction(Object.keys(dbState.stores)) },
                            oldVersion: isNew ? 0 : dbState.version,
                            newVersion: version
                        } as any);
                    }
                }

                dbState.version = version;
                request.result = dbMock;
                if (request.onsuccess) request.onsuccess({ target: request });
            }, 0);

            return request;
        }),
        deleteDatabase: vi.fn((name: string) => {
            delete databases[name];
            return createRequest();
        }),
    };
})();

// Helper for IDBKeyRange
(global as any).IDBKeyRange = {
    only: (val: any) => ({ _only: val }),
    lowerBound: (val: any) => ({ _lower: val }),
    upperBound: (val: any) => ({ _upper: val }),
};

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
