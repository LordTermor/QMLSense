import type { SyntaxNode, Tree } from '../../parser/qmlParser';
import * as vscode from 'vscode';
import * as ast from './navigation';

/**
 * Information about a parsed import statement.
 */
export interface ImportInfo {
    /** The module/file path being imported */
    source: string;
    /** Version string if present (e.g., "2.15") */
    version?: string;
    /** Import alias if present (e.g., "QQC" from "import QtQuick.Controls 2.15 as QQC") */
    alias?: string;
    /** AST nodes for each part */
    nodes: {
        source: SyntaxNode;
        version?: SyntaxNode;
        alias?: SyntaxNode;
    };
}

/**
 * Information about a parsed qualified type name.
 */
export interface QualifiedTypeInfo {
    /** The qualifier/namespace part (e.g., "QQC" from "QQC.Button") */
    qualifier?: string;
    /** The component type name (e.g., "Button" from "QQC.Button") */
    component: string;
    /** Full type name */
    full: string;
    /** AST nodes for each part (only present when parsed from node) */
    nodes?: {
        qualifier?: SyntaxNode;
        component: SyntaxNode;
        full: SyntaxNode;
    };
}

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
        
        if (isPropertyGroupName(typeName)) continue;
        
        return ancestor;
    }
    
    return null;
}

function findContainingObject(node: SyntaxNode): SyntaxNode | null {
    for (const ancestor of ast.traverseParents(node)) {
        if (ancestor.type === 'ui_object_definition') {
            const typeName = ast.getFieldText(ancestor, 'type_name');
            if (typeName && !isPropertyGroupName(typeName)) {
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
    
    return isPropertyGroupName(typeName);
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

/**
 * Get the leftmost (first) identifier in a nested_identifier chain.
 * For "A.B.C", returns the node for "A".
 * Handles deeply nested structures by walking the 'object' field recursively.
 */
export function getLeftmostIdentifier(nestedIdent: SyntaxNode): SyntaxNode | null {
    if (nestedIdent.type !== 'nested_identifier') {
        return null;
    }
    
    let leftmost = nestedIdent;
    while (leftmost.childForFieldName('object')?.type === 'nested_identifier') {
        leftmost = leftmost.childForFieldName('object')!;
    }
    
    return leftmost.childForFieldName('object') || leftmost.namedChildren[0];
}

/**
 * Check if a node is the first (leftmost) part of a nested_identifier.
 * For "QQC.Button", returns true if node is "QQC".
 */
export function isFirstPartOfNestedIdentifier(
    node: SyntaxNode,
    nestedIdent: SyntaxNode
): boolean {
    if (nestedIdent.type !== 'nested_identifier') {
        return false;
    }
    
    const firstPart = getLeftmostIdentifier(nestedIdent);
    return ast.nodesEqual(node, firstPart);
}

/**
 * Check if a node is the last (rightmost) part of a nested_identifier.
 * For "QQC.Button", returns true if node is "Button".
 */
export function isLastPartOfNestedIdentifier(
    node: SyntaxNode,
    nestedIdent: SyntaxNode
): boolean {
    if (nestedIdent.type !== 'nested_identifier') {
        return false;
    }
    
    const lastPart = nestedIdent.lastNamedChild;
    return ast.nodesEqual(node, lastPart);
}

/**
 * Parse an import statement into structured information.
 * Extracts the module/file path, version, and alias with their AST nodes.
 * 
 * @example
 * // import QtQuick.Controls 2.15 as QQC
 * parseImport(importNode) → {
 *   source: "QtQuick.Controls",
 *   version: "2.15",
 *   alias: "QQC",
 *   nodes: { source: ..., version: ..., alias: ... }
 * }
 */
export function parseImport(importNode: SyntaxNode): ImportInfo | null {
    if (importNode.type !== 'ui_import') {
        return null;
    }

    const sourceNode = importNode.childForFieldName('source');
    if (!sourceNode) {
        return null;
    }

    const info: ImportInfo = {
        source: sourceNode.text.replace(/['"]/g, ''),
        nodes: { source: sourceNode }
    };

    for (let i = 0; i < importNode.childCount; i++) {
        const child = importNode.child(i);
        if (!child) continue;

        if (child.type === 'ui_version_specifier') {
            info.version = child.text;
            info.nodes.version = child;
        }
        else if (child.text === 'as' && i + 1 < importNode.childCount) {
            const aliasNode = importNode.child(i + 1);
            if (aliasNode?.type === 'identifier') {
                info.alias = aliasNode.text;
                info.nodes.alias = aliasNode;
            }
        }
    }

    return info;
}

/**
 * Parse a qualified type name from an AST node.
 * Handles both simple types ("Button") and qualified types ("QQC.Button").
 * 
 * @example
 * // QQC.Button
 * parseQualifiedType(nestedIdentNode) → {
 *   qualifier: "QQC",
 *   component: "Button",
 *   full: "QQC.Button",
 *   nodes: { ... }
 * }
 */
export function parseQualifiedType(typeNameNode: SyntaxNode): QualifiedTypeInfo | null {
    const full = typeNameNode.text;

    if (typeNameNode.type === 'nested_identifier') {
        const firstPart = getLeftmostIdentifier(typeNameNode);
        const lastPart = typeNameNode.lastNamedChild;

        if (!firstPart || !lastPart) {
            return null;
        }

        const qualifier = firstPart.text;
        const component = lastPart.text;

        return {
            qualifier,
            component,
            full,
            nodes: {
                qualifier: firstPart,
                component: lastPart,
                full: typeNameNode
            }
        };
    }

    if (ast.isNodeType(typeNameNode, 'identifier', 'type_identifier')) {
        return {
            component: full,
            full,
            nodes: {
                component: typeNameNode,
                full: typeNameNode
            }
        };
    }

    return null;
}

/**
 * Parse a qualified type name from a string.
 * Useful when you only have the text and don't need AST node references.
 * 
 * @example
 * parseQualifiedTypeName("QQC.Button") → { qualifier: "QQC", component: "Button" }
 * parseQualifiedTypeName("Button") → { component: "Button" }
 */
export function parseQualifiedTypeName(typeName: string): { qualifier?: string; component: string } {
    if (typeName.includes('.')) {
        const parts = typeName.split('.');
        return {
            qualifier: parts[0],
            component: parts.slice(1).join('.')
        };
    }
    return { component: typeName };
}

/**
 * Check if a binding name follows the signal handler pattern.
 * Signal handlers start with "on" followed by a capital letter.
 * 
 * @example
 * isSignalHandler("onClick") → true
 * isSignalHandler("onCompleted") → true
 * isSignalHandler("onclick") → false
 * isSignalHandler("text") → false
 */
export function isSignalHandler(bindingName: string): boolean {
    return bindingName.startsWith('on') && 
           bindingName.length > 2 && 
           bindingName[2] === bindingName[2].toUpperCase();
}

/**
 * Check if a ui_binding node is an ID binding (id: myId).
 * 
 * @example
 * if (isIdBinding(node)) {
 *   const idName = getIdValue(node); // Extract "myId"
 * }
 */
export function isIdBinding(node: SyntaxNode): boolean {
    if (node.type !== 'ui_binding') return false;
    const nameNode = ast.getField(node, 'name');
    return nameNode?.text === 'id';
}

/**
 * Extract the ID value from an id binding node.
 * Returns the identifier name (e.g., "myRect" from "id: myRect").
 * Returns null if not an ID binding or value cannot be extracted.
 * 
 * @example
 * const idName = getIdValue(bindingNode); // "myRect"
 */
export function getIdValue(bindingNode: SyntaxNode): string | null {
    if (!isIdBinding(bindingNode)) return null;
    
    const value = ast.getField(bindingNode, 'value');
    if (!value) return null;
    
    for (let i = 0; i < value.namedChildCount; i++) {
        const child = value.namedChild(i);
        if (child?.type === 'expression_statement') {
            const idNode = child.firstNamedChild;
            if (idNode?.type === 'identifier') {
                return idNode.text;
            }
        }
    }
    
    const descendant = value.descendantForIndex(value.startIndex);
    if (descendant?.type === 'identifier') {
        return descendant.text;
    }
    
    return null;
}

/**
 * Check if a type name represents a property group (lowercase start).
 * Property groups like "anchors", "font" are QML objects that start with lowercase.
 * 
 * @example
 * isPropertyGroupName("anchors") → true
 * isPropertyGroupName("Rectangle") → false
 */
export function isPropertyGroupName(typeName: string): boolean {
    if (!typeName || typeName.length === 0) return false;
    return typeName[0] === typeName[0].toLowerCase();
}
