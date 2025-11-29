import * as vscode from 'vscode';
import * as path from 'path';

/**
 * Resolves module names and infers hierarchical module structure.
 * Handles module lookups with suffix matching.
 */
export class ModuleResolver {
    /**
     * Infer module name from directory path.
     * Uses configurable root markers to determine module hierarchy.
     */
    inferModuleName(moduleDir: string): string {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            return path.basename(moduleDir);
        }

        const config = vscode.workspace.getConfiguration('qml.modules');
        const rootMarkers = config.get<string[]>('rootMarkers', ['Modules', 'imports', 'qml', 'src']);

        for (const folder of workspaceFolders) {
            const wsPath = folder.uri.fsPath;
            if (moduleDir.startsWith(wsPath)) {
                const relativePath = path.relative(wsPath, moduleDir);
                const parts = relativePath.split(path.sep);
                
                // Look for module root marker
                const qmlRootIndex = parts.findIndex(p => rootMarkers.includes(p));
                
                if (qmlRootIndex !== -1 && qmlRootIndex < parts.length - 1) {
                    // Use path from marker onwards as dotted module name
                    const moduleParts = parts.slice(qmlRootIndex + 1);
                    return moduleParts.join('.');
                }
                
                // Fallback: use relative path as dotted name
                return parts.join('.');
            }
        }

        return path.basename(moduleDir);
    }

    /**
     * Match module name with suffix matching support.
     * E.g., "Components" matches "Polaris.Components"
     */
    matchesModuleName(cachedName: string, requestedName: string): boolean {
        // Exact match
        if (cachedName === requestedName) {
            return true;
        }

        // Suffix match
        if (cachedName.endsWith('.' + requestedName) || cachedName.endsWith(requestedName)) {
            const parts = cachedName.split('.');
            const requestedParts = requestedName.split('.');
            
            if (parts.length >= requestedParts.length) {
                const suffix = parts.slice(-requestedParts.length).join('.');
                return suffix === requestedName;
            }
        }

        return false;
    }
}
