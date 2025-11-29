import * as vscode from 'vscode';
import * as path from 'path';
import { getParser } from '../../parser/qmlParser';

/**
 * Provides find-references for qmldir files.
 * - Find all QML files that use a type defined in qmldir
 * - Find all qmldirs that depend on this module
 */
export class QmldirReferencesProvider implements vscode.ReferenceProvider {
    async provideReferences(
        document: vscode.TextDocument,
        position: vscode.Position,
        context: vscode.ReferenceContext,
        token: vscode.CancellationToken
    ): Promise<vscode.Location[]> {
        const line = document.lineAt(position.line).text;
        const wordRange = document.getWordRangeAtPosition(position, /[A-Z]\w*/);
        
        if (!wordRange) {
            return [];
        }

        const typeName = document.getText(wordRange);

        const isTypeDeclaration = line.match(/^\s*(?:singleton\s+)?([A-Z]\w*)\s+(?:\d+\.\d+\s+)?[\w./\-]+\.qml/);
        if (!isTypeDeclaration || isTypeDeclaration[1] !== typeName) {
            return [];
        }

        const moduleName = await this.getModuleName(document);
        if (!moduleName) {
            return [];
        }

        return this.findTypeUsages(typeName, moduleName);
    }

    private async getModuleName(document: vscode.TextDocument): Promise<string | null> {
        const content = document.getText();
        const moduleMatch = content.match(/^\s*module\s+([\w.]+)/m);
        
        if (moduleMatch) {
            return moduleMatch[1];
        }

        const dirPath = path.dirname(document.uri.fsPath);
        const workspaceFolders = vscode.workspace.workspaceFolders;
        
        if (workspaceFolders) {
            for (const folder of workspaceFolders) {
                const wsPath = folder.uri.fsPath;
                if (dirPath.startsWith(wsPath)) {
                    const relativePath = path.relative(wsPath, dirPath);
                    const parts = relativePath.split(path.sep);
                    
                    const qmlRootIndex = parts.findIndex(p => 
                        p === 'Modules' || p === 'imports' || p === 'qml' || p === 'src'
                    );
                    
                    if (qmlRootIndex !== -1 && qmlRootIndex < parts.length - 1) {
                        const moduleParts = parts.slice(qmlRootIndex + 1);
                        return moduleParts.join('.');
                    }
                }
            }
        }

        return null;
    }

    private async findTypeUsages(typeName: string, moduleName: string): Promise<vscode.Location[]> {
        const locations: vscode.Location[] = [];
        const qmlFiles = await vscode.workspace.findFiles('**/*.qml', '**/node_modules/**');
        
        const parser = getParser();
        if (!parser.isInitialized()) {
            await parser.initialize();
        }

        for (const fileUri of qmlFiles) {
            try {
                const content = await vscode.workspace.fs.readFile(fileUri);
                const text = Buffer.from(content).toString('utf8');
                
                const hasImport = text.match(new RegExp(`import\\s+${moduleName.replace(/\./g, '\\.')}`, 'm'));
                if (!hasImport) {
                    continue;
                }

                const tree = parser.parse(text);
                const document = await vscode.workspace.openTextDocument(fileUri);
                
                this.findTypeInTree(tree.rootNode, typeName, document, locations);
            } catch (error) {
                continue;
            }
        }

        return locations;
    }

    private findTypeInTree(
        node: any,
        typeName: string,
        document: vscode.TextDocument,
        locations: vscode.Location[]
    ): void {
        if (node.type === 'ui_object_definition') {
            const typeNameNode = node.childForFieldName('type_name');
            if (typeNameNode) {
                const nodeText = typeNameNode.text;
                
                const lastPart = nodeText.split('.').pop();
                if (lastPart === typeName) {
                    const position = document.positionAt(typeNameNode.startIndex);
                    const range = new vscode.Range(
                        position,
                        document.positionAt(typeNameNode.endIndex)
                    );
                    locations.push(new vscode.Location(document.uri, range));
                }
            }
        }

        for (let i = 0; i < node.childCount; i++) {
            const child = node.child(i);
            if (child) {
                this.findTypeInTree(child, typeName, document, locations);
            }
        }
    }
}
