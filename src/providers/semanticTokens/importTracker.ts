import type { SyntaxNode, Tree } from '../../parser/qmlParser';
import { qtBuiltInModules } from './builtinTypes';
import * as ast from '../../symbols/ast';

/**
 * Tracks import statements and their aliases.
 * Determines if an identifier is an import alias and whether it's a Qt module.
 */
export class ImportTracker {
    // Maps alias name to full module path
    private aliasToModule = new Map<string, string>();

    /**
     * Clear all tracked imports (call before processing a new document).
     */
    clear(): void {
        this.aliasToModule.clear();
    }

    /**
     * Process an import statement and extract alias if present.
     */
    processImport(importNode: SyntaxNode): void {
        const importInfo = ast.qml.parseImport(importNode);
        if (importInfo && importInfo.alias) {
            this.aliasToModule.set(importInfo.alias, importInfo.source);
        }
    }

    /**
     * Check if an identifier is an import alias.
     */
    isImportAlias(identifier: string): boolean {
        return this.aliasToModule.has(identifier);
    }

    /**
     * Check if an import alias points to a Qt built-in module.
     */
    isQtAlias(identifier: string): boolean {
        const modulePath = this.aliasToModule.get(identifier);
        return modulePath ? qtBuiltInModules.has(modulePath) : false;
    }

    /**
     * Get the module path for an alias.
     */
    getModulePath(alias: string): string | undefined {
        return this.aliasToModule.get(alias);
    }
}
