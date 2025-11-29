import * as vscode from 'vscode';
import { ImportStatement, FileIndexEntry } from './types';

/**
 * Resolves file dependencies from import statements.
 * Handles relative paths and builds dependency graphs.
 */
export class DependencyResolver {
    /**
     * Resolve file dependencies from imports.
     */
    resolveDependencies(imports: ImportStatement[], currentFile: vscode.Uri): string[] {
        const dependencies: string[] = [];

        for (const imp of imports) {
            if (imp.type === 'file') {
                const resolved = this.resolveRelativePath(imp.source, currentFile);
                if (resolved) {
                    dependencies.push(resolved.toString());
                }
            }
        }

        return dependencies;
    }

    /**
     * Build reverse dependency graph (who depends on whom).
     */
    buildDependencyGraph(fileIndex: Map<string, FileIndexEntry>): void {
        for (const entry of fileIndex.values()) {
            entry.dependedBy = [];
        }

        for (const entry of fileIndex.values()) {
            for (const depUri of entry.dependsOn) {
                const depEntry = fileIndex.get(depUri);
                if (depEntry) {
                    depEntry.dependedBy.push(entry.uri);
                }
            }
        }
    }

    private resolveRelativePath(relativePath: string, from: vscode.Uri): vscode.Uri | null {
        try {
            const fromDir = vscode.Uri.joinPath(from, '..');
            return vscode.Uri.joinPath(fromDir, relativePath);
        } catch {
            return null;
        }
    }
}
