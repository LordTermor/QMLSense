import * as vscode from 'vscode';
import type { SyntaxNode, Tree } from '../../parser/qmlParser';
import { getParser } from '../../parser/qmlParser';
import * as ast from '../../symbols/ast';
import { SymbolExtractor } from './symbolExtractor';

export class QmlDocumentSymbolProvider implements vscode.DocumentSymbolProvider {
    private extractor = new SymbolExtractor();

    async provideDocumentSymbols(
        document: vscode.TextDocument,
        token: vscode.CancellationToken
    ): Promise<vscode.DocumentSymbol[]> {
        const parser = getParser();
        
        if (!parser.isInitialized()) {
            await parser.initialize();
        }

        const tree = parser.parse(document.getText());
        const symbols: vscode.DocumentSymbol[] = [];

        const rootNode = tree.rootNode;
        if (rootNode) {
            this.processNode(rootNode, symbols, document);
        }

        return symbols;
    }

    private processNode(
        node: SyntaxNode,
        symbols: vscode.DocumentSymbol[],
        document: vscode.TextDocument,
        parentSymbol?: vscode.DocumentSymbol
    ): void {
        const nodeType = node.type;

        if (nodeType === 'ui_object_definition') {
            const typeNameNode = ast.getField(node, 'type_name');
            if (typeNameNode) {
                const name = typeNameNode.text;
                const range = ast.nodeToRange(node, document);
                const selectionRange = ast.nodeToRange(typeNameNode, document);

                const symbol = new vscode.DocumentSymbol(
                    name,
                    '',
                    vscode.SymbolKind.Class,
                    range,
                    selectionRange
                );

                if (parentSymbol) {
                    parentSymbol.children.push(symbol);
                } else {
                    symbols.push(symbol);
                }

                const initializer = ast.getField(node, 'initializer');
                if (initializer) {
                    this.processObjectMembers(initializer, symbol, document);
                }
            }
        }

        if (nodeType !== 'ui_object_definition') {
            for (let i = 0; i < node.childCount; i++) {
                this.processNode(node.child(i)!, symbols, document, parentSymbol);
            }
        }
    }

    private processObjectMembers(
        initializerNode: SyntaxNode,
        parentSymbol: vscode.DocumentSymbol,
        document: vscode.TextDocument
    ): void {
        for (let i = 0; i < initializerNode.childCount; i++) {
            const child = initializerNode.child(i)!;
            const childType = child.type;

            const symbol = this.extractor.extractSymbol(child, document);
            if (symbol) {
                parentSymbol.children.push(symbol);
            }

            if (childType === 'ui_object_definition') {
                this.processNode(child, [], document, parentSymbol);
            }

            if (childType === 'ui_inline_component') {
                this.processNode(child, [], document, parentSymbol);
            }
        }
    }
}
