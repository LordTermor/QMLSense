import * as vscode from 'vscode';
import type { SyntaxNode, Tree } from '../../parser/qmlParser';
import { getParser } from '../../parser/qmlParser';
import * as ast from '../../symbols/ast';

/**
 * QML Selection Range Provider with smart semantic expansion.
 * Provides context-aware selection for Shift+Alt+Right/Left.
 */

// Priority levels for selection expansion (lower = expand first)
const PRIORITY_MAP = new Map<string, number>([
    // Atoms - start here
    ['identifier', 1],
    ['property_identifier', 1],
    ['type_identifier', 1],
    ['number', 1],
    ['true', 1],
    ['false', 1],
    ['null', 1],
    ['undefined', 1],
    
    // String content (without quotes), then with quotes
    ['string_fragment', 2],
    ['string', 3],
    ['template_string', 3],
    
    // Member expressions - expand incrementally (a → a.b → a.b.c)
    ['member_expression', 4],
    
    // Qualified types and property groups (QQC → QQC.Button, section → section.property)
    ['nested_identifier', 5],
    
    // Expressions
    ['call_expression', 6],
    ['binary_expression', 6],
    ['ternary_expression', 6],
    ['parenthesized_expression', 6],
    ['unary_expression', 6],
    ['update_expression', 6],
    ['arrow_function', 6],
    
    // Arrays and objects
    ['array', 7],
    ['object', 7],
    ['arguments', 7],
    
    // QML bindings and properties
    ['ui_binding', 8],
    ['ui_property', 8],
    ['ui_signal', 8],
    
    // Statements
    ['expression_statement', 9],
    ['return_statement', 9],
    ['if_statement', 9],
    ['for_statement', 9],
    ['while_statement', 9],
    ['lexical_declaration', 9],
    
    // Code blocks
    ['statement_block', 10],
    ['formal_parameters', 10],
    ['ui_signal_parameters', 10],
    
    // Function and component definitions
    ['function_declaration', 11],
    ['ui_inline_component', 11],
    
    // QML objects (skip initializer, go directly to definition)
    // Property groups (lowercase objects like 'anchors') have higher priority
    ['ui_object_definition', 12],
    
    // Import statements
    ['ui_import', 13],
    
    // Top-level program
    ['program', 100]
]);

// Nodes to skip (don't create selection ranges for these)
const SKIP_NODES = new Set([
    'ui_object_initializer',  // Just braces, skip to ui_object_definition
    'ui_annotated_object',    // Wrapper, skip to actual object
    'ui_pragma',              // Rarely useful to select
    'ui_version_specifier',   // Version (2.15) - too granular, select whole import instead
    'comment',                // Comments handled by editor
    '.', ',', ':', ';', '(', ')', '[', ']', '{', '}',  // Punctuation
    'import', 'as', 'property', 'signal', 'function', 'readonly', 'required'  // Keywords
]);

export class QmlSelectionRangeProvider implements vscode.SelectionRangeProvider {
    async provideSelectionRanges(
        document: vscode.TextDocument,
        positions: vscode.Position[],
        token: vscode.CancellationToken
    ): Promise<vscode.SelectionRange[] | undefined> {
        const parser = getParser();
        
        if (!parser.isInitialized()) {
            await parser.initialize();
        }

        const tree = parser.parse(document.getText());
        const ranges: vscode.SelectionRange[] = [];

        for (const position of positions) {
            const offset = document.offsetAt(position);
            const range = this.buildSelectionRange(tree.rootNode, offset, document);
            if (range) {
                ranges.push(range);
            }
        }

        return ranges;
    }

    private buildSelectionRange(
        root: SyntaxNode,
        offset: number,
        document: vscode.TextDocument
    ): vscode.SelectionRange | undefined {
        let current: SyntaxNode | null = root.descendantForIndex(offset);
        if (!current) return undefined;

        // Collect all ancestors with priorities
        const candidates: Array<{ node: SyntaxNode; priority: number }> = [];

        while (current) {
            // Skip noise nodes
            if (!SKIP_NODES.has(current.type)) {
                const priority = this.getNodePriority(current, offset);
                if (priority !== null) {
                    candidates.push({ node: current, priority });
                }
            }
            current = current.parent;
        }

        // Sort by priority (ascending - lower priority expands first)
        candidates.sort((a, b) => a.priority - b.priority);

        // Build selection range chain (VS Code expects outermost → innermost)
        // We reverse the array so the largest range becomes the root parent
        let selectionRange: vscode.SelectionRange | undefined = undefined;
        const seenRanges = new Set<string>();

        for (let i = candidates.length - 1; i >= 0; i--) {
            const { node } = candidates[i];
            const range = ast.nodeToRange(node, document);
            const rangeKey = `${range.start.line}:${range.start.character}-${range.end.line}:${range.end.character}`;
            
            // Skip duplicate ranges (e.g., nested_identifier wrapping single identifier)
            if (seenRanges.has(rangeKey)) {
                continue;
            }
            
            seenRanges.add(rangeKey);
            selectionRange = new vscode.SelectionRange(range, selectionRange);
        }

        return selectionRange;
    }

    /**
     * Get priority for a node, considering context.
     * Lower priority = expand earlier.
     */
    private getNodePriority(node: SyntaxNode, offset: number): number | null {
        const baseType = node.type;
        
        // Use priority map
        const basePriority = PRIORITY_MAP.get(baseType);
        if (basePriority === undefined) {
            // Unknown types get medium priority
            return 50;
        }

        // Context-aware adjustments
        let priority = basePriority;

        // Special handling for strings - select content first, then with quotes
        if (baseType === 'string') {
            priority = this.getStringSelectionPriority(node, offset);
        }

        // For nested_identifier in type position (QQC.Button), boost priority slightly
        // so we expand identifier → nested_identifier → ui_object_definition smoothly
        if (baseType === 'nested_identifier' && node.parent?.type === 'ui_object_definition') {
            const typeName = ast.getField(node.parent, 'type_name');
            // Use nodesEqual for comparison (node identity comparison always fails!)
            if (typeName && ast.nodesEqual(typeName, node)) {
                priority = 4.5; // Between identifier and regular nested_identifier
            }
        }

        // For member_expression, use incremental expansion
        if (baseType === 'member_expression') {
            priority = this.getMemberExpressionPriority(node);
        }

        // For ui_binding, differentiate between simple and complex
        if (baseType === 'ui_binding') {
            const value = ast.getField(node, 'value');
            if (value && this.isComplexExpression(value)) {
                priority = 8.5; // Expand expression first, then binding
            }
        }

        // For ui_object_definition, check if it's a property group (lowercase name)
        if (baseType === 'ui_object_definition') {
            const typeName = ast.getFieldText(node, 'type_name');
            if (typeName && typeName[0] === typeName[0].toLowerCase()) {
                // Property group (anchors, font, etc) - expand earlier than regular objects
                priority = 11;
            }
        }

        return priority;
    }

    /**
     * Smart string selection: content first, then with quotes.
     */
    private getStringSelectionPriority(node: SyntaxNode, offset: number): number {
        // If cursor is inside quotes, prefer selecting content first
        const startQuoteOffset = node.startIndex;
        const endQuoteOffset = node.endIndex;
        
        // Check if we have string_fragment child (content without quotes)
        for (let i = 0; i < node.childCount; i++) {
            const child = node.child(i);
            if (child?.type === 'string_fragment') {
                // Content exists, will be selected first (priority 2)
                return 3;
            }
        }
        
        // No content child, just select the whole string
        return 3;
    }

    /**
     * Member expression priority based on tree structure.
     * We want to expand incrementally: Ui → Ui.theme → Ui.theme.sizes → full expression
     * 
     * The tree structure for Ui.theme.sizes.cardMainMargin is:
     *   member_expression (outermost - full expression)
     *     member_expression (middle)
     *       member_expression (innermost - Ui.theme)
     *         identifier (Ui)
     * 
     * We walk UP from current node to count how many parent member_expressions exist.
     * More parents = this is deeper in tree = expand earlier (lower priority)
     */
    private getMemberExpressionPriority(node: SyntaxNode): number {
        // Count how many member_expression ancestors this node has
        let ancestorCount = 0;
        let current: SyntaxNode | null = node.parent;
        
        while (current) {
            if (current.type === 'member_expression') {
                ancestorCount++;
            }
            current = current.parent;
        }
        
        // More ancestors = deeper in tree = should expand earlier (lower priority)
        // Base priority 4, subtract 0.1 per ancestor level
        // Innermost (most ancestors): priority ~3.7
        // Outermost (no ancestors): priority 4.0
        return 4 - (ancestorCount * 0.1);
    }

    /**
     * Check if an expression is complex (not just a literal or identifier).
     */
    private isComplexExpression(node: SyntaxNode): boolean {
        const simpleTypes = new Set([
            'identifier', 'property_identifier', 'type_identifier',
            'number', 'string', 'true', 'false', 'null', 'undefined'
        ]);
        
        return !simpleTypes.has(node.type);
    }

    /**
     * Debug method: get detailed selection range information for a position.
     * Used by the debug command to show how selection would expand.
     */
    public async debugSelectionRanges(
        document: vscode.TextDocument,
        position: vscode.Position
    ): Promise<string> {
        const parser = getParser();
        if (!parser.isInitialized()) {
            await parser.initialize();
        }

        const tree = parser.parse(document.getText());
        const offset = document.offsetAt(position);
        
        let current: SyntaxNode | null = tree.rootNode.descendantForIndex(offset);
        if (!current) {
            return 'No node found at cursor position';
        }

        // Collect all ancestors
        const ancestors: Array<{ node: SyntaxNode; priority: number; skipped: boolean }> = [];
        let node: SyntaxNode | null = current;

        while (node) {
            const skipped = SKIP_NODES.has(node.type);
            const priority = skipped ? null : this.getNodePriority(node, offset);
            
            ancestors.push({
                node,
                priority: priority ?? -1,
                skipped
            });
            
            node = node.parent;
        }

        // Build output
        const lines: string[] = [];
        lines.push('SELECTION RANGE DEBUG');
        lines.push('='.repeat(80));
        lines.push(`Position: Line ${position.line + 1}, Character ${position.character + 1}`);
        lines.push(`Offset: ${offset}`);
        lines.push('='.repeat(80));
        lines.push('');
        lines.push('AST PATH (from cursor to root):');
        lines.push('');

        for (let i = 0; i < ancestors.length; i++) {
            const { node, priority, skipped } = ancestors[i];
            const indent = '  '.repeat(i);
            const pos = `[${document.positionAt(node.startIndex).line + 1}:${document.positionAt(node.startIndex).character + 1}-${document.positionAt(node.endIndex).line + 1}:${document.positionAt(node.endIndex).character + 1}]`;
            const text = node.text.length > 40 
                ? node.text.substring(0, 37).replace(/\n/g, '\\n') + '...'
                : node.text.replace(/\n/g, '\\n');
            
            let status = '';
            if (skipped) {
                status = ' [SKIPPED]';
            } else if (priority >= 0) {
                status = ` [priority: ${priority.toFixed(1)}]`;
            }

            lines.push(`${indent}${node.type} ${pos}${status}`);
            lines.push(`${indent}  "${text}"`);
        }

        lines.push('');
        lines.push('='.repeat(80));
        lines.push('SELECTION EXPANSION ORDER:');
        lines.push('');

        // Filter and sort by priority
        const selectable = ancestors
            .filter(a => !a.skipped && a.priority >= 0)
            .sort((a, b) => a.priority - b.priority);

        const seenRanges = new Set<string>();
        let expansionStep = 1;

        for (const { node, priority } of selectable) {
            const range = ast.nodeToRange(node, document);
            const rangeKey = `${range.start.line}:${range.start.character}-${range.end.line}:${range.end.character}`;
            
            if (seenRanges.has(rangeKey)) {
                lines.push(`  [DUPLICATE RANGE - skipped] ${node.type} (priority ${priority.toFixed(1)})`);
                continue;
            }
            
            seenRanges.add(rangeKey);
            
            const pos = `Line ${range.start.line + 1}:${range.start.character + 1} - ${range.end.line + 1}:${range.end.character + 1}`;
            const text = node.text.length > 50
                ? node.text.substring(0, 47).replace(/\n/g, '\\n') + '...'
                : node.text.replace(/\n/g, '\\n');
            
            lines.push(`${expansionStep}. ${node.type} (priority ${priority.toFixed(1)})`);
            lines.push(`   Range: ${pos}`);
            lines.push(`   Text: "${text}"`);
            lines.push('');
            
            expansionStep++;
        }

        lines.push('='.repeat(80));
        lines.push(`Total expansion steps: ${expansionStep - 1}`);
        
        return lines.join('\n');
    }
}
