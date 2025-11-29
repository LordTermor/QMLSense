import type { SyntaxNode, Tree } from '../../parser/qmlParser';
import { ImportTracker } from './importTracker';
import { qmlKeywords } from './builtinTypes';
import * as ast from '../../symbols/ast';
import { identifierRules, type ClassificationContext } from './classificationRules';

/**
 * Token type indices matching the legend.
 */
export enum TokenType {
    Class = 0,
    Property = 1,
    Method = 2,
    Event = 3,
    Variable = 4,
    Keyword = 5,
    Type = 6,
    Namespace = 7,
    String = 8,
    Number = 9,
    Parameter = 10,
    Interface = 11,
    Decorator = 12
}

/**
 * Token modifier bit flags.
 */
export enum TokenModifier {
    Declaration = 1 << 0,
    Readonly = 1 << 1,
    DefaultLibrary = 1 << 2,
    Static = 1 << 3,
    Modification = 1 << 4
}

/**
 * Classification result for a node.
 */
export interface TokenClassification {
    tokenType: TokenType;
    modifiers: number;
}

/**
 * Classifies AST nodes into semantic token types with appropriate modifiers.
 */
export class TokenClassifier {
    // Set this to a symbol name to enable debug logging for that symbol
    private static DEBUG_SYMBOL: string | null = 'internal';
    
    // Track declared ID names in the current document
    private declaredIds = new Set<string>();
    
    constructor(private importTracker: ImportTracker) {}

    /**
     * Collect all declared ID names from the AST.
     * Should be called once before classifying tokens.
     */
    collectDeclaredIds(root: SyntaxNode): void {
        this.declaredIds.clear();
        this.traverseForIds(root);
    }

    private traverseForIds(node: SyntaxNode): void {
        // Check if this is an id binding
        if (ast.qml.isIdBinding(node)) {
            const idValue = ast.qml.getIdValue(node);
            if (idValue) {
                this.declaredIds.add(idValue);
            }
        }

        for (let i = 0; i < node.namedChildCount; i++) {
            const child = node.namedChild(i);
            if (child) {
                this.traverseForIds(child);
            }
        }
    }

    /**
     * Classify an identifier node based on its parent and context.
     * Uses a declarative rule-based system for clean, maintainable classification.
     */
    classifyIdentifier(node: SyntaxNode, parent: SyntaxNode | null): TokenClassification | null {
        if (!parent) return null;

        const nodeText = node.text;
        const debug = TokenClassifier.DEBUG_SYMBOL === nodeText;
        
        if (debug) {
            console.log(`\n🔍 [DEBUG] Classifying: "${nodeText}"`);
            console.log(`  Node type: ${node.type}`);
            console.log(`  Parent type: ${parent.type}`);
            console.log(`  Parent text: "${parent.text.substring(0, 60)}..."`);
            console.log(`  Declared IDs:`, Array.from(this.declaredIds));
            console.log(`  Is declared ID:`, this.declaredIds.has(nodeText));
            if (parent.parent) {
                console.log(`  Grandparent type: ${parent.parent.type}`);
            }
        }

        const context: ClassificationContext = {
            node,
            parent,
            nodeText,
            importTracker: this.importTracker,
            declaredIds: this.declaredIds,
            debug
        };

        for (const rule of identifierRules) {
            const result = rule(context);
            if (result !== null) {
                return result;
            }
        }

        return { tokenType: TokenType.Variable, modifiers: 0 };
    }

    /**
     * Classify a literal node (string, number, boolean).
     */
    classifyLiteral(node: SyntaxNode): TokenClassification | null {
        if (node.type === 'string') {
            return { tokenType: TokenType.String, modifiers: 0 };
        }
        if (node.type === 'number') {
            return { tokenType: TokenType.Number, modifiers: 0 };
        }
        if (ast.isNodeType(node, 'true', 'false')) {
            return { tokenType: TokenType.Keyword, modifiers: 0 };
        }
        if (ast.isNodeType(node, 'null', 'undefined')) {
            return { tokenType: TokenType.Keyword, modifiers: 0 };
        }
        return null;
    }

    /**
     * Classify special keywords that are their own nodes.
     */
    classifyKeyword(node: SyntaxNode): TokenClassification | null {
        const keywordTypes = [
            'import', 'as', 'property', 'signal', 'function', 'readonly', 'required', 'default',
            'let', 'const', 'var', 'if', 'else', 'return', 'for', 'while', 'do', 'switch',
            'case', 'break', 'continue', 'new', 'this', 'typeof', 'instanceof', 'in', 'delete',
            'void', 'try', 'catch', 'finally', 'throw'
        ];
        
        if (keywordTypes.includes(node.type) || qmlKeywords.has(node.text)) {
            return { tokenType: TokenType.Keyword, modifiers: 0 };
        }
        return null;
    }
}
