import * as vscode from 'vscode';
import type { SyntaxNode, Tree } from './parser/qmlParser';
import { QmlDefinitionProvider } from './providers/definition/definitionProvider';
import { QmlDocumentSymbolProvider } from './providers/symbols/documentSymbolProvider';
import { QmlDocumentHighlightProvider } from './providers/references/documentHighlightProvider';
import { QmlSelectionRangeProvider } from './providers/selection/selectionRangeProvider';
import { QmlSemanticTokensProvider } from './providers/semanticTokens/semanticTokensProvider';
import { QmlReferencesProvider } from './providers/references/referencesProvider';
import { QmlCompletionProvider } from './providers/completion/completionProvider';
import { QmlHoverProvider } from './providers/hover/hoverProvider';
import { QmldirDefinitionProvider } from './providers/qmldir/qmldirDefinitionProvider';
import { QmldirReferencesProvider } from './providers/qmldir/qmldirReferencesProvider';
import { QmlSyntaxDiagnosticsProvider } from './providers/diagnostics/syntaxDiagnosticsProvider';
import { getIndexer, IndexerService } from './indexer/IndexerService';
import { registerAstDebugCommands } from './symbols/ast/debugCommands';
import { registerSelectionDebugCommands } from './providers/selection/debugCommands';
import { registerSemanticTokensDebugCommands } from './providers/semanticTokens/debugCommands';

/**
 * VS Code QML Extension - Tree-sitter based language support.
 * 
 * Provides comprehensive QML/Qt Quick development features:
 * - Semantic syntax highlighting using tree-sitter AST parsing
 * - Code navigation (go-to-definition, find references, document symbols)
 * - Workspace indexing for fast cross-file navigation and module resolution
 * - IntelliSense completion for properties, types, and imports
 * - Support for Qt builtin modules and custom qmldir-based modules
 */

let indexer: IndexerService;

export async function activate(context: vscode.ExtensionContext) {
    console.log('QML extension is activating...');

    const config = vscode.workspace.getConfiguration('qml');

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    indexer = getIndexer();
    await indexer.initialize(workspaceFolder);

    const indexOnStartup = config.get<boolean>('indexing.enableOnStartup', true);
    if (indexOnStartup) {
        indexWorkspaceInBackground();
    } else {
        console.log('QML workspace indexing disabled - enable in settings or run "QML: Reindex Workspace" command');
    }

    const qmlSelector: vscode.DocumentSelector = { language: 'qml', scheme: 'file' };
    const qmldirSelector: vscode.DocumentSelector = { language: 'qmldir', scheme: 'file' };

    context.subscriptions.push(
        vscode.languages.registerDefinitionProvider(qmlSelector, new QmlDefinitionProvider()),
        vscode.languages.registerDocumentSymbolProvider(qmlSelector, new QmlDocumentSymbolProvider()),
        vscode.languages.registerDocumentHighlightProvider(qmlSelector, new QmlDocumentHighlightProvider()),
        vscode.languages.registerSelectionRangeProvider(qmlSelector, new QmlSelectionRangeProvider()),
        vscode.languages.registerReferenceProvider(qmlSelector, new QmlReferencesProvider()),
        vscode.languages.registerCompletionItemProvider(
            qmlSelector, 
            new QmlCompletionProvider(), 
            '.', ' ', ':'
        ),
        vscode.languages.registerHoverProvider(qmlSelector, new QmlHoverProvider())
    );

    context.subscriptions.push(
        vscode.languages.registerDefinitionProvider(qmldirSelector, new QmldirDefinitionProvider()),
        vscode.languages.registerReferenceProvider(qmldirSelector, new QmldirReferencesProvider())
    );

    const semanticHighlightingEnabled = config.get<boolean>('semanticHighlighting.enabled', true);
    
    if (semanticHighlightingEnabled) {
        context.subscriptions.push(
            vscode.languages.registerDocumentSemanticTokensProvider(
                qmlSelector,
                new QmlSemanticTokensProvider(),
                QmlSemanticTokensProvider.getLegend()
            )
        );
        console.log('QML semantic highlighting enabled');
    } else {
        console.log('QML semantic highlighting disabled - using TextMate grammar only');
    }

    const syntaxDiagnostics = new QmlSyntaxDiagnosticsProvider();
    syntaxDiagnostics.activate(context);

    const isDevelopment = context.extensionMode === vscode.ExtensionMode.Development;
    if (isDevelopment) {
        registerAstDebugCommands(context);
        registerSelectionDebugCommands(context);
        registerSemanticTokensDebugCommands(context);
        console.log('QML debug commands registered (development mode)');
    }

    console.log('QML extension activated');
}

export function deactivate() {
    if (indexer) {
        indexer.dispose();
    }
}

function indexWorkspaceInBackground() {
    indexer.indexWorkspace().catch((err: any) => {
        console.error('[QML Extension] Failed to index workspace:', err);
        vscode.window.showErrorMessage(`QML indexing failed: ${err.message}`);
    });
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
