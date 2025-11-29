import * as vscode from 'vscode';
import type { SyntaxNode } from '../../parser/qmlParser';
import { getParser } from '../../parser/qmlParser';
import { QmlSemanticTokensProvider } from './semanticTokensProvider';
import { ImportTracker } from './importTracker';
import { TokenClassifier } from './tokenClassifier';
import * as ast from '../../symbols/ast';

/**
 * Semantic Tokens Debug Commands
 * Debug utilities for semantic highlighting and token classification.
 */

/**
 * Creates an output channel with a shorthand logging function.
 * React-hooks style helper to reduce boilerplate.
 */
function createOutput(name: string) {
    const output = vscode.window.createOutputChannel(name);
    const log = output.appendLine.bind(output);
    return { output, log };
}

export function registerSemanticTokensDebugCommands(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('qml.semanticTokens.inspectAtCursor', inspectSemanticTokens),
        vscode.commands.registerCommand('qml.semanticTokens.debugClassification', debugTokenClassification)
    );
}

async function inspectSemanticTokens(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== 'qml') {
        vscode.window.showWarningMessage('QML: No active QML file');
        return;
    }

    const position = editor.selection.active;
    const document = editor.document;

    const semanticProvider = new QmlSemanticTokensProvider();
    const cancellationTokenSource = new vscode.CancellationTokenSource();
    const tokens = await semanticProvider.provideDocumentSemanticTokens(document, cancellationTokenSource.token);

    if (!tokens) {
        vscode.window.showWarningMessage('QML: No semantic tokens available');
        return;
    }

    const { output, log } = createOutput('QML Semantic Tokens');
    output.clear();
    output.show();

    log('SEMANTIC TOKENS AT CURSOR\n');
    log('='.repeat(80));
    log(`File: ${document.fileName}`);
    log(`Position: Line ${position.line + 1}, Character ${position.character + 1}`);
    log('='.repeat(80));
    log('');

    const legend = QmlSemanticTokensProvider.getLegend();
    const data = tokens.data;
    
    let line = 0;
    let startChar = 0;
    const tokensAtCursor: Array<{
        line: number;
        startChar: number;
        length: number;
        type: string;
        modifiers: string[];
        text: string;
    }> = [];

    for (let i = 0; i < data.length; i += 5) {
        const deltaLine = data[i];
        const deltaStartChar = data[i + 1];
        const length = data[i + 2];
        const tokenType = data[i + 3];
        const tokenModifiers = data[i + 4];

        line += deltaLine;
        if (deltaLine > 0) {
            startChar = deltaStartChar;
        } else {
            startChar += deltaStartChar;
        }

        const type = legend.tokenTypes[tokenType];
        const modifiers: string[] = [];
        for (let j = 0; j < legend.tokenModifiers.length; j++) {
            if (tokenModifiers & (1 << j)) {
                modifiers.push(legend.tokenModifiers[j]);
            }
        }

        if (line === position.line && 
            position.character >= startChar && 
            position.character < startChar + length) {
            const range = new vscode.Range(line, startChar, line, startChar + length);
            const text = document.getText(range);
            tokensAtCursor.push({
                line,
                startChar,
                length,
                type,
                modifiers,
                text
            });
        }
    }

    if (tokensAtCursor.length === 0) {
        log('No semantic tokens found at cursor position\n');
        log('Possible reasons:');
        log('  • The identifier at cursor is not classified');
        log('  • The cursor is on whitespace or punctuation');
        log('  • Semantic tokens are not enabled in settings');
    } else {
        log(`Found ${tokensAtCursor.length} semantic token(s) at cursor:\n`);
        for (const token of tokensAtCursor) {
            log(`Token: "${token.text}"`);
            log(`  Type: ${token.type}`);
            log(`  Modifiers: ${token.modifiers.length > 0 ? token.modifiers.join(', ') : '(none)'}`);
            log(`  Range: Line ${token.line + 1}, Chars ${token.startChar + 1}-${token.startChar + token.length + 1}`);
            log(`  TextMate Scope: ${getTextMateScope(token.type, token.modifiers)}`);
            log('');
        }
    }

    log('-'.repeat(80));
    log(`Total tokens in document: ${data.length / 5}`);
    log(`Token types: ${legend.tokenTypes.join(', ')}`);
    log(`Token modifiers: ${legend.tokenModifiers.join(', ')}`);
}

async function debugTokenClassification(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== 'qml') {
        vscode.window.showWarningMessage('QML: No active QML file');
        return;
    }

    const position = editor.selection.active;
    const document = editor.document;
    const offset = document.offsetAt(position);

    const parser = getParser();
    if (!parser.isInitialized()) {
        await parser.initialize();
    }

    const tree = parser.parse(document.getText());
    
    let node: SyntaxNode | null = tree.rootNode.descendantForIndex(offset);
    let identifierNode: SyntaxNode | null = null;
    let current: SyntaxNode | null = node;
    
    while (current) {
        if (ast.isNodeType(current, 'identifier', 'property_identifier', 'type_identifier')) {
            identifierNode = current;
            break;
        }
        current = current.parent;
    }

    const { output, log } = createOutput('QML Token Classification Debug');
    output.clear();
    output.show();

    log('TOKEN CLASSIFICATION DEBUG\n');
    log('='.repeat(80));
    log(`File: ${document.fileName}`);
    log(`Position: Line ${position.line + 1}, Character ${position.character + 1}`);
    log('='.repeat(80));
    log('');

    if (!identifierNode) {
        log('❌ No identifier node found at cursor\n');
        log('AST at cursor:');
        if (node) {
            let path: string[] = [];
            let n: SyntaxNode | null = node;
            while (n) {
                path.unshift(`${n.type} "${n.text.substring(0, 30).replace(/\n/g, '\\n')}"`);
                n = n.parent;
            }
            path.forEach((p, i) => {
                log(`${'  '.repeat(i)}${p}`);
            });
        }
        return;
    }

    log('✓ Identifier Node Found\n');
    log(`Node Type: ${identifierNode.type}`);
    log(`Node Text: "${identifierNode.text}"`);
    const startPos = document.positionAt(identifierNode.startIndex);
    const endPos = document.positionAt(identifierNode.endIndex);
    log(`Range: Line ${startPos.line + 1}, Chars ${startPos.character + 1}-${endPos.character + 1}`);
    
    const parent = identifierNode.parent;
    if (parent) {
        log(`\nParent Type: ${parent.type}`);
        log(`Parent Text: "${parent.text.substring(0, 50).replace(/\n/g, '\\n')}${parent.text.length > 50 ? '...' : ''}"`);
        
        const grandParent = parent.parent;
        if (grandParent) {
            log(`\nGrandparent Type: ${grandParent.type}`);
            log(`Grandparent Text: "${grandParent.text.substring(0, 50).replace(/\n/g, '\\n')}${grandParent.text.length > 50 ? '...' : ''}"`);
        }
    }

    log('\n' + '-'.repeat(80));
    log('CLASSIFICATION RESULT\n');
    
    const importTracker = new ImportTracker();
    
    function processImports(node: SyntaxNode): void {
        if (node.type === 'ui_import') {
            importTracker.processImport(node);
        }
        for (let i = 0; i < node.namedChildCount; i++) {
            const child = node.namedChild(i);
            if (child) processImports(child);
        }
    }
    processImports(tree.rootNode);
    
    const classifier = new TokenClassifier(importTracker);
    const classification = classifier.classifyIdentifier(identifierNode, parent);
    
    if (classification) {
        const tokenTypes = ['class', 'property', 'method', 'event', 'variable', 'keyword', 'type', 'namespace', 'string', 'number', 'parameter'];
        const tokenModifiers = ['declaration', 'readonly', 'defaultLibrary', 'static', 'modification'];
        
        const typeName = tokenTypes[classification.tokenType];
        const modifierNames: string[] = [];
        for (let i = 0; i < tokenModifiers.length; i++) {
            if (classification.modifiers & (1 << i)) {
                modifierNames.push(tokenModifiers[i]);
            }
        }
        
        log(`✓ Token Type: ${typeName}`);
        log(`✓ Modifiers: ${modifierNames.length > 0 ? modifierNames.join(', ') : '(none)'}`);
        log(`\nTextMate Scope: ${getTextMateScope(typeName, modifierNames)}`);
    } else {
        log('❌ Classification returned null (fallback will be used)');
    }

    log('\n' + '-'.repeat(80));
    log('IMPORT CONTEXT\n');
    const aliases = (importTracker as any).aliases;
    if (aliases && aliases.size > 0) {
        log('Import Aliases:');
        for (const [alias, modulePath] of aliases) {
            log(`  ${alias} → ${modulePath}`);
        }
    } else {
        log('No import aliases found');
    }
}

function getTextMateScope(type: string, modifiers: string[]): string {
    const hasDefaultLibrary = modifiers.includes('defaultLibrary');
    const hasDeclaration = modifiers.includes('declaration');
    
    switch (type) {
        case 'class':
            return hasDefaultLibrary ? 'support.class' : 'entity.name.type.class';
        case 'namespace':
            return hasDefaultLibrary ? 'support.other.namespace' : 'entity.name.namespace';
        case 'property':
            return hasDeclaration ? 'variable.other.property.declaration' : 'variable.other.property';
        case 'method':
            return hasDeclaration ? 'entity.name.function' : 'meta.function-call';
        case 'event':
            return hasDeclaration ? 'entity.name.function.event' : 'support.function.event';
        case 'variable':
            return hasDeclaration ? 'variable.other.declaration' : 'variable.other.readwrite';
        case 'parameter':
            return 'variable.parameter';
        case 'keyword':
            return 'keyword.control';
        case 'type':
            return 'entity.name.type';
        case 'string':
            return 'string.quoted';
        case 'number':
            return 'constant.numeric';
        default:
            return 'source';
    }
}
