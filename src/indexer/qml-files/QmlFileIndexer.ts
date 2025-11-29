import * as vscode from 'vscode';
import { getParser } from '../../parser/qmlParser';
import { FileIndexEntry } from '../types';
import { QmlFileExtractor } from './QmlFileExtractor';
import { QmlFileWatcher } from './QmlFileWatcher';
import { DependencyResolver } from '../dependencyResolver';
import { hashContent } from '../shared/ContentHasher';
import { CacheStore } from '../cacheStore';

/**
 * QML file indexing vertical slice.
 * Orchestrates extraction, caching, and watching of QML files.
 */
export class QmlFileIndexer {
    private parser = getParser();
    private extractor = new QmlFileExtractor();
    private watcher?: QmlFileWatcher;
    private resolver = new DependencyResolver();
    private persistentCache: CacheStore | null = null;
    private fileIndex = new Map<string, FileIndexEntry>();

    async initialize(workspaceFolder?: vscode.WorkspaceFolder): Promise<void> {
        if (!this.parser.isInitialized()) {
            await this.parser.initialize();
        }

        if (workspaceFolder) {
            try {
                this.persistentCache = new CacheStore(workspaceFolder);
                await this.persistentCache.initialize();
                console.log('[QML File Indexer] Persistent cache initialized');
            } catch (error) {
                console.error('[QML File Indexer] Failed to initialize cache:', error);
                this.persistentCache = null;
            }
        }

        this.watcher = new QmlFileWatcher({
            onFileChanged: (uri) => this.handleFileChanged(uri),
            onFileCreated: (uri) => this.handleFileCreated(uri),
            onFileDeleted: (uri) => this.handleFileDeleted(uri)
        });

        this.watcher.start();
    }

    /**
     * Index all QML files in workspace with progress reporting.
     */
    async indexWorkspace(): Promise<void> {
        console.log('[QML File Indexer] Starting workspace indexing...');
        const startTime = Date.now();

        if (this.persistentCache) {
            try {
                const cachedFiles = await this.persistentCache.loadAllQmlFiles();
                for (const [filePath, entry] of cachedFiles) {
                    this.fileIndex.set(entry.uri, entry);
                }
                console.log(`[QML File Indexer] Loaded ${cachedFiles.size} files from cache`);
            } catch (error) {
                console.error('[QML File Indexer] Failed to load cache:', error);
            }
        }

        const config = vscode.workspace.getConfiguration('qml');
        const ignoreFolders = config.get<string[]>('indexing.ignoreFolders', [
            '**/node_modules/**',
            '**/build/**',
            '**/dist/**',
            '**/.git/**',
            '**/out/**'
        ]);
        
        const excludePattern = `{${ignoreFolders.join(',')}}`;
        const qmlFiles = await vscode.workspace.findFiles('**/*.qml', excludePattern);
        const totalFiles = qmlFiles.length;

        if (totalFiles === 0) {
            console.log('[QML File Indexer] No QML files found');
            return;
        }

        let indexed = 0;
        let cached = 0;
        let failed = 0;

        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: 'QML Indexer',
                cancellable: false
            },
            async (progress) => {
                const config = vscode.workspace.getConfiguration('qml');
                const BATCH_SIZE = config.get<number>('indexing.batchSize', 100);
                
                for (let i = 0; i < qmlFiles.length; i += BATCH_SIZE) {
                    const batch = qmlFiles.slice(i, Math.min(i + BATCH_SIZE, qmlFiles.length));
                    
                    const batchEnd = Math.min(i + BATCH_SIZE, totalFiles);
                    progress.report({
                        message: `Indexing files ${i + 1}-${batchEnd} of ${totalFiles}`,
                        increment: (BATCH_SIZE / totalFiles) * 100
                    });

                    const batchCacheWrites: Array<{ filePath: string; entry: FileIndexEntry }> = [];

                    const results = await Promise.allSettled(
                        batch.map(async (fileUri) => {
                            const existing = this.fileIndex.get(fileUri.toString());
                            if (existing) {
                                cached++;
                                return { entry: existing, fromCache: true };
                            }
                            const entry = await this.indexFileForBatch(fileUri);
                            return { entry, fromCache: false };
                        })
                    );

                    for (const result of results) {
                        if (result.status === 'fulfilled') {
                            indexed++;
                            const { entry, fromCache } = result.value;
                            if (!fromCache) {
                                batchCacheWrites.push({ filePath: vscode.Uri.parse(entry.uri).fsPath, entry });
                            }
                        } else {
                            failed++;
                            console.error('[QML File Indexer] Failed to index file:', result.reason);
                        }
                    }

                    if (this.persistentCache && batchCacheWrites.length > 0) {
                        await this.persistentCache.saveQmlFilesBatch(batchCacheWrites).catch(err =>
                            console.error('[QML File Indexer] Failed to save batch to cache:', err)
                        );
                    }
                }

                progress.report({ message: 'Building dependency graph...' });
                this.buildDependencyGraph();
            }
        );

        const duration = Date.now() - startTime;
        const filesPerSecond = ((indexed / duration) * 1000).toFixed(0);
        console.log(`[QML File Indexer] Indexed ${indexed} files (${cached} from cache) in ${duration}ms (${filesPerSecond} files/sec, ${failed} failed)`);
    }

    /**
     * Index a single file (for interactive use - saves immediately).
     */
    async indexFile(uri: vscode.Uri): Promise<FileIndexEntry> {
        const entry = await this.indexFileForBatch(uri);
        
        if (this.persistentCache) {
            await this.persistentCache.saveQmlFilesBatch([{
                filePath: uri.fsPath,
                entry
            }]).catch(err => 
                console.error(`[QML File Indexer] Failed to cache ${uri.fsPath}:`, err)
            );
        }
        
        return entry;
    }

    /**
     * Index a single file for batch processing (doesn't save to cache).
     */
    private async indexFileForBatch(uri: vscode.Uri): Promise<FileIndexEntry> {
        const filePath = uri.fsPath;

        if (this.persistentCache) {
            const cached = await this.persistentCache.loadQmlFile(filePath);
            if (cached) {
                this.fileIndex.set(uri.toString(), cached);
                return cached;
            }
        }

        const [fileBytes, stats] = await Promise.all([
            vscode.workspace.fs.readFile(uri),
            vscode.workspace.fs.stat(uri)
        ]);
        const text = Buffer.from(fileBytes).toString('utf8');
        
        let tree;
        try {
            tree = this.parser.parse(text);
        } catch (error) {
            throw new Error(`Parser crash for ${uri.fsPath}: ${error instanceof Error ? error.message : String(error)}`);
        }

        const document = {
            getText: () => text,
            positionAt: (offset: number) => this.offsetToPosition(text, offset),
            uri
        } as vscode.TextDocument;

        const imports = this.extractor.extractImports(tree.rootNode, document);
        const exports = this.extractor.extractExports(tree.rootNode, document);
        const symbols = this.extractor.extractSymbols(tree.rootNode, document);
        const dependsOn = this.resolver.resolveDependencies(imports, uri);

        const entry: FileIndexEntry = {
            uri: uri.toString(),
            imports,
            exports,
            symbols,
            dependsOn,
            dependedBy: [],
            contentHash: hashContent(text),
            lastModified: stats.mtime
        };

        this.fileIndex.set(uri.toString(), entry);

        return entry;
    }

    /**
     * Get file index entry (from cache or by indexing).
     */
    async getFileIndex(uri: vscode.Uri): Promise<FileIndexEntry | undefined> {
        const existing = this.fileIndex.get(uri.toString());
        if (existing) {
            return existing;
        }

        try {
            return await this.indexFile(uri);
        } catch (error) {
            console.error(`[QML File Indexer] Failed to index ${uri.fsPath}:`, error);
            return undefined;
        }
    }

    /**
     * Get all indexed files.
     */
    getAllFiles(): FileIndexEntry[] {
        return Array.from(this.fileIndex.values());
    }

    /**
     * Build dependency graph (reverse dependencies).
     */
    buildDependencyGraph(): void {
        this.resolver.buildDependencyGraph(this.fileIndex);
    }

    /**
     * Clear all cached data.
     */
    async clearCache(): Promise<void> {
        this.fileIndex.clear();
        if (this.persistentCache) {
            await this.persistentCache.clearCache();
        }
    }

    dispose(): void {
        this.watcher?.dispose();
        this.fileIndex.clear();
        if (this.persistentCache) {
            this.persistentCache.dispose();
        }
    }

    // ========================================================================
    // Private: Event Handlers
    // ========================================================================

    private async handleFileChanged(uri: vscode.Uri): Promise<void> {
        this.invalidateFile(uri);
        const entry = await this.indexFileForBatch(uri).catch(err => {
            console.error(`[QML File Indexer] Failed to reindex ${uri.fsPath}:`, err);
            return null;
        });
        
        if (entry && this.persistentCache) {
            await this.persistentCache.saveQmlFilesBatch([{
                filePath: uri.fsPath,
                entry
            }]).catch(err => console.error(`[QML File Indexer] Failed to cache ${uri.fsPath}:`, err));
        }
    }

    private async handleFileCreated(uri: vscode.Uri): Promise<void> {
        const entry = await this.indexFileForBatch(uri).catch(err => {
            console.error(`[QML File Indexer] Failed to index new file ${uri.fsPath}:`, err);
            return null;
        });
        
        if (entry && this.persistentCache) {
            await this.persistentCache.saveQmlFilesBatch([{
                filePath: uri.fsPath,
                entry
            }]).catch(err => console.error(`[QML File Indexer] Failed to cache ${uri.fsPath}:`, err));
        }
    }

    private async handleFileDeleted(uri: vscode.Uri): Promise<void> {
        this.invalidateFile(uri);
        if (this.persistentCache) {
            await this.persistentCache.removeQmlFile(uri.fsPath).catch(err =>
                console.error(`[QML File Indexer] Failed to remove from cache ${uri.fsPath}:`, err)
            );
        }
    }

    private invalidateFile(uri: vscode.Uri): void {
        const uriString = uri.toString();
        const entry = this.fileIndex.get(uriString);

        if (!entry) {
            return;
        }

        this.fileIndex.delete(uriString);

        for (const dependentUri of entry.dependedBy) {
            this.invalidateFile(vscode.Uri.parse(dependentUri));
        }

        console.log(`[QML File Indexer] Invalidated ${uriString} and ${entry.dependedBy.length} dependents`);
    }

    private offsetToPosition(text: string, offset: number): vscode.Position {
        const lines = text.substring(0, offset).split('\n');
        const line = lines.length - 1;
        const character = lines[lines.length - 1].length;
        return new vscode.Position(line, character);
    }
}
