import * as vscode from 'vscode';
import type { SyntaxNode } from '../../parser/qmlParser';
import { getParser } from '../../parser/qmlParser';
import { QmlSelectionRangeProvider } from './selectionRangeProvider';

/**
 * Selection Range Debug Commands
 * Debug utilities for smart selection expansion.
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

export function registerSelectionDebugCommands(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('qml.selection.debugExpansion', debugSelectionRange)
    );
}

async function debugSelectionRange(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== 'qml') {
        vscode.window.showWarningMessage('QML: No active QML file');
        return;
    }

    const position = editor.selection.active;
    const document = editor.document;

    const parser = getParser();
    if (!parser.isInitialized()) {
        await parser.initialize();
    }

    const tree = parser.parse(document.getText());
    const offset = document.offsetAt(position);

    const { output, log } = createOutput('QML Selection Range Debug');
    output.clear();
    output.show();

    log('SELECTION RANGE DEBUG\n');
    log('='.repeat(80));
    log(`File: ${document.fileName}`);
    log(`Position: Line ${position.line + 1}, Character ${position.character + 1}`);
    log(`Offset: ${offset}`);
    log('='.repeat(80));
    log('');

    let node: SyntaxNode | null = tree.rootNode.descendantForIndex(offset);
    if (!node) {
        log('❌ No node found at cursor position');
        return;
    }

    log('AST PATH FROM CURSOR:\n');
    const path: Array<{ type: string; text: string; range: string }> = [];
    let current: SyntaxNode | null = node;
    while (current) {
        const startPos = document.positionAt(current.startIndex);
        const endPos = document.positionAt(current.endIndex);
        const rangeStr = `[${startPos.line + 1}:${startPos.character + 1}-${endPos.line + 1}:${endPos.character + 1}]`;
        const text = current.text.length > 50 
            ? current.text.substring(0, 47).replace(/\n/g, '\\n') + '...'
            : current.text.replace(/\n/g, '\\n');
        
        path.unshift({ type: current.type, text, range: rangeStr });
        current = current.parent;
    }

    path.forEach((p, i) => {
        log(`${'  '.repeat(i)}${p.type} ${p.range}`);
        log(`${'  '.repeat(i)}  "${p.text}"`);
    });

    log('\n' + '-'.repeat(80));
    log('SELECTION PROVIDER RANGES:\n');

    const provider = new QmlSelectionRangeProvider();
    const ranges = await provider.provideSelectionRanges(document, [position], new vscode.CancellationTokenSource().token);

    if (!ranges || ranges.length === 0) {
        log('❌ No selection ranges provided');
        return;
    }

    const selectionRange = ranges[0];
    let currentRange: vscode.SelectionRange | undefined = selectionRange;
    let level = 0;

    log('Expansion sequence (Shift+Alt+Right):');
    while (currentRange) {
        const text = document.getText(currentRange.range);
        const truncated = text.length > 60 
            ? text.substring(0, 57).replace(/\n/g, '\\n') + '...'
            : text.replace(/\n/g, '\\n');
        
        log(`\nLevel ${level}: [${currentRange.range.start.line + 1}:${currentRange.range.start.character + 1}-${currentRange.range.end.line + 1}:${currentRange.range.end.character + 1}]`);
        log(`  "${truncated}"`);
        
        currentRange = currentRange.parent;
        level++;
    }

    log(`\nTotal expansion levels: ${level}`);
}
