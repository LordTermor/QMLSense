import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { getParser } from '../parser/qmlParser';
import type { SyntaxNode } from '../parser/qmlParser';
import * as ast from '../symbols/ast';
import { QmlFile, Import, Symbol } from './types';
import type { CacheStore } from './CacheStore';

/**
 * QML file indexer - parses .qml files and extracts metadata.
 * Handles parsing, caching, and file watching in one place.
 */
export class QmlFileIndexer {
    private parser = getParser();
    private files = new Map<string, QmlFile>();
    private watcher?: vscode.FileSystemWatcher;

    constructor(private cache: CacheStore) {}

    async initialize(): Promise<void> {
        if (!this.parser.isInitialized()) {
            await this.parser.initialize();
        }
        this.startWatching();
    }

    async indexWorkspace(): Promise<void> {
        console.log('[QML Files] Starting indexing...');
        const start = Date.now();

        const cached = await this.cache.loadAllQmlFiles();
        for (const [uri, file] of cached) {
            this.files.set(uri, file);
        }
        console.log(`[QML Files] Loaded ${cached.size} from cache`);

        const config = vscode.workspace.getConfiguration('qml');
        const ignore = config.get<string[]>('indexing.ignoreFolders', [
            '**/node_modules/**', '**/build/**', '**/dist/**', '**/.git/**', '**/out/**'
        ]);
        
        const qmlFiles = await vscode.workspace.findFiles('**/*.qml', `{${ignore.join(',')}}`);
        const batchSize = config.get<number>('indexing.batchSize', 100);
        
        let indexed = 0;
        const toCache: Array<{ path: string; file: QmlFile }> = [];

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Indexing QML files',
        }, async (progress) => {
            for (let i = 0; i < qmlFiles.length; i += batchSize) {
                const batch = qmlFiles.slice(i, i + batchSize);
                progress.report({
                    message: `${i + 1}-${Math.min(i + batchSize, qmlFiles.length)} of ${qmlFiles.length}`,
                    increment: (batchSize / qmlFiles.length) * 100
                });

                const results = await Promise.allSettled(
                    batch.map(uri => this.indexFile(uri, false))
                );

                for (const result of results) {
                    if (result.status === 'fulfilled' && result.value) {
                        indexed++;
                        if (!this.files.has(result.value.uri)) {
                            toCache.push({ path: vscode.Uri.parse(result.value.uri).fsPath, file: result.value });
                        }
                    }
                }

                if (toCache.length > 0) {
                    await this.cache.saveQmlFilesBatch(toCache);
                    toCache.length = 0;
                }
            }
        });

        const duration = Date.now() - start;
        console.log(`[QML Files] Indexed ${indexed} files in ${duration}ms (${(indexed / duration * 1000).toFixed(0)} files/sec)`);
    }

    async indexFile(uri: vscode.Uri, saveToCache = true): Promise<QmlFile | null> {
        const uriString = uri.toString();
        
        try {
            const [bytes, stat] = await Promise.all([
                vscode.workspace.fs.readFile(uri),
                vscode.workspace.fs.stat(uri)
            ]);
            const text = Buffer.from(bytes).toString('utf8');
            const hash = crypto.createHash('sha256').update(text).digest('hex');

            const existing = this.files.get(uriString);
            if (existing && existing.hash === hash && existing.mtime === stat.mtime) {
                return existing;
            }

            const tree = this.parser.parse(text);
            const doc = this.createDocument(uri, text);

            const file: QmlFile = {
                uri: uriString,
                imports: this.extractImports(tree.rootNode, doc),
                rootComponent: this.extractRootComponent(tree.rootNode),
                inlineComponents: this.extractInlineComponents(tree.rootNode),
                symbols: this.extractSymbols(tree.rootNode, doc),
                hash,
                mtime: stat.mtime
            };

            this.files.set(uriString, file);

            if (saveToCache) {
                await this.cache.saveQmlFilesBatch([{ path: uri.fsPath, file }]);
            }

            return file;
        } catch (error) {
            console.error(`[QML Files] Failed to index ${uri.fsPath}:`, error);
            return null;
        }
    }

    getFile(uri: vscode.Uri): QmlFile | undefined {
        return this.files.get(uri.toString());
    }

    getAllFiles(): QmlFile[] {
        return Array.from(this.files.values());
    }

    clearCache(): void {
        this.files.clear();
    }

    dispose(): void {
        this.watcher?.dispose();
        this.files.clear();
    }

    // Extraction methods
    private extractImports(root: SyntaxNode, doc: vscode.TextDocument): Import[] {
        const imports: Import[] = [];
        
        const traverse = (node: SyntaxNode) => {
            if (node.type === 'ui_import') {
                const sourceNode = node.childForFieldName('source');
                if (!sourceNode) return;

                const source = sourceNode.text.replace(/['"]/g, '');
                const versionNode = node.childForFieldName('version');
                const alias = ast.qml.getImportAlias(node);

                let type: 'module' | 'directory' | 'file';
                if (source.startsWith('.') || source.startsWith('/')) {
                    type = source.endsWith('.qml') ? 'file' : 'directory';
                } else {
                    type = 'module';
                }

                imports.push({
                    type,
                    source,
                    version: versionNode?.text,
                    alias: alias ?? undefined,
                    range: new vscode.Range(
                        doc.positionAt(node.startIndex),
                        doc.positionAt(node.endIndex)
                    )
                });
            }

            for (let i = 0; i < node.childCount; i++) {
                const child = node.child(i);
                if (child) traverse(child);
            }
        };

        traverse(root);
        return imports;
    }

    private extractRootComponent(root: SyntaxNode): string | undefined {
        const rootObj = root.children.find(c => c.type === 'ui_object_definition');
        if (rootObj) {
            const typeName = rootObj.childForFieldName('type_name');
            return typeName?.text;
        }
        return undefined;
    }

    private extractInlineComponents(root: SyntaxNode): string[] {
        const components: string[] = [];
        
        const traverse = (node: SyntaxNode) => {
            if (node.type === 'ui_inline_component') {
                const name = node.childForFieldName('name');
                if (name) components.push(name.text);
            }
            for (let i = 0; i < node.childCount; i++) {
                const child = node.child(i);
                if (child) traverse(child);
            }
        };

        traverse(root);
        return components;
    }

    private extractSymbols(root: SyntaxNode, doc: vscode.TextDocument): Symbol[] {
        const symbols: Symbol[] = [];
        
        const traverse = (node: SyntaxNode) => {
            let kind: Symbol['kind'] | null = null;
            let nameNode: SyntaxNode | null = null;
            let typeNode: SyntaxNode | null = null;

            switch (node.type) {
                case 'ui_property':
                    kind = 'property';
                    nameNode = node.childForFieldName('name');
                    typeNode = node.childForFieldName('property_type');
                    break;
                case 'ui_signal':
                    kind = 'signal';
                    nameNode = node.childForFieldName('name');
                    break;
                case 'function_declaration':
                    kind = 'function';
                    nameNode = node.childForFieldName('name');
                    break;
                case 'ui_object_definition':
                    kind = 'object';
                    nameNode = node.childForFieldName('type_name');
                    break;
                case 'ui_binding':
                    if (ast.qml.isIdBinding(node)) {
                        kind = 'id';
                        const idValue = ast.qml.getIdValue(node);
                        if (idValue) {
                            symbols.push({
                                name: idValue,
                                type: 'id',
                                kind: 'id',
                                range: new vscode.Range(
                                    doc.positionAt(node.startIndex),
                                    doc.positionAt(node.endIndex)
                                )
                            });
                        }
                    }
                    break;
            }

            if (kind && nameNode && kind !== 'id') {
                symbols.push({
                    name: nameNode.text,
                    type: typeNode?.text || 'unknown',
                    kind,
                    range: new vscode.Range(
                        doc.positionAt(node.startIndex),
                        doc.positionAt(node.endIndex)
                    )
                });
            }

            for (let i = 0; i < node.childCount; i++) {
                const child = node.child(i);
                if (child) traverse(child);
            }
        };

        traverse(root);
        return symbols;
    }

    // File watching
    private startWatching(): void {
        const config = vscode.workspace.getConfiguration('qml');
        const ignore = config.get<string[]>('indexing.ignoreFolders', []);
        
        this.watcher = vscode.workspace.createFileSystemWatcher('**/*.qml');
        
        this.watcher.onDidChange(uri => {
            this.indexFile(uri).catch(err => 
                console.error(`[QML Files] Failed to reindex ${uri.fsPath}:`, err)
            );
        });
        
        this.watcher.onDidCreate(uri => {
            this.indexFile(uri).catch(err => 
                console.error(`[QML Files] Failed to index new file ${uri.fsPath}:`, err)
            );
        });
        
        this.watcher.onDidDelete(uri => {
            this.files.delete(uri.toString());
            this.cache.removeQmlFile(uri.fsPath).catch((err: any) =>
                console.error(`[QML Files] Failed to remove from cache ${uri.fsPath}:`, err)
            );
        });
    }

    private createDocument(uri: vscode.Uri, text: string): vscode.TextDocument {
        return {
            getText: () => text,
            positionAt: (offset: number) => {
                const lines = text.substring(0, offset).split('\n');
                return new vscode.Position(lines.length - 1, lines[lines.length - 1].length);
            },
            uri
        } as vscode.TextDocument;
    }
}
