import type { SyntaxNode, Tree } from '../parser/qmlParser';
import * as ast from '../symbols/ast';
import { QmlSymbolInfo, QmlSymbolKind, DeclarationSearchResult } from '../models/SymbolInfo';

export class SymbolResolver {
    resolveSymbol(node: SyntaxNode, root: SyntaxNode): QmlSymbolInfo | null {
        const symbolName = node.text;
        if (!symbolName) return null;

        // Don't resolve property part of member expressions (obj.property)
        // These need object-specific resolution which isn't implemented yet
        if (node.parent?.type === 'member_expression') {
            const property = ast.getField(node.parent, 'property');
            // If this node is the property part (not the object part), skip resolution
            if (ast.nodesEqual(node, property)) {
                return null;
            }
        }

        const rules: (() => QmlSymbolInfo | null)[] = [
            () => this.resolveImportAlias(root, symbolName),
            () => this.resolveFromParentContext(node, symbolName),
            () => this.resolveAsReference(node, symbolName)
        ];

        for (const rule of rules) {
            const result = rule();
            if (result) return result;
        }

        return null;
    }

    findDeclaration(root: SyntaxNode, symbolName: string): DeclarationSearchResult | null {
        const rules: (() => DeclarationSearchResult | null)[] = [
            () => this.findImportAliasDeclaration(root, symbolName),
            () => this.findPropertyDeclaration(root, symbolName),
            () => this.findSignalDeclaration(root, symbolName),
            () => this.findFunctionDeclaration(root, symbolName),
            () => this.findIdDeclaration(root, symbolName),
            () => this.findInlineComponentDeclaration(root, symbolName)
        ];

        for (const rule of rules) {
            const result = rule();
            if (result) return result;
        }

        return null;
    }

    private resolveImportAlias(root: SyntaxNode, symbolName: string): QmlSymbolInfo | null {
        const aliasNode = ast.qml.findImportAlias(root, symbolName);
        if (!aliasNode) return null;

        return {
            name: symbolName,
            kind: QmlSymbolKind.ImportAlias,
            declarationNode: aliasNode,
            scope: 'file'
        };
    }

    private resolveFromParentContext(node: SyntaxNode, symbolName: string): QmlSymbolInfo | null {
        for (const parent of ast.traverseParents(node)) {
            const result = this.checkParentForDeclaration(parent, symbolName, node);
            if (result) return result;
        }

        return null;
    }

    private checkParentForDeclaration(
        parent: SyntaxNode,
        symbolName: string,
        originalNode: SyntaxNode
    ): QmlSymbolInfo | null {
        const type = parent.type;

        if (type === 'ui_binding') {
            if (ast.qml.isIdBinding(parent)) {
                return {
                    name: symbolName,
                    kind: QmlSymbolKind.Id,
                    declarationNode: originalNode,
                    scope: 'file'
                };
            }
        }

        if (type === 'ui_property') {
            const nameNode = ast.getField(parent, 'name');
            if (nameNode?.text === symbolName) {
                const typeField = ast.getField(parent, 'type');
                return {
                    name: symbolName,
                    kind: QmlSymbolKind.Property,
                    declarationNode: nameNode,
                    typeNode: typeField ?? undefined,
                    scope: 'file'
                };
            }
        }

        if (type === 'ui_signal') {
            const nameNode = ast.getField(parent, 'name');
            if (nameNode?.text === symbolName) {
                return {
                    name: symbolName,
                    kind: QmlSymbolKind.Signal,
                    declarationNode: nameNode,
                    scope: 'file'
                };
            }
        }

        if (type === 'function_declaration') {
            const nameNode = ast.getField(parent, 'name');
            if (nameNode?.text === symbolName) {
                return {
                    name: symbolName,
                    kind: QmlSymbolKind.Function,
                    declarationNode: nameNode,
                    scope: 'file'
                };
            }
        }

        if (type === 'ui_inline_component') {
            const nameNode = ast.getField(parent, 'name');
            if (nameNode?.text === symbolName) {
                return {
                    name: symbolName,
                    kind: QmlSymbolKind.InlineComponent,
                    declarationNode: nameNode,
                    scope: 'file'
                };
            }
        }

        return null;
    }

    private resolveAsReference(node: SyntaxNode, symbolName: string): QmlSymbolInfo | null {
        return {
            name: symbolName,
            kind: QmlSymbolKind.Reference,
            declarationNode: node,
            scope: 'file'
        };
    }

    private findImportAliasDeclaration(root: SyntaxNode, name: string): DeclarationSearchResult | null {
        const node = ast.qml.findImportAlias(root, name);
        return node ? { node, kind: QmlSymbolKind.ImportAlias } : null;
    }

    private findPropertyDeclaration(root: SyntaxNode, name: string): DeclarationSearchResult | null {
        const node = ast.findNode(root, (n) => {
            if (n.type !== 'ui_property') return false;
            return ast.getFieldText(n, 'name') === name;
        });
        return node ? { node, kind: QmlSymbolKind.Property } : null;
    }

    private findSignalDeclaration(root: SyntaxNode, name: string): DeclarationSearchResult | null {
        const node = ast.findNode(root, (n) => {
            if (n.type !== 'ui_signal') return false;
            return ast.getFieldText(n, 'name') === name;
        });
        return node ? { node, kind: QmlSymbolKind.Signal } : null;
    }

    private findFunctionDeclaration(root: SyntaxNode, name: string): DeclarationSearchResult | null {
        const node = ast.findNode(root, (n) => {
            if (n.type !== 'function_declaration') return false;
            return ast.getFieldText(n, 'name') === name;
        });
        return node ? { node, kind: QmlSymbolKind.Function } : null;
    }

    private findIdDeclaration(root: SyntaxNode, name: string): DeclarationSearchResult | null {
        const node = ast.findNode(root, (n) => {
            if (!ast.qml.isIdBinding(n)) return false;
            const idValue = ast.qml.getIdValue(n);
            return idValue === name;
        });
        return node ? { node, kind: QmlSymbolKind.Id } : null;
    }

    private findInlineComponentDeclaration(root: SyntaxNode, name: string): DeclarationSearchResult | null {
        const node = ast.findNode(root, (n) => {
            if (n.type !== 'ui_inline_component') return false;
            return ast.getFieldText(n, 'name') === name;
        });
        return node ? { node, kind: QmlSymbolKind.InlineComponent } : null;
    }
}
