import * as vscode from 'vscode';
import type { SyntaxNode } from '../../parser/qmlParser';
import { getParser } from '../../parser/qmlParser';

/**
 * AST Debug Commands
 * Diagnostic tools for tree-sitter AST inspection and debugging.
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

export function registerAstDebugCommands(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('qml.ast.showAtCursor', () => showAstAtCursor()),
        vscode.commands.registerCommand('qml.ast.showFullTree', () => showFullAst())
    );
}

async function showAstAtCursor(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== 'qml') {
        vscode.window.showWarningMessage('QML: No active QML file');
        return;
    }

    const parser = getParser();
    if (!parser.isInitialized()) {
        await parser.initialize();
    }

    const tree = parser.parse(editor.document.getText());
    const offset = editor.document.offsetAt(editor.selection.active);
    
    let node: SyntaxNode | null = tree.rootNode.descendantForIndex(offset);
    const path: string[] = [];
    
    while (node) {
        path.unshift(`${node.type} "${node.text.substring(0, 30).replace(/\n/g, '\\n')}"`);
        node = node.parent;
    }

    const { output, log } = createOutput('QML AST Debug');
    output.clear();
    output.show();
    log('AST PATH AT CURSOR\n');
    log('='.repeat(80));
    log(`Position: Line ${editor.selection.active.line + 1}, Character ${editor.selection.active.character + 1}`);
    log(`Offset: ${offset}\n`);
    
    path.forEach((p, i) => {
        log(`${'  '.repeat(i)}${p}`);
    });

    const importNode = tree.rootNode.descendantForIndex(offset);
    let current: SyntaxNode | null = importNode;
    while (current && current.type !== 'ui_import') {
        current = current.parent;
    }
    if (current && current.type === 'ui_import') {
        log('\n' + '-'.repeat(80));
        log('UI_IMPORT CHILDREN:\n');
        for (let i = 0; i < current.childCount; i++) {
            const child = current.child(i);
            if (child) {
                log(`[${i}] ${child.type}: "${child.text}"`);
            }
        }
    }
}

async function showFullAst(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== 'qml') {
        vscode.window.showWarningMessage('QML: No active QML file');
        return;
    }

    const parser = getParser();
    if (!parser.isInitialized()) {
        await parser.initialize();
    }

    const tree = parser.parse(editor.document.getText());
    const document = editor.document;
    
    const { output, log } = createOutput('QML Full AST');
    output.clear();
    output.show();
    
    log('FULL AST TREE\n');
    log('='.repeat(80));
    log(`File: ${document.fileName}`);
    log(`Root node: ${tree.rootNode.type}`);
    log('='.repeat(80));
    log('');

    function printNode(node: SyntaxNode, indent: number = 0): void {
        const indentStr = '  '.repeat(indent);
        const text = node.text.length > 50 
            ? node.text.substring(0, 47).replace(/\n/g, '\\n') + '...' 
            : node.text.replace(/\n/g, '\\n');
        
        const startPos = document.positionAt(node.startIndex);
        const endPos = document.positionAt(node.endIndex);
        const position = `[${startPos.line + 1}:${startPos.character + 1}-${endPos.line + 1}:${endPos.character + 1}]`;
        
        log(`${indentStr}${node.type} ${position} "${text}"`);

        const fields = new Map<string, SyntaxNode>();
        for (const fieldName of ['type_name', 'name', 'value', 'keyword', 'type', 
                                 'component_type', 'source', 'version', 'initializer']) {
            const fieldNode = node.childForFieldName(fieldName);
            if (fieldNode) {
                fields.set(fieldName, fieldNode);
            }
        }
        
        if (fields.size > 0) {
            const fieldsStr = Array.from(fields.entries())
                .map(([name, n]) => `${name}="${n.text.substring(0, 20).replace(/\n/g, '\\n')}"`)
                .join(', ');
            log(`${indentStr}  [fields: ${fieldsStr}]`);
        }

        for (let i = 0; i < node.childCount; i++) {
            const child = node.child(i);
            if (child) {
                printNode(child, indent + 1);
            }
        }
    }

    printNode(tree.rootNode);
    
    vscode.window.showInformationMessage('QML: Full AST printed to output channel');
}
