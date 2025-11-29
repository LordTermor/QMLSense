import * as vscode from 'vscode';
import type { SyntaxNode, Tree } from '../../parser/qmlParser';
import { getParser } from '../../parser/qmlParser';
import { ImportStatement, ExportInfo, SymbolInfo } from '../types';
import * as ast from '../../symbols/ast';

/**
 * Extracts structured information from QML parse trees.
 * Handles imports, exports, and symbol declarations.
 */
export class QmlFileExtractor {
    private parser = getParser();

    async ensureInitialized(): Promise<void> {
        if (!this.parser.isInitialized()) {
            await this.parser.initialize();
        }
    }

    /**
     * Extract import statements from parse tree.
     */
    extractImports(root: SyntaxNode, document: vscode.TextDocument): ImportStatement[] {
        const imports: ImportStatement[] = [];
        const importNodes = this.findNodesByType(root, 'ui_import');
        
        for (const node of importNodes) {
            const sourceNode = node.childForFieldName('source');
            if (!sourceNode) continue;

            const source = sourceNode.text.replace(/['"]/g, '');
            const versionNode = node.childForFieldName('version');
            const alias = ast.qml.getImportAlias(node);

            // Determine import type
            let type: 'module' | 'directory' | 'file';
            if (source.startsWith('.') || source.startsWith('/')) {
                type = source.endsWith('.qml') ? 'file' : 'directory';
            } else {
                type = 'module';
            }

            imports.push({
                type,
                source,
                version: versionNode?.text,
                qualifier: alias ?? undefined,
                range: new vscode.Range(
                    document.positionAt(node.startIndex),
                    document.positionAt(node.endIndex)
                )
            });
        }

        return imports;
    }

    /**
     * Extract export information (root component, inline components).
     */
    extractExports(root: SyntaxNode, document: vscode.TextDocument): ExportInfo {
        const exports: ExportInfo = {
            inlineComponents: []
        };

        // Find root object type
        const rootObject = root.children.find(child => child.type === 'ui_object_definition');
        if (rootObject) {
            const typeName = rootObject.childForFieldName('type_name');
            if (typeName) {
                exports.rootComponent = typeName.text;
            }
        }

        // Find inline components
        const inlineComponents = this.findNodesByType(root, 'ui_inline_component');
        for (const comp of inlineComponents) {
            const nameNode = comp.childForFieldName('name');
            if (nameNode) {
                exports.inlineComponents.push(nameNode.text);
            }
        }

        return exports;
    }

    /**
     * Extract all symbols (properties, signals, functions, ids, objects).
     */
    extractSymbols(root: SyntaxNode, document: vscode.TextDocument): SymbolInfo[] {
        const symbols: SymbolInfo[] = [];

        this.traverseNode(root, (node) => {
            const symbol = this.nodeToSymbol(node, document);
            if (symbol) {
                symbols.push(symbol);
            }
        });

        return symbols;
    }

    private nodeToSymbol(node: SyntaxNode, document: vscode.TextDocument): SymbolInfo | null {
        let kind: import('../types').SymbolKind | null = null;
        let nameNode: SyntaxNode | null = null;
        let typeNode: SyntaxNode | null = null;

        switch (node.type) {
            case 'ui_property':
                kind = 'property' as any;
                nameNode = node.childForFieldName('name');
                typeNode = node.childForFieldName('property_type');
                break;

            case 'ui_signal':
                kind = 'signal' as any;
                nameNode = node.childForFieldName('name');
                break;

            case 'function_declaration':
                kind = 'function' as any;
                nameNode = node.childForFieldName('name');
                break;

            case 'ui_inline_component':
                kind = 'inline-component' as any;
                nameNode = node.childForFieldName('name');
                break;

            case 'ui_object_definition':
                kind = 'object' as any;
                nameNode = node.childForFieldName('type_name');
                break;

            case 'ui_binding':
                // Check for id binding
                if (ast.qml.isIdBinding(node)) {
                    kind = 'id' as any;
                    const idValue = ast.qml.getIdValue(node);
                    if (idValue) {
                        // Create a minimal node-like object for compatibility
                        nameNode = { text: idValue } as any;
                    }
                }
                break;
        }

        if (!kind || !nameNode) {
            return null;
        }

        return {
            name: nameNode.text,
            type: typeNode?.text || 'unknown',
            kind,
            range: new vscode.Range(
                document.positionAt(node.startIndex),
                document.positionAt(node.endIndex)
            )
        };
    }

    private findNodesByType(root: SyntaxNode, type: string): SyntaxNode[] {
        const nodes: SyntaxNode[] = [];
        this.traverseNode(root, (node) => {
            if (node.type === type) {
                nodes.push(node);
            }
        });
        return nodes;
    }

    private traverseNode(node: SyntaxNode, callback: (node: SyntaxNode) => void): void {
        callback(node);
        for (let i = 0; i < node.childCount; i++) {
            const child = node.child(i);
            if (child) {
                this.traverseNode(child, callback);
            }
        }
    }
}
