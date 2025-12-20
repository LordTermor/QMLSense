import * as vscode from 'vscode';
import * as path from 'path';
import { Module, Component, QmldirEntry } from './types';
import type { CacheStore } from './CacheStore';

/**
 * Module indexer - parses qmldir files and loads Qt builtins.
 * Handles module resolution and component lookups.
 */
export class ModuleIndexer {
    private modules = new Map<string, Module>();
    private watcher?: vscode.FileSystemWatcher;

    constructor(private cache: CacheStore) {}

    async initialize(): Promise<void> {
        const cached = await this.cache.loadAllModules();
        for (const module of cached) {
            this.modules.set(module.name, module);
        }
        console.log(`[Modules] Loaded ${cached.length} from cache`);

        this.loadQtBuiltins();
        this.startWatching();
    }

    async indexWorkspace(): Promise<void> {
        console.log('[Modules] Starting indexing...');
        
        const config = vscode.workspace.getConfiguration('qml');
        const ignore = config.get<string[]>('indexing.ignoreFolders', [
            '**/node_modules/**', '**/build/**', '**/dist/**', '**/.git/**', '**/out/**'
        ]);
        
        const qmldirFiles = await vscode.workspace.findFiles('**/qmldir', `{${ignore.join(',')}}`);
        console.log(`[Modules] Found ${qmldirFiles.length} qmldir files`);
        
        let indexed = 0;
        for (const uri of qmldirFiles) {
            const wasNew = await this.indexQmldir(uri);
            if (wasNew) indexed++;
        }

        console.log(`[Modules] Indexed ${indexed} new modules`);
    }

    async indexQmldir(uri: vscode.Uri): Promise<boolean> {
        const existing = Array.from(this.modules.values()).find(m => m.qmldirPath === uri.fsPath);
        if (existing) {
            return false;
        }

        try {
            const bytes = await vscode.workspace.fs.readFile(uri);
            const text = Buffer.from(bytes).toString('utf8');
            const entries = this.parseQmldir(text);

            let moduleName = '';
            const components = new Map<string, Component>();
            const moduleDir = path.dirname(uri.fsPath);

            for (const entry of entries) {
                if (entry.type === 'module' && entry.moduleName && !entry.typeName) {
                    moduleName = entry.moduleName;
                } else if (entry.type === 'component' && entry.typeName && entry.filePath) {
                    components.set(entry.typeName, {
                        name: entry.typeName,
                        filePath: path.join(moduleDir, entry.filePath),
                        isBuiltin: false,
                        isSingleton: false,
                        version: entry.version
                    });
                } else if (entry.type === 'singleton' && entry.typeName && entry.filePath) {
                    components.set(entry.typeName, {
                        name: entry.typeName,
                        filePath: path.join(moduleDir, entry.filePath),
                        isBuiltin: false,
                        isSingleton: true,
                        version: entry.version
                    });
                }
            }

            if (!moduleName) {
                moduleName = path.basename(moduleDir);
            }

            if (components.size > 0) {
                const module: Module = {
                    name: moduleName,
                    version: '1.0',
                    qmldirPath: uri.fsPath,
                    components
                };

                this.modules.set(moduleName, module);
                await this.cache.saveModule(module);
                
                console.log(`[Modules] Indexed "${moduleName}" with ${components.size} components`);
                return true;
            }
        } catch (error) {
            console.error(`[Modules] Failed to parse ${uri.fsPath}:`, error);
        }

        return false;
    }

    resolveModule(name: string, version?: string): Module | null {
        if (this.modules.has(name)) {
            return this.modules.get(name)!;
        }

        for (const [cachedName, module] of this.modules) {
            if (this.matchesModuleName(cachedName, name)) {
                return module;
            }
        }

        return null;
    }

    resolveComponent(moduleName: string, componentName: string, version?: string): Component | null {
        const module = this.resolveModule(moduleName, version);
        return module?.components.get(componentName) ?? null;
    }

    getAllModules(): Module[] {
        return Array.from(this.modules.values());
    }

    clearCache(): void {
        this.modules.clear();
    }

    dispose(): void {
        this.watcher?.dispose();
        this.modules.clear();
    }

    // Qmldir parsing
    private parseQmldir(content: string): QmldirEntry[] {
        const entries: QmldirEntry[] = [];
        const lines = content.split('\n');

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) continue;

            const parts = trimmed.split(/\s+/);
            if (parts.length === 0) continue;

            const keyword = parts[0];

            if (keyword === 'module') {
                entries.push({ type: 'module', moduleName: parts[1] });
            } else if (keyword === 'singleton' && parts.length >= 4) {
                entries.push({
                    type: 'singleton',
                    typeName: parts[1],
                    version: parts[2],
                    filePath: parts[3]
                });
            } else if (parts.length >= 3) {
                entries.push({
                    type: 'component',
                    typeName: parts[0],
                    version: parts[1],
                    filePath: parts[2]
                });
            }
        }

        return entries;
    }

    // Module name matching with suffix support
    private matchesModuleName(cached: string, requested: string): boolean {
        if (cached === requested) return true;
        
        const parts = cached.split('.');
        const reqParts = requested.split('.');
        
        if (parts.length < reqParts.length) return false;
        
        return parts.slice(-reqParts.length).join('.') === requested;
    }

    // Qt builtins
    private loadQtBuiltins(): void {
        try {
            const builtinsPath = path.join(__dirname, '..', 'indexer', 'data', 'qt-builtins.json');
            const fs = require('fs');
            const json = JSON.parse(fs.readFileSync(builtinsPath, 'utf8'));

            for (const [moduleName, components] of Object.entries<any>(json)) {
                const componentMap = new Map<string, Component>();
                
                for (const [name, info] of Object.entries<any>(components)) {
                    componentMap.set(name, {
                        name,
                        isBuiltin: true,
                        isSingleton: info.singleton || false,
                        version: info.version
                    });
                }

                this.modules.set(moduleName, {
                    name: moduleName,
                    version: '2.15',
                    components: componentMap
                });
            }

            console.log(`[Modules] Loaded ${Object.keys(json).length} Qt builtin modules`);
        } catch (error) {
            console.error('[Modules] Failed to load Qt builtins:', error);
        }
    }

    // File watching
    private startWatching(): void {
        this.watcher = vscode.workspace.createFileSystemWatcher('**/qmldir');
        
        this.watcher.onDidChange(uri => {
            const existing = Array.from(this.modules.values()).find(m => m.qmldirPath === uri.fsPath);
            if (existing) {
                this.modules.delete(existing.name);
            }
            this.indexQmldir(uri);
        });
        
        this.watcher.onDidCreate(uri => {
            this.indexQmldir(uri);
        });
        
        this.watcher.onDidDelete(uri => {
            const existing = Array.from(this.modules.values()).find(m => m.qmldirPath === uri.fsPath);
            if (existing) {
                this.modules.delete(existing.name);
                console.log(`[Modules] Removed "${existing.name}"`);
            }
        });
    }
}
