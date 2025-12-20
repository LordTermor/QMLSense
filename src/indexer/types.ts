import * as vscode from 'vscode';

/**
 * Core indexer types - minimal and flat.
 */

// QML File Data
export interface QmlFile {
    uri: string;
    imports: Import[];
    rootComponent?: string;
    inlineComponents: string[];
    symbols: Symbol[];
    hash: string;
    mtime: number;
}

export interface Import {
    type: 'module' | 'directory' | 'file';
    source: string;
    version?: string;
    alias?: string;
    range: vscode.Range;
}

export interface Symbol {
    name: string;
    type: string;
    kind: 'property' | 'signal' | 'function' | 'id' | 'object';
    range: vscode.Range;
}

// Module Data
export interface Module {
    name: string;
    version: string;
    qmldirPath?: string;
    components: Map<string, Component>;
}

export interface Component {
    name: string;
    filePath?: string;
    isBuiltin: boolean;
    isSingleton: boolean;
    version?: string;
}

// Qmldir Parsing
export interface QmldirEntry {
    type: 'module' | 'singleton' | 'component';
    moduleName?: string;
    typeName?: string;
    version?: string;
    filePath?: string;
}
