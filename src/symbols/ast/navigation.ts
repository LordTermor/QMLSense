import * as vscode from 'vscode';
import type { SyntaxNode, Tree } from '../../parser/qmlParser';

/**
 * Compare two tree-sitter nodes by position.
 * CRITICAL: Never use === to compare nodes - it always returns false!
 * Tree-sitter nodes must be compared by their positions.
 */
export function nodesEqual(node1: SyntaxNode | null | undefined, node2: SyntaxNode | null | undefined): boolean {
    if (!node1 || !node2) return node1 === node2;
    return node1.startIndex === node2.startIndex && node1.endIndex === node2.endIndex;
}

/**
 * Check if child node is contained within parent node's range.
 */
export function nodeContains(parent: SyntaxNode, child: SyntaxNode): boolean {
    return child.startIndex >= parent.startIndex && child.endIndex <= parent.endIndex;
}

export function nodeToRange(node: SyntaxNode, document: vscode.TextDocument): vscode.Range {
    const startPos = document.positionAt(node.startIndex);
    const endPos = document.positionAt(node.endIndex);
    return new vscode.Range(startPos, endPos);
}

export function getNodeAtPosition(
    root: SyntaxNode,
    offset: number,
    isRelevant: (node: SyntaxNode) => boolean
): SyntaxNode | null {
    let current: SyntaxNode | null = root.descendantForIndex(offset);
    
    while (current) {
        if (isRelevant(current)) return current;
        current = current.parent;
    }
    
    return null;
}

export function findNode(
    node: SyntaxNode,
    predicate: (node: SyntaxNode) => boolean
): SyntaxNode | null {
    if (predicate(node)) return node;
    
    for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (!child) continue;
        
        const found = findNode(child, predicate);
        if (found) return found;
    }
    
    return null;
}

export function findNodesByType(root: SyntaxNode, type: string): SyntaxNode[] {
    const results: SyntaxNode[] = [];
    
    traverse(root, (node) => {
        if (node.type === type) {
            results.push(node);
        }
    });
    
    return results;
}

export function traverse(node: SyntaxNode, callback: (node: SyntaxNode) => void): void {
    callback(node);
    
    for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (child) {
            traverse(child, callback);
        }
    }
}

export function* traverseNodes(node: SyntaxNode): Generator<SyntaxNode> {
    yield node;
    
    for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (child) {
            yield* traverseNodes(child);
        }
    }
}

export function* traverseParents(node: SyntaxNode): Generator<SyntaxNode> {
    let current: SyntaxNode | null = node.parent;
    
    while (current) {
        yield current;
        current = current.parent;
    }
}

/**
 * Check if a node's type matches any of the given types.
 * More readable than chaining multiple `node.type === 'x' || node.type === 'y'` comparisons.
 * 
 * @param node - The node to check
 * @param types - One or more node type strings to match against
 * @returns true if the node type matches any of the given types
 * 
 * @example
 * // Instead of: node.type === 'identifier' || node.type === 'type_identifier'
 * if (isNodeType(node, 'identifier', 'type_identifier')) { ... }
 * 
 * // Negation:
 * if (!isNodeType(node, 'ui_import', 'program')) { ... }
 */
export function isNodeType(node: SyntaxNode, ...types: string[]): boolean {
    return types.includes(node.type);
}

/**
 * Alias for isNodeType for better readability in some contexts.
 * @see isNodeType
 */
export const matchesNodeType = isNodeType;

export function getField(node: SyntaxNode, fieldName: string): SyntaxNode | null {
    return node.childForFieldName(fieldName);
}

export function getFieldText(node: SyntaxNode, fieldName: string): string | null {
    return getField(node, fieldName)?.text ?? null;
}

/**
 * Check if a node is at a specific field position in its parent.
 * Useful for determining if a node is the value of a named field.
 * 
 * @param node - The node to check
 * @param parent - The parent node
 * @param fieldName - The field name to check (e.g., 'name', 'type_name', 'property')
 * @returns true if the node is at the specified field position
 * 
 * @example
 * // Check if node is the type_name field of its parent
 * if (isAtField(node, parent, 'type_name')) { ... }
 */
export function isAtField(node: SyntaxNode, parent: SyntaxNode, fieldName: string): boolean {
    const field = parent.childForFieldName(fieldName);
    return nodesEqual(node, field);
}

/**
 * Check if a node's ancestor chain matches a given type pattern.
 * Walks up from the node checking each parent against the pattern.
 * 
 * @param node - The starting node
 * @param pattern - Array of ancestor types to match, starting from immediate parent
 * @returns true if the ancestor chain matches the pattern
 * 
 * @example
 * // Check if node.parent is 'nested_identifier' AND node.parent.parent is 'ui_object_definition'
 * hasAncestorChain(node, ['nested_identifier', 'ui_object_definition'])
 * 
 * // Check if node.parent is 'ui_binding'
 * hasAncestorChain(node, ['ui_binding'])
 */
export function hasAncestorChain(node: SyntaxNode, pattern: string[]): boolean {
    let current: SyntaxNode | null = node.parent;
    
    for (const expectedType of pattern) {
        if (!current || current.type !== expectedType) {
            return false;
        }
        current = current.parent;
    }
    
    return true;
}

/**
 * Find the first ancestor matching any of the given types.
 * Walks up the AST tree until it finds a node matching one of the types or reaches the root.
 * 
 * @param node - The starting node
 * @param types - Array of node types to search for
 * @returns The first matching ancestor node, or null if none found
 * 
 * @example
 * // Find the containing ui_import or reach program root
 * const ancestor = findAncestorOfType(node, ['ui_import', 'program']);
 * if (ancestor?.type === 'ui_import') {
 *   // Found import statement
 * }
 */
export function findAncestorOfType(node: SyntaxNode, types: string[]): SyntaxNode | null {
    let current: SyntaxNode | null = node.parent;
    
    while (current) {
        if (types.includes(current.type)) {
            return current;
        }
        current = current.parent;
    }
    
    return null;
}
