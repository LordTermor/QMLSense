import { ModuleIndex } from '../moduleTypes';

/**
 * In-memory cache for module indices.
 */
export class ModuleCache {
    private cache = new Map<string, ModuleIndex>();

    /**
     * Get module by name.
     */
    get(moduleName: string): ModuleIndex | null {
        return this.cache.get(moduleName) ?? null;
    }

    /**
     * Store module in cache.
     */
    set(moduleName: string, module: ModuleIndex): void {
        this.cache.set(moduleName, module);
    }

    /**
     * Check if module is cached.
     */
    has(moduleName: string): boolean {
        return this.cache.has(moduleName);
    }

    /**
     * Remove module from cache.
     */
    remove(moduleName: string): void {
        this.cache.delete(moduleName);
    }

    /**
     * Find module by qmldir path.
     */
    findByQmldirPath(qmldirPath: string): ModuleIndex | null {
        for (const module of this.cache.values()) {
            if (module.qmldirPath === qmldirPath) {
                return module;
            }
        }
        return null;
    }

    /**
     * Get all cached modules.
     */
    getAll(): ModuleIndex[] {
        return Array.from(this.cache.values());
    }

    /**
     * Clear entire cache.
     */
    clear(): void {
        this.cache.clear();
    }

    /**
     * Get cache size.
     */
    size(): number {
        return this.cache.size;
    }

    /**
     * Get all module names.
     */
    getModuleNames(): string[] {
        return Array.from(this.cache.keys());
    }
}
