import * as vscode from 'vscode';

/**
 * Generic file system watcher abstraction.
 * Eliminates duplication between QML file watching and qmldir watching.
 */
export class FileWatcher {
    private watcher?: vscode.FileSystemWatcher;

    constructor(
        private pattern: string,
        private handlers: {
            onChange?: (uri: vscode.Uri) => void | Promise<void>;
            onCreate?: (uri: vscode.Uri) => void | Promise<void>;
            onDelete?: (uri: vscode.Uri) => void | Promise<void>;
        },
        private excludePattern?: string
    ) {}

    start(): void {
        const globPattern = new vscode.RelativePattern(
            vscode.workspace.workspaceFolders?.[0] || '',
            this.pattern
        );
        
        this.watcher = vscode.workspace.createFileSystemWatcher(
            globPattern,
            false, // ignoreCreateEvents
            false, // ignoreChangeEvents
            false  // ignoreDeleteEvents
        );

        if (this.handlers.onChange) {
            this.watcher.onDidChange(uri => {
                if (this.shouldIgnore(uri)) return;
                const result = this.handlers.onChange!(uri);
                if (result instanceof Promise) {
                    result.catch(err => 
                        console.error(`[FileWatcher] onChange error for ${uri.fsPath}:`, err)
                    );
                }
            });
        }

        if (this.handlers.onCreate) {
            this.watcher.onDidCreate(uri => {
                if (this.shouldIgnore(uri)) return;
                const result = this.handlers.onCreate!(uri);
                if (result instanceof Promise) {
                    result.catch(err => 
                        console.error(`[FileWatcher] onCreate error for ${uri.fsPath}:`, err)
                    );
                }
            });
        }

        if (this.handlers.onDelete) {
            this.watcher.onDidDelete(uri => {
                if (this.shouldIgnore(uri)) return;
                const result = this.handlers.onDelete!(uri);
                if (result instanceof Promise) {
                    result.catch(err => 
                        console.error(`[FileWatcher] onDelete error for ${uri.fsPath}:`, err)
                    );
                }
            });
        }
    }

    private shouldIgnore(uri: vscode.Uri): boolean {
        if (!this.excludePattern) return false;
        
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
        if (!workspaceFolder) return false;
        
        const relativePath = vscode.workspace.asRelativePath(uri, false);
        const patterns = this.excludePattern.replace(/[{}]/g, '').split(',');
        
        return patterns.some(pattern => {
            const globPattern = new vscode.RelativePattern(workspaceFolder, pattern);
            const cleanPattern = pattern.replace(/\*\*/g, '').replace(/\*/g, '');
            return relativePath.includes(cleanPattern);
        });
    }

    dispose(): void {
        this.watcher?.dispose();
        this.watcher = undefined;
    }
}
