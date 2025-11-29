import * as vscode from 'vscode';

/**
 * Unified cache validation based on file modification timestamps.
 * Eliminates duplication across IndexerService, ModuleIndexer, and CacheStore.
 */

/**
 * Check if cached data is still valid based on file timestamp.
 */
export async function isCacheValid(filePath: string, cachedTimestamp: number): Promise<boolean> {
    try {
        const stat = await vscode.workspace.fs.stat(vscode.Uri.file(filePath));
        return stat.mtime === cachedTimestamp;
    } catch {
        return false;
    }
}

/**
 * Get current file modification time.
 */
export async function getFileModTime(filePath: string): Promise<number> {
    try {
        const stat = await vscode.workspace.fs.stat(vscode.Uri.file(filePath));
        return stat.mtime;
    } catch {
        return 0;
    }
}

/**
 * Check if cached data is valid for a URI.
 */
export async function isCacheValidForUri(uri: vscode.Uri, cachedTimestamp: number): Promise<boolean> {
    try {
        const stat = await vscode.workspace.fs.stat(uri);
        return stat.mtime === cachedTimestamp;
    } catch {
        return false;
    }
}
