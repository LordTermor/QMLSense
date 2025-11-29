import * as vscode from 'vscode';
import { getParser } from '../../parser/qmlParser';
import * as ast from '../../symbols/ast';
import { SymbolResolver } from '../../services/SymbolResolver';
import { ReferenceResolver } from './referenceResolver';
import { QmlSymbolKind } from '../../models/SymbolInfo';

export class QmlDocumentHighlightProvider implements vscode.DocumentHighlightProvider {
    private symbolResolver = new SymbolResolver();
    private referenceResolver = new ReferenceResolver();

    async provideDocumentHighlights(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): Promise<vscode.DocumentHighlight[] | undefined> {
        const parser = getParser();
        
        if (!parser.isInitialized()) {
            await parser.initialize();
        }

        const tree = parser.parse(document.getText());
        const offset = document.offsetAt(position);
        
        const node = ast.getNodeAtPosition(
            tree.rootNode,
            offset,
            ast.qml.isIdentifierNode
        );
        if (!node) return undefined;

        const symbolInfo = this.symbolResolver.resolveSymbol(node, tree.rootNode);
        if (!symbolInfo) return undefined;

        const locations = this.referenceResolver.findReferences(
            tree.rootNode,
            symbolInfo,
            document,
            true
        );

        return locations.map(loc => {
            const kind = loc.range.start.isEqual(
                ast.nodeToRange(symbolInfo.declarationNode, document).start
            )
                ? vscode.DocumentHighlightKind.Write
                : vscode.DocumentHighlightKind.Read;
            
            return new vscode.DocumentHighlight(loc.range, kind);
        });
    }
}
