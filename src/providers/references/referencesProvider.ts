import * as vscode from 'vscode';
import { getParser } from '../../parser/qmlParser';
import * as ast from '../../symbols/ast';
import { SymbolResolver } from '../../services/SymbolResolver';
import { ReferenceResolver } from './referenceResolver';

export class QmlReferencesProvider implements vscode.ReferenceProvider {
    private symbolResolver = new SymbolResolver();
    private referenceResolver = new ReferenceResolver();

    async provideReferences(
        document: vscode.TextDocument,
        position: vscode.Position,
        context: vscode.ReferenceContext,
        token: vscode.CancellationToken
    ): Promise<vscode.Location[] | undefined> {
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

        return this.referenceResolver.findReferences(
            tree.rootNode,
            symbolInfo,
            document,
            context.includeDeclaration
        );
    }
}
