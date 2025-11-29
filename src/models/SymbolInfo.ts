import * as vscode from 'vscode';
import type { SyntaxNode, Tree } from '../parser/qmlParser';

export enum QmlSymbolKind {
    ImportAlias = 'import-alias',
    Id = 'id',
    Property = 'property',
    Signal = 'signal',
    Function = 'function',
    Component = 'component',
    InlineComponent = 'inline-component',
    Object = 'object',
    Reference = 'reference'
}

export interface QmlSymbolInfo {
    name: string;
    kind: QmlSymbolKind;
    declarationNode: SyntaxNode;
    typeNode?: SyntaxNode;
    scope: 'file' | 'workspace';
}

export interface DeclarationSearchResult {
    node: SyntaxNode;
    kind: QmlSymbolKind;
}
