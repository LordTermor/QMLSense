import * as vscode from 'vscode';
import * as path from 'path';
import { ModuleIndex, ModuleComponent } from '../moduleTypes';
import { ModuleExtractor } from './ModuleExtractor';
import { ModuleCache } from './ModuleCache';
import { ModuleWatcher } from './ModuleWatcher';
import { ModuleResolver } from './ModuleResolver';
import { QtBuiltinsLoader } from './QtBuiltinsLoader';
import { CacheStore } from '../cacheStore';

/**
 * Module indexing vertical slice.
 * Orchestrates extraction, caching, and watching of QML modules.
 */
export class ModuleIndexer {
    private extractor = new ModuleExtractor();
    private cache = new ModuleCache();
    private resolver = new ModuleResolver();
    private builtins = new QtBuiltinsLoader();
    private watcher?: ModuleWatcher;
    private persistentCache: CacheStore | null = null;

    async initialize(workspaceFolder?: vscode.WorkspaceFolder): Promise<void> {
        if (workspaceFolder) {
            try {
                this.persistentCache = new CacheStore(workspaceFolder);
                await this.persistentCache.initialize();
                
                const cachedModules = await this.persistentCache.loadAllModules();
                for (const module of cachedModules) {
                    this.cache.set(module.moduleName, module);
                }
                console.log(`[Module Indexer] Loaded ${cachedModules.length} modules from cache`);
                
                if (cachedModules.length > 0) {
                    const stats = await this.persistentCache.getStats();
                    console.log(`[Module Indexer] Cache stats: ${stats.modules} modules, ${stats.components} components`);
                }
            } catch (error) {
                console.error('[Module Indexer] Failed to load cache, will rebuild:', error);
                this.persistentCache = null;
            }
        }

        this.watcher = new ModuleWatcher({
            onQmldirChanged: async (uri) => { await this.indexQmldirFile(uri); },
            onQmldirCreated: async (uri) => { await this.indexQmldirFile(uri); },
            onQmldirDeleted: (uri) => this.handleQmldirDeleted(uri)
        });
        this.watcher.start();

        this.indexBuiltinModules();
    }

    /**
     * Load Qt builtin modules into cache.
     */
    private indexBuiltinModules(): void {
        const builtins = this.builtins.loadAllBuiltins();
        for (const module of builtins) {
            this.cache.set(module.moduleName, module);
        }
        console.log(`[Module Indexer] Indexed ${builtins.length} Qt builtin modules`);
    }

    /**
     * Index all qmldir files in workspace.
     */
    async indexWorkspaceModules(): Promise<void> {
        const config = vscode.workspace.getConfiguration('qml');
        const ignoreFolders = config.get<string[]>('indexing.ignoreFolders', [
            '**/node_modules/**',
            '**/build/**',
            '**/dist/**',
            '**/.git/**',
            '**/out/**'
        ]);
        
        const excludePattern = `{${ignoreFolders.join(',')}}`;
        const qmldirFiles = await vscode.workspace.findFiles('**/qmldir', excludePattern);
        
        console.log(`[Module Indexer] Found ${qmldirFiles.length} qmldir files`);
        
        let indexed = 0;
        let skipped = 0;
        
        for (const qmldirUri of qmldirFiles) {
            try {
                const wasIndexed = await this.indexQmldirFile(qmldirUri);
                if (wasIndexed) {
                    indexed++;
                } else {
                    skipped++;
                }
            } catch (error) {
                console.error(`[Module Indexer] Failed to index ${qmldirUri.fsPath}:`, error);
            }
        }

        console.log(`[Module Indexer] Indexed ${indexed} new/updated modules, skipped ${skipped} cached modules`);
    }

    /**
     * Index a single qmldir file.
     */
    async indexQmldirFile(qmldirUri: vscode.Uri): Promise<boolean> {
        const existing = this.cache.findByQmldirPath(qmldirUri.fsPath);
        if (existing) {
            console.log(`[Module Indexer] Skipping cached module "${existing.moduleName}" from ${qmldirUri.fsPath}`);
            return false;
        }

        const content = await vscode.workspace.fs.readFile(qmldirUri);
        const text = Buffer.from(content).toString('utf8');
        const entries = this.extractor.parse(text);

        let moduleName = '';
        const components = new Map<string, ModuleComponent>();
        const moduleDir = path.dirname(qmldirUri.fsPath);

        for (const entry of entries) {
            if (entry.type === 'module' && entry.moduleName && !entry.typeName) {
                moduleName = entry.moduleName;
            } else if (entry.type === 'module' && entry.typeName && entry.filePath) {
                const fullPath = path.join(moduleDir, entry.filePath);
                components.set(entry.typeName, {
                    name: entry.typeName,
                    filePath: fullPath,
                    isBuiltin: false,
                    isSingleton: false,
                    version: entry.version,
                });
            } else if (entry.type === 'singleton' && entry.typeName && entry.filePath) {
                const fullPath = path.join(moduleDir, entry.filePath);
                components.set(entry.typeName, {
                    name: entry.typeName,
                    filePath: fullPath,
                    isBuiltin: false,
                    isSingleton: true,
                    version: entry.version,
                });
            }
        }

        if (!moduleName) {
            moduleName = this.resolver.inferModuleName(moduleDir);
        }

        if (moduleName && components.size > 0) {
            const moduleIndex: ModuleIndex = {
                moduleName,
                version: '1.0',
                components,
                qmldirPath: qmldirUri.fsPath,
            };

            this.cache.set(moduleName, moduleIndex);
            
            if (this.persistentCache) {
                await this.persistentCache.saveModule(moduleIndex);
            }
            
            console.log(`[Module Indexer] Indexed module "${moduleName}" with ${components.size} components from ${qmldirUri.fsPath}`);
            return true;
        } else if (components.size === 0) {
            console.warn(`[Module Indexer] qmldir at ${qmldirUri.fsPath} has no component declarations`);
        }
        
        return false;
    }

    /**
     * Resolve module by name with suffix matching.
     */
    resolveModule(moduleName: string, version?: string): ModuleIndex | null {
        const cacheKey = version ? `${moduleName}@${version}` : moduleName;
        
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }

        if (this.cache.has(moduleName)) {
            return this.cache.get(moduleName);
        }

        for (const cachedName of this.cache.getModuleNames()) {
            if (this.resolver.matchesModuleName(cachedName, moduleName)) {
                return this.cache.get(cachedName);
            }
        }

        if (this.builtins.isBuiltin(moduleName)) {
            return this.builtins.getModule(moduleName, version);
        }

        return null;
    }

    /**
     * Resolve component within a module.
     */
    resolveComponent(moduleName: string, componentName: string, version?: string): ModuleComponent | null {
        const module = this.resolveModule(moduleName, version);
        if (!module) return null;

        return module.components.get(componentName) ?? null;
    }

    /**
     * Get all indexed modules.
     */
    getAllModules(): ModuleIndex[] {
        return this.cache.getAll();
    }

    /**
     * Find which module (if any) contains the given file.
     * Looks up the file in the components registry.
     */
    async findModuleForFile(filePath: string): Promise<ModuleIndex | null> {
        if (this.persistentCache) {
            const module = await this.persistentCache.findModuleByFilePath(filePath);
            if (module) {
                return module;
            }
        }

        for (const module of this.cache.getAll()) {
            for (const component of module.components.values()) {
                if (component.filePath === filePath) {
                    return module;
                }
            }
        }
        
        return null;
    }

    /**
     * Clear all caches.
     */
    async clearCache(): Promise<void> {
        this.cache.clear();
        if (this.persistentCache) {
            await this.persistentCache.clearCache();
        }
        console.log('[Module Indexer] Cache cleared');
    }

    dispose(): void {
        this.watcher?.dispose();
        if (this.persistentCache) {
            this.persistentCache.dispose();
        }
    }

    // ========================================================================
    // Private: Event Handlers
    // ========================================================================

    private handleQmldirDeleted(uri: vscode.Uri): void {
        const existing = this.cache.findByQmldirPath(uri.fsPath);
        if (existing) {
            this.cache.remove(existing.moduleName);
            console.log(`[Module Indexer] Removed module "${existing.moduleName}" (qmldir deleted)`);
        }
    }
}
