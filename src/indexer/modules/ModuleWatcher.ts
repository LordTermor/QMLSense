import * as vscode from 'vscode';
import { FileWatcher } from '../shared/FileWatcher';

/**
 * Watches qmldir files for changes and triggers module reindexing.
 */
export class ModuleWatcher {
    private watcher?: FileWatcher;

    constructor(
        private handlers: {
            onQmldirChanged: (uri: vscode.Uri) => void | Promise<void>;
            onQmldirCreated: (uri: vscode.Uri) => void | Promise<void>;
            onQmldirDeleted: (uri: vscode.Uri) => void | Promise<void>;
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

        this.watcher = new FileWatcher('**/qmldir', {
            onChange: async (uri) => {
                console.log(`[Module Watcher] qmldir changed: ${uri.fsPath}`);
                await this.handlers.onQmldirChanged(uri);
            },
            onCreate: async (uri) => {
                console.log(`[Module Watcher] qmldir created: ${uri.fsPath}`);
                await this.handlers.onQmldirCreated(uri);
            },
            onDelete: async (uri) => {
                console.log(`[Module Watcher] qmldir deleted: ${uri.fsPath}`);
                await this.handlers.onQmldirDeleted(uri);
            }
        }, excludePattern);

        this.watcher.start();
    }

    dispose(): void {
        this.watcher?.dispose();
        this.watcher = undefined;
    }
}
