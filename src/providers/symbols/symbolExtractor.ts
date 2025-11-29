import * as vscode from 'vscode';
import type { SyntaxNode, Tree } from '../../parser/qmlParser';
import * as ast from '../../symbols/ast';

type SymbolCreator = (node: SyntaxNode, document: vscode.TextDocument) => vscode.DocumentSymbol | null;

export class SymbolExtractor {
    private symbolCreators: Map<string, SymbolCreator> = new Map([
        ['ui_property', this.createPropertySymbol.bind(this)],
        ['ui_binding', this.createBindingSymbol.bind(this)],
        ['ui_signal', this.createSignalSymbol.bind(this)],
        ['function_declaration', this.createFunctionSymbol.bind(this)],
        ['ui_inline_component', this.createInlineComponentSymbol.bind(this)]
    ]);

    extractSymbol(
        node: SyntaxNode,
        document: vscode.TextDocument
    ): vscode.DocumentSymbol | null {
        const creator = this.symbolCreators.get(node.type);
        return creator ? creator(node, document) : null;
    }

    extractMembers(
        initializerNode: SyntaxNode,
        document: vscode.TextDocument
    ): vscode.DocumentSymbol[] {
        const symbols: vscode.DocumentSymbol[] = [];

        for (let i = 0; i < initializerNode.childCount; i++) {
            const child = initializerNode.child(i);
            if (!child) continue;

            const symbol = this.extractSymbol(child, document);
            if (symbol) {
                symbols.push(symbol);
            }
        }

        return symbols;
    }

    private createPropertySymbol(
        node: SyntaxNode,
        document: vscode.TextDocument
    ): vscode.DocumentSymbol | null {
        const nameNode = ast.getField(node, 'name');
        if (!nameNode) return null;

        const typeNode = ast.getField(node, 'type');
        const typeName = typeNode?.text ?? 'var';

        return new vscode.DocumentSymbol(
            nameNode.text,
            typeName,
            vscode.SymbolKind.Property,
            ast.nodeToRange(node, document),
            ast.nodeToRange(nameNode, document)
        );
    }

    private createBindingSymbol(
        node: SyntaxNode,
        document: vscode.TextDocument
    ): vscode.DocumentSymbol | null {
        const nameNode = ast.getField(node, 'name');
        if (!nameNode) return null;

        return new vscode.DocumentSymbol(
            nameNode.text,
            '',
            vscode.SymbolKind.Property,
            ast.nodeToRange(node, document),
            ast.nodeToRange(nameNode, document)
        );
    }

    private createSignalSymbol(
        node: SyntaxNode,
        document: vscode.TextDocument
    ): vscode.DocumentSymbol | null {
        const nameNode = ast.getField(node, 'name');
        if (!nameNode) return null;

        return new vscode.DocumentSymbol(
            nameNode.text,
            'signal',
            vscode.SymbolKind.Event,
            ast.nodeToRange(node, document),
            ast.nodeToRange(nameNode, document)
        );
    }

    private createFunctionSymbol(
        node: SyntaxNode,
        document: vscode.TextDocument
    ): vscode.DocumentSymbol | null {
        const nameNode = ast.getField(node, 'name');
        if (!nameNode) return null;

        return new vscode.DocumentSymbol(
            nameNode.text,
            '',
            vscode.SymbolKind.Function,
            ast.nodeToRange(node, document),
            ast.nodeToRange(nameNode, document)
        );
    }

    private createInlineComponentSymbol(
        node: SyntaxNode,
        document: vscode.TextDocument
    ): vscode.DocumentSymbol | null {
        const nameNode = ast.getField(node, 'name');
        if (!nameNode) return null;

        return new vscode.DocumentSymbol(
            nameNode.text,
            'component',
            vscode.SymbolKind.Class,
            ast.nodeToRange(node, document),
            ast.nodeToRange(nameNode, document)
        );
    }
}
