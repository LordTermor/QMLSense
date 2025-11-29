import * as vscode from 'vscode';
import type { SyntaxNode, Tree } from '../../parser/qmlParser';
import { getParser } from '../../parser/qmlParser';
import { TokenClassifier } from './tokenClassifier';
import { ImportTracker } from './importTracker';
import { TokenEmitter } from './tokenEmitter';
import * as ast from '../../symbols/ast';

/**
 * Provides semantic tokens for rich syntax highlighting in QML files.
 * Uses comprehensive tree-sitter AST traversal to emit tokens for every
 * identifier, keyword, and literal with appropriate semantic classification.
 */
export class QmlSemanticTokensProvider implements vscode.DocumentSemanticTokensProvider {
    // Set to symbol name to debug traversal
    private static DEBUG_SYMBOL: string | null = "internal";
    
    // Using VS Code standard semantic token types for better theme support
    private static readonly tokenTypes = [
        'class',            // 0 - QML object types (Rectangle, Button, custom components)
        'property',         // 1 - Properties
        'method',           // 2 - Functions/methods (better theme support than 'function')
        'event',            // 3 - Signals
        'variable',         // 4 - Variables, IDs
        'keyword',          // 5 - QML/JS keywords
        'type',             // 6 - Type names (int, string, etc.)
        'namespace',        // 7 - Import module paths (QtQuick.Controls, MyModule)
        'string',           // 8 - String literals
        'number',           // 9 - Numeric literals
        'parameter',        // 10 - Function/signal parameters
        'interface',        // 11 - QML object IDs (declared and referenced)
        'decorator'         // 12 - Import aliases (QQC, CoreKit - unused in QML otherwise)
    ];

    private static readonly tokenModifiers = [
        'declaration',      // 0 - Symbol declarations
        'readonly',         // 1 - Readonly properties
        'defaultLibrary',   // 2 - Qt built-in types (gets special coloring)
        'static',           // 3 - For namespace-like access (Qt.AlignCenter)
        'modification'      // 4 - For property assignments vs declarations
    ];

    static getLegend(): vscode.SemanticTokensLegend {
        return new vscode.SemanticTokensLegend(
            QmlSemanticTokensProvider.tokenTypes,
            QmlSemanticTokensProvider.tokenModifiers
        );
    }

    async provideDocumentSemanticTokens(
        document: vscode.TextDocument,
        token: vscode.CancellationToken
    ): Promise<vscode.SemanticTokens> {
        const parser = getParser();
        
        if (!parser.isInitialized()) {
            await parser.initialize();
        }

        const tree = parser.parse(document.getText());
        const builder = new vscode.SemanticTokensBuilder(QmlSemanticTokensProvider.getLegend());

        const importTracker = new ImportTracker();
        const tokenEmitter = new TokenEmitter(builder, document);
        const classifier = new TokenClassifier(importTracker);

        classifier.collectDeclaredIds(tree.rootNode);

        this.traverse(tree.rootNode, importTracker, classifier, tokenEmitter);

        return builder.build();
    }

    /**
     * Recursively traverse the AST and emit tokens for relevant nodes.
     */
    private traverse(
        node: SyntaxNode,
        importTracker: ImportTracker,
        classifier: TokenClassifier,
        emitter: TokenEmitter
    ): void {
        if (node.type === 'ui_import') {
            importTracker.processImport(node);
        }

        this.classifyAndEmit(node, classifier, emitter);

        for (let i = 0; i < node.namedChildCount; i++) {
            const child = node.namedChild(i);
            if (child) {
                this.traverse(child, importTracker, classifier, emitter);
            }
        }
    }

    /**
     * Classify a node and emit its token if applicable.
     */
    private classifyAndEmit(
        node: SyntaxNode,
        classifier: TokenClassifier,
        emitter: TokenEmitter
    ): void {
        const debug = QmlSemanticTokensProvider.DEBUG_SYMBOL && node.text === QmlSemanticTokensProvider.DEBUG_SYMBOL;
        
        if (debug) {
            console.log(`\n🔎 [PROVIDER] Found node with text "${node.text}"`);
            console.log(`  Node type: ${node.type}`);
            console.log(`  Parent: ${node.parent?.type}`);
        }
        
        const skipTypes = ['program', 'ui_object_initializer', 'statement_block', 'ui_signal_parameters', 
                          'formal_parameters', 'arguments', 'object', 'array', 'ui_version_specifier'];
        if (skipTypes.includes(node.type)) {
            if (debug) console.log(`  ✗ Skipped: structural node type "${node.type}"`);
            return;
        }

        const keywordClassification = classifier.classifyKeyword(node);
        if (keywordClassification) {
            if (debug) console.log(`  ✓ Classified as keyword`);
            emitter.emit(node, keywordClassification.tokenType, keywordClassification.modifiers);
            return;
        }

        const literalClassification = classifier.classifyLiteral(node);
        if (literalClassification) {
            if (debug) console.log(`  ✓ Classified as literal`);
            emitter.emit(node, literalClassification.tokenType, literalClassification.modifiers);
            return;
        }

        if (ast.isNodeType(node, 'identifier', 'property_identifier', 'type_identifier')) {
            if (debug) console.log(`  → Calling classifyIdentifier...`);
            const classification = classifier.classifyIdentifier(node, node.parent);
            if (classification) {
                if (debug) console.log(`  ✓ Got classification, emitting token`);
                emitter.emit(node, classification.tokenType, classification.modifiers);
            } else {
                if (debug) console.log(`  ✗ classifyIdentifier returned null`);
            }
        } else {
            if (debug) console.log(`  ✗ Not an identifier type (${node.type})`);
        }
    }
}
