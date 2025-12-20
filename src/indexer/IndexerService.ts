import * as vscode from 'vscode';
import { QmlFileIndexer } from './QmlFileIndexer';
import { ModuleIndexer } from './ModuleIndexer';
import { CacheStore } from './CacheStore';
import { QmlFile, Module } from './types';

/**
 * Indexer facade - single entry point for all indexing operations.
 * Orchestrates QML file and module indexing with shared cache.
 */
export class IndexerService {
    private qmlFiles?: QmlFileIndexer;
    private modules?: ModuleIndexer;
    private cache?: CacheStore;
    private isInitialized = false;

    async initialize(workspaceFolder?: vscode.WorkspaceFolder): Promise<void> {
        if (this.isInitialized) return;

        if (!workspaceFolder) {
            console.warn('[Indexer] No workspace folder, running without cache');
            return;
        }

        try {
            this.cache = new CacheStore(workspaceFolder);
            await this.cache.initialize();

            this.qmlFiles = new QmlFileIndexer(this.cache);
            this.modules = new ModuleIndexer(this.cache);

            await Promise.all([
                this.qmlFiles.initialize(),
                this.modules.initialize()
            ]);

            this.isInitialized = true;
            console.log('[Indexer] Initialized');
        } catch (error) {
            console.error('[Indexer] Initialization failed:', error);
        }
    }

    async indexWorkspace(): Promise<void> {
        if (!this.qmlFiles || !this.modules) {
            console.warn('[Indexer] Not initialized');
            return;
        }

        console.log('[Indexer] Starting workspace indexing...');
        
        await Promise.all([
            this.qmlFiles.indexWorkspace(),
            this.modules.indexWorkspace()
        ]);
    }

    // QML Files
    async indexFile(uri: vscode.Uri): Promise<QmlFile | null> {
        return this.qmlFiles?.indexFile(uri) ?? null;
    }

    getFile(uri: vscode.Uri): QmlFile | undefined {
        return this.qmlFiles?.getFile(uri);
    }

    getAllFiles(): QmlFile[] {
        return this.qmlFiles?.getAllFiles() ?? [];
    }

    // Modules
    getModuleIndexer(): ModuleIndexer | undefined {
        return this.modules;
    }

    getAllModules(): Module[] {
        return this.modules?.getAllModules() ?? [];
    }

    // Cache management
    async clearCache(): Promise<void> {
        this.qmlFiles?.clearCache();
        this.modules?.clearCache();
        await this.cache?.clearCache();
        console.log('[Indexer] Cache cleared');
    }

    dispose(): void {
        this.qmlFiles?.dispose();
        this.modules?.dispose();
        this.cache?.dispose();
    }
}

// Singleton
let instance: IndexerService | null = null;

export function getIndexer(): IndexerService {
    if (!instance) {
        instance = new IndexerService();
    }
    return instance;
}
