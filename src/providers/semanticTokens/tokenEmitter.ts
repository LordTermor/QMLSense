import type { SyntaxNode, Tree } from '../../parser/qmlParser';
import * as vscode from 'vscode';

/**
 * Emits semantic tokens with deduplication to prevent overlapping ranges.
 */
export class TokenEmitter {
    private emittedRanges = new Set<string>();
    private builder: vscode.SemanticTokensBuilder;
    private document: vscode.TextDocument;

    constructor(builder: vscode.SemanticTokensBuilder, document: vscode.TextDocument) {
        this.builder = builder;
        this.document = document;
    }

    /**
     * Clear all emitted ranges (call before processing a new document).
     */
    clear(): void {
        this.emittedRanges.clear();
    }

    /**
     * Emit a semantic token for a node if not already emitted.
     * @returns true if emitted, false if duplicate
     */
    emit(node: SyntaxNode, tokenType: number, modifiers: number): boolean {
        const key = `${node.startIndex}-${node.endIndex}`;
        
        if (this.emittedRanges.has(key)) {
            return false; // Skip duplicate
        }
        
        this.emittedRanges.add(key);
        
        const startPos = this.document.positionAt(node.startIndex);
        const length = node.endIndex - node.startIndex;
        
        this.builder.push(startPos.line, startPos.character, length, tokenType, modifiers);
        return true;
    }
}
