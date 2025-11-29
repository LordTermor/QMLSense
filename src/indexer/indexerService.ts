import * as vscode from 'vscode';
import { FileIndexEntry } from './types';
import { QmlFileIndexer } from './qml-files/QmlFileIndexer';
import { ModuleIndexer } from './modules/ModuleIndexer';

export * from './types';
export * from './moduleTypes';

/**
 * QML workspace indexer service facade.
 * Thin orchestrator that delegates to vertical slices.
 */
export class IndexerService {
    private qmlFileIndexer = new QmlFileIndexer();
    private moduleIndexer = new ModuleIndexer();
    private isInitialized = false;
    private workspaceFolder?: vscode.WorkspaceFolder;

    constructor() {}

    async initialize(workspaceFolder?: vscode.WorkspaceFolder): Promise<void> {
        if (this.isInitialized) {
            return;
        }

        this.workspaceFolder = workspaceFolder;

        await Promise.all([
            this.qmlFileIndexer.initialize(workspaceFolder),
            this.moduleIndexer.initialize(workspaceFolder)
        ]);

        this.isInitialized = true;
        console.log('[QML Indexer] Initialized');
    }

    /**
     * Index all QML files and modules in the workspace.
     */
    async indexWorkspace(): Promise<void> {
        console.log('[QML Indexer] Starting workspace indexing...');
        
        await this.qmlFileIndexer.indexWorkspace();
        await this.moduleIndexer.indexWorkspaceModules();
    }

    /**
     * Index a single file.
     */
    async indexFile(uri: vscode.Uri): Promise<FileIndexEntry> {
        return this.qmlFileIndexer.indexFile(uri);
    }

    /**
     * Get index entry for a file.
     */
    async getFileIndex(uri: vscode.Uri): Promise<FileIndexEntry | undefined> {
        return this.qmlFileIndexer.getFileIndex(uri);
    }

    /**
     * Invalidate file cache.
     */
    invalidateFile(uri: vscode.Uri): void {
        console.log(`[QML Indexer] File invalidation is automatic via watchers`);
    }

    /**
     * Get all indexed files.
     */
    getAllFiles(): FileIndexEntry[] {
        return this.qmlFileIndexer.getAllFiles();
    }

    /**
     * Clear all caches.
     */
    async clearIndex(): Promise<void> {
        this.qmlFileIndexer.clearCache();
        await this.moduleIndexer.clearCache();
        console.log('[QML Indexer] All caches cleared');
    }

    /**
     * Get module indexer instance.
     */
    getModuleIndexer() {
        return this.moduleIndexer;
    }

    dispose(): void {
        this.qmlFileIndexer.dispose();
        this.moduleIndexer.dispose();
    }
}

// Singleton instance
let indexerInstance: IndexerService | null = null;

export function getIndexer(): IndexerService {
    if (!indexerInstance) {
        indexerInstance = new IndexerService();
    }
    return indexerInstance;
}

