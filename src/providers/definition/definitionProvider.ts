import * as vscode from 'vscode';
import { getParser } from '../../parser/qmlParser';
import * as ast from '../../symbols/ast';
import { DefinitionRules } from './definitionRules';

export class QmlDefinitionProvider implements vscode.DefinitionProvider {
    private rules = new DefinitionRules();

    async provideDefinition(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): Promise<vscode.Definition | vscode.LocationLink[] | undefined> {
        const parser = getParser();
        if (!parser.isInitialized()) {
            await parser.initialize();
        }

        const tree = parser.parse(document.getText());
        const offset = document.offsetAt(position);
        
        let node = ast.getNodeAtPosition(
            tree.rootNode,
            offset,
            ast.qml.isIdentifierNode
        );
        if (!node) return undefined;

        let originNode = node;
        const containingImport = ast.qml.findContainingImport(node);
        if (containingImport && node.parent?.type === 'nested_identifier') {
            originNode = node.parent;
            while (originNode.parent?.type === 'nested_identifier') {
                originNode = originNode.parent;
            }
        }
        
        const symbolName = node.text;

        for (const rule of this.rules.getRules()) {
            const result = await rule(symbolName, node, tree.rootNode, document);
            if (result) {
                return [{
                    originSelectionRange: ast.nodeToRange(originNode, document),
                    targetUri: result.uri,
                    targetRange: result.range,
                    targetSelectionRange: result.range
                }];
            }
        }

        return undefined;
    }
}
