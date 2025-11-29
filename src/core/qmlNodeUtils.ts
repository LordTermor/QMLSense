import type { SyntaxNode, Tree } from '../parser/qmlParser';
import * as ast from '../symbols/ast';

/**
 * QML-specific AST navigation utilities.
 * 
 * Provides helpers for working with QML object hierarchy, including:
 * - Parent object resolution (skipping property groups like anchors, font)
 * - Import alias detection and resolution
 * - Property group identification
 */

export function isIdentifierNode(node: SyntaxNode): boolean {
    return ast.isNodeType(node, 'identifier', 'property_identifier', 'type_identifier');
}

export function findParentQmlObject(node: SyntaxNode): SyntaxNode | null {
    const currentObject = findContainingObject(node);
    if (!currentObject) return null;

    for (const ancestor of ast.traverseParents(currentObject)) {
        if (ancestor.type !== 'ui_object_definition') continue;
        
        const typeName = ast.getFieldText(ancestor, 'type_name');
        if (!typeName) continue;
        
        if (ast.qml.isPropertyGroupName(typeName)) continue;
        
        return ancestor;
    }
    
    return null;
}

function findContainingObject(node: SyntaxNode): SyntaxNode | null {
    for (const ancestor of ast.traverseParents(node)) {
        if (ancestor.type === 'ui_object_definition') {
            const typeName = ast.getFieldText(ancestor, 'type_name');
            if (typeName && !ast.qml.isPropertyGroupName(typeName)) {
                return ancestor;
            }
        }
    }
    return null;
}

export function isPropertyGroup(node: SyntaxNode): boolean {
    if (node.type !== 'ui_object_definition') return false;
    
    const typeName = ast.getFieldText(node, 'type_name');
    if (!typeName) return false;
    
    return ast.qml.isPropertyGroupName(typeName);
}

export function getImportAlias(importNode: SyntaxNode): string | null {
    for (let i = 0; i < importNode.childCount; i++) {
        const child = importNode.child(i);
        if (!child) continue;
        
        if (child.type === 'identifier' && i > 0) {
            const prevSibling = importNode.child(i - 1);
            if (prevSibling?.text === 'as') {
                return child.text;
            }
        }
    }
    return null;
}

export function findImportAlias(root: SyntaxNode, aliasName: string): SyntaxNode | null {
    const imports = ast.findNodesByType(root, 'ui_import');
    
    for (const importNode of imports) {
        const alias = getImportAlias(importNode);
        if (alias === aliasName) {
            for (let i = 0; i < importNode.childCount; i++) {
                const child = importNode.child(i);
                if (child?.type === 'identifier' && child.text === aliasName) {
                    return child;
                }
            }
        }
    }
    
    return null;
}

/**
 * Check if a node is part of an import statement by walking up the AST.
 */
export function isInImportStatement(node: SyntaxNode): boolean {
    for (const ancestor of ast.traverseParents(node)) {
        if (ancestor.type === 'ui_import') {
            return true;
        }
    }
    return false;
}

/**
 * Get the ui_import ancestor of a node, if any.
 */
export function findContainingImport(node: SyntaxNode): SyntaxNode | null {
    for (const ancestor of ast.traverseParents(node)) {
        if (ancestor.type === 'ui_import') {
            return ancestor;
        }
    }
    return null;
}
