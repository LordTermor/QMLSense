import * as vscode from 'vscode';
import type { SyntaxNode, Tree } from '../parser/qmlParser';

/**
 * Core data structures for QML indexing.
 */

export interface ImportStatement {
    type: 'module' | 'directory' | 'file';
    source: string;              // "QtQuick.Controls", "./components", "../Button.qml"
    version?: string;            // "2.15"
    qualifier?: string;          // "as Controls"
    resolvedPaths?: string[];    // Actual file URIs for directory/file imports
    range: vscode.Range;
}

export interface ExportInfo {
    rootComponent?: string;      // Main component type (e.g., "Rectangle")
    inlineComponents: string[];  // component CustomButton: Button {}
    singletonType?: boolean;     // pragma Singleton
}

export interface SymbolInfo {
    name: string;
    type: string;                // "int", "string", "Item", etc.
    kind: SymbolKind;
    range: vscode.Range;
    containerName?: string;      // Parent object name
}

export enum SymbolKind {
    Property = 'property',
    Signal = 'signal',
    Function = 'function',
    Id = 'id',
    Object = 'object',
    InlineComponent = 'inline-component'
}

export interface FileIndexEntry {
    uri: string;
    imports: ImportStatement[];
    exports: ExportInfo;
    symbols: SymbolInfo[];
    dependsOn: string[];
    dependedBy: string[];
    contentHash: string;
    lastModified: number;
}
