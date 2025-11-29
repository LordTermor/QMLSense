import * as vscode from 'vscode';
import { FileWatcher } from '../shared/FileWatcher';

/**
 * Watches QML files for changes and triggers reindexing.
 */
export class QmlFileWatcher {
    private watcher?: FileWatcher;

    constructor(
        private handlers: {
            onFileChanged: (uri: vscode.Uri) => void | Promise<void>;
            onFileCreated: (uri: vscode.Uri) => void | Promise<void>;
            onFileDeleted: (uri: vscode.Uri) => void | Promise<void>;
        }
    ) {}

    start(): void {
        const config = vscode.workspace.getConfiguration('qml');
        const ignoreFolders = config.get<string[]>('indexing.ignoreFolders', [
            '**/node_modules/**',
            '**/build/**',
            '**/dist/**',
            '**/.git/**',
            '**/out/**'
        ]);
        const excludePattern = `{${ignoreFolders.join(',')}}`;

        this.watcher = new FileWatcher('**/*.qml', {
            onChange: async (uri) => {
                console.log(`[QML File Watcher] File changed: ${uri.fsPath}`);
                await this.handlers.onFileChanged(uri);
            },
            onCreate: async (uri) => {
                console.log(`[QML File Watcher] File created: ${uri.fsPath}`);
                await this.handlers.onFileCreated(uri);
            },
            onDelete: async (uri) => {
                console.log(`[QML File Watcher] File deleted: ${uri.fsPath}`);
                await this.handlers.onFileDeleted(uri);
            }
        }, excludePattern);

        this.watcher.start();
    }

    dispose(): void {
        this.watcher?.dispose();
        this.watcher = undefined;
    }
}
