import * as path from 'path';
import type { SyntaxNode, Tree, Point, Range } from 'tree-sitter-dynamic';

// Load tree-sitter from lib/ at extension root
const treeSitterPath = path.join(__dirname, '..', '..', 'lib', 'web-tree-sitter');
const ParserModule = require(treeSitterPath);

// Re-export types for use throughout the codebase
export type { SyntaxNode, Tree, Point, Range };

/**
 * QML parser using tree-sitter-qmljs.
 * Provides incremental parsing for QML files with full syntax tree access.
 */
export class QmlParser {
    private parser: any = null;
    private initPromise: Promise<void> | null = null;

    async initialize(): Promise<void> {
        if (this.initPromise) {
            return this.initPromise;
        }

        this.initPromise = this.doInitialize();
        return this.initPromise;
    }

    private async doInitialize(): Promise<void> {
        try {
            await ParserModule.init();
            this.parser = new ParserModule();

            const wasmPath = path.join(
                __dirname,
                '..',
                '..',
                'lib',
                'tree-sitter-qmljs.wasm'
            );

            const language = await ParserModule.Language.load(wasmPath);
            this.parser.setLanguage(language);
        } catch (error) {
            console.error('Failed to initialize QML parser:', error);
            throw error;
        }
    }

    parse(text: string, oldTree?: any): any {
        if (!this.parser) {
            throw new Error('Parser not initialized. Call initialize() first.');
        }
        return this.parser.parse(text, oldTree);
    }

    isInitialized(): boolean {
        return this.parser !== null;
    }
}

// Singleton instance
let parserInstance: QmlParser | null = null;

export function getParser(): QmlParser {
    if (!parserInstance) {
        parserInstance = new QmlParser();
    }
    return parserInstance;
}
