import { QuickDB } from 'quick.db';

/**
 * Ultra-High-Performance Zero-Latency In-Memory Database Engine
 * 
 * Provides true 0ms (sub-millisecond RAM) access for all database reads and writes
 * by maintaining an active write-through memory layer with non-blocking async SQLite persistence.
 */
export class FastDB {
    /**
     * @param {string | object | QuickDB} optionsOrInstance 
     */
    constructor(optionsOrInstance) {
        if (optionsOrInstance instanceof QuickDB) {
            this.raw = optionsOrInstance;
        } else if (typeof optionsOrInstance === 'string') {
            this.raw = new QuickDB({ filePath: optionsOrInstance });
        } else if (optionsOrInstance && typeof optionsOrInstance === 'object' && optionsOrInstance.filePath) {
            this.raw = new QuickDB(optionsOrInstance);
        } else if (optionsOrInstance && typeof optionsOrInstance.get === 'function') {
            this.raw = optionsOrInstance;
        } else {
            this.raw = new QuickDB();
        }

        this.memory = new Map();
        this.initialized = false;
        this.initPromise = null;
    }

    /**
     * Asynchronously pre-warms the in-memory cache from SQLite
     */
    async init() {
        if (this.initialized) return this;
        if (!this.initPromise) {
            this.initPromise = (async () => {
                try {
                    const allData = await this.raw.all();
                    if (Array.isArray(allData)) {
                        for (const item of allData) {
                            if (item && item.id !== undefined) {
                                this.memory.set(item.id, item.value);
                            }
                        }
                    }
                } catch {
                    // Safe fallback if database is empty or new
                }
                this.initialized = true;
                return this;
            })();
        }
        return this.initPromise;
    }

    /**
     * Resolves a nested property path on an object
     * @private
     */
    _getNested(obj, pathParts) {
        let current = obj;
        for (const part of pathParts) {
            if (current === null || current === undefined || typeof current !== 'object') {
                return undefined;
            }
            current = current[part];
        }
        return current;
    }

    /**
     * Sets a nested property path on an object
     * @private
     */
    _setNested(obj, pathParts, value) {
        let current = obj;
        for (let i = 0; i < pathParts.length - 1; i++) {
            const part = pathParts[i];
            if (current[part] === null || current[part] === undefined || typeof current[part] !== 'object') {
                current[part] = {};
            }
            current = current[part];
        }
        current[pathParts[pathParts.length - 1]] = value;
    }

    /**
     * Deletes a nested property path on an object
     * @private
     */
    _deleteNested(obj, pathParts) {
        let current = obj;
        for (let i = 0; i < pathParts.length - 1; i++) {
            const part = pathParts[i];
            if (current === null || current === undefined || typeof current !== 'object') {
                return;
            }
            current = current[part];
        }
        if (current && typeof current === 'object') {
            delete current[pathParts[pathParts.length - 1]];
        }
    }

    /**
     * 0ms RAM retrieval
     * @param {string} key 
     */
    async get(key) {
        if (!key) return null;
        if (!this.initialized) await this.init();

        if (key.includes('.')) {
            const parts = key.split('.');
            const rootKey = parts[0];
            const rootVal = this.memory.get(rootKey);
            if (rootVal !== undefined) {
                return this._getNested(rootVal, parts.slice(1));
            }
            const diskVal = await this.raw.get(key).catch(() => null);
            return diskVal;
        }

        if (this.memory.has(key)) {
            return this.memory.get(key);
        }

        // Cache miss (newly introduced key), fetch from disk & cache in RAM
        const diskVal = await this.raw.get(key).catch(() => null);
        this.memory.set(key, diskVal);
        return diskVal;
    }

    /**
     * 0ms RAM setter with non-blocking async SQLite persistence
     * @param {string} key 
     * @param {any} value 
     */
    async set(key, value) {
        if (!key) return value;
        if (!this.initialized) await this.init();

        if (key.includes('.')) {
            const parts = key.split('.');
            const rootKey = parts[0];
            let rootVal = this.memory.get(rootKey);
            if (rootVal === null || rootVal === undefined || typeof rootVal !== 'object') {
                rootVal = {};
            } else if (typeof rootVal === 'object' && !Array.isArray(rootVal)) {
                rootVal = { ...rootVal };
            }
            this._setNested(rootVal, parts.slice(1), value);
            this.memory.set(rootKey, rootVal);
        } else {
            this.memory.set(key, value);
        }

        // Write to SQLite asynchronously in background (0ms latency for caller)
        this.raw.set(key, value).catch(() => {});
        return value;
    }

    /**
     * 0ms RAM delete with non-blocking async SQLite persistence
     * @param {string} key 
     */
    async delete(key) {
        if (!key) return false;
        if (!this.initialized) await this.init();

        if (key.includes('.')) {
            const parts = key.split('.');
            const rootKey = parts[0];
            const rootVal = this.memory.get(rootKey);
            if (rootVal && typeof rootVal === 'object') {
                const cloned = { ...rootVal };
                this._deleteNested(cloned, parts.slice(1));
                this.memory.set(rootKey, cloned);
            }
        } else {
            this.memory.delete(key);
        }

        this.raw.delete(key).catch(() => {});
        return true;
    }

    /**
     * 0ms RAM key existence check
     * @param {string} key 
     */
    async has(key) {
        if (!key) return false;
        if (!this.initialized) await this.init();

        if (key.includes('.')) {
            const val = await this.get(key);
            return val !== undefined;
        }

        return this.memory.has(key);
    }

    /**
     * 0ms RAM retrieval of all table records
     * @returns {Promise<Array<{ id: string, value: any }>>}
     */
    async all() {
        if (!this.initialized) await this.init();

        const results = [];
        for (const [id, value] of this.memory.entries()) {
            results.push({ id, value });
        }
        return results;
    }

    /**
     * 0ms RAM array push
     * @param {string} key 
     * @param {any} value 
     */
    async push(key, value) {
        if (!this.initialized) await this.init();

        let current = await this.get(key);
        if (!Array.isArray(current)) {
            current = [];
        }
        current = [...current, value];
        await this.set(key, current);
        return current;
    }

    /**
     * 0ms RAM array pull
     * @param {string} key 
     * @param {any} value 
     */
    async pull(key, value) {
        if (!this.initialized) await this.init();

        let current = await this.get(key);
        if (!Array.isArray(current)) {
            return current;
        }
        current = current.filter(item => item !== value);
        await this.set(key, current);
        return current;
    }

    /**
     * Table support for namespaced tables
     * @param {string} tableName 
     */
    table(tableName) {
        return new FastDB(this.raw.table(tableName));
    }
}

export default FastDB;
