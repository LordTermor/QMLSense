import * as vscode from 'vscode';
import type { SyntaxNode, Tree } from '../../parser/qmlParser';
import * as ast from '../../symbols/ast';
import { SymbolResolver } from '../../services/SymbolResolver';
import { QmlSymbolInfo, QmlSymbolKind } from '../../models/SymbolInfo';

export class ReferenceResolver {
    private symbolResolver = new SymbolResolver();

    findReferences(
        root: SyntaxNode,
        symbolInfo: QmlSymbolInfo,
        document: vscode.TextDocument,
        includeDeclaration: boolean
    ): vscode.Location[] {
        const locations: vscode.Location[] = [];

        if (symbolInfo.kind === QmlSymbolKind.ImportAlias) {
            return this.findImportAliasReferences(root, symbolInfo, document, includeDeclaration);
        }

        let componentId: string | null = null;
        if (symbolInfo.kind === QmlSymbolKind.Property || symbolInfo.kind === QmlSymbolKind.Signal) {
            componentId = this.findComponentId(symbolInfo.declarationNode);
        }

        for (const node of ast.traverseNodes(root)) {
            if (node.text !== symbolInfo.name) continue;
            if (!ast.qml.isIdentifierNode(node)) continue;
            if (!this.isSameSymbol(node, symbolInfo, componentId)) continue;

            const isDeclaration = ast.nodesEqual(node, symbolInfo.declarationNode);
            
            if (!includeDeclaration && isDeclaration) {
                continue;
            }

            locations.push(new vscode.Location(
                document.uri,
                ast.nodeToRange(node, document)
            ));
        }

        return locations;
    }

    private findImportAliasReferences(
        root: SyntaxNode,
        symbolInfo: QmlSymbolInfo,
        document: vscode.TextDocument,
        includeDeclaration: boolean
    ): vscode.Location[] {
        const locations: vscode.Location[] = [];

        if (includeDeclaration) {
            locations.push(new vscode.Location(
                document.uri,
                ast.nodeToRange(symbolInfo.declarationNode, document)
            ));
        }

        for (const node of ast.traverseNodes(root)) {
            if (node.type !== 'nested_identifier') continue;

            const firstChild = node.child(0);
            if (!firstChild || firstChild.type !== 'identifier') continue;
            if (firstChild.text !== symbolInfo.name) continue;

            locations.push(new vscode.Location(
                document.uri,
                ast.nodeToRange(firstChild, document)
            ));
        }

        return locations;
    }

    private isSameSymbol(node: SyntaxNode, symbolInfo: QmlSymbolInfo, componentId: string | null = null): boolean {
        if (symbolInfo.kind === QmlSymbolKind.Id) return true;

        if (symbolInfo.kind === QmlSymbolKind.Property || symbolInfo.kind === QmlSymbolKind.Signal) {
            for (const parent of ast.traverseParents(node)) {
                if (this.matchesSymbolContext(parent, symbolInfo)) {
                    return true;
                }
                
                
                if (parent.type === 'member_expression') {
                    const propertyNode = ast.getField(parent, 'property');
                    // Compare by position since identity comparison fails
                    if (ast.nodesEqual(node, propertyNode) && node.text === symbolInfo.name) {
                        
                        if (componentId) {
                            const objectNode = ast.getField(parent, 'object');
                            const objectName = objectNode?.text;
                            if (objectName === componentId || objectName === 'parent' || 
                                (componentId === 'root' && objectName === 'root')) {
                                return true;
                            }
                            return false;
                        }
                        
                        return true;
                    }
                }
            }
            return false;
        }

        for (const parent of ast.traverseParents(node)) {
            if (this.matchesSymbolContext(parent, symbolInfo)) {
                return true;
            }
        }

        return false;
    }

    private findComponentId(declarationNode: SyntaxNode): string | null {
        let current: SyntaxNode | null = declarationNode;
        while (current) {
            if (current.type === 'ui_object_initializer') {
                for (let i = 0; i < current.namedChildCount; i++) {
                    const child = current.namedChild(i);
                    if (child && ast.qml.isIdBinding(child)) {
                        const idValue = ast.qml.getIdValue(child);
                        if (idValue) {
                            return idValue;
                        }
                    }
                }
                break;
            }
            current = current.parent;
        }
        return null;
    }

    private matchesSymbolContext(parent: SyntaxNode, symbolInfo: QmlSymbolInfo): boolean {
        const kindToTypeMap: Record<QmlSymbolKind, string> = {
            [QmlSymbolKind.Property]: 'ui_property',
            [QmlSymbolKind.Signal]: 'ui_signal',
            [QmlSymbolKind.Function]: 'function_declaration',
            [QmlSymbolKind.InlineComponent]: 'ui_inline_component',
            [QmlSymbolKind.ImportAlias]: 'ui_import',
            [QmlSymbolKind.Id]: 'ui_binding',
            [QmlSymbolKind.Component]: 'ui_object_definition',
            [QmlSymbolKind.Object]: 'ui_object_definition',
            [QmlSymbolKind.Reference]: ''
        };

        const expectedType = kindToTypeMap[symbolInfo.kind];
        if (!expectedType) return false;
        if (parent.type !== expectedType) return false;

        const nameNode = ast.getField(parent, 'name');
        return nameNode?.text === symbolInfo.name;
    }
}
