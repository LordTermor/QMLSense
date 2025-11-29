import * as vscode from 'vscode';
import * as path from 'path';

/**
 * Provides go-to-definition for qmldir files.
 * - Click on file paths to open the referenced QML file
 * - Click on module names in depends/import to find their qmldir
 */
export class QmldirDefinitionProvider implements vscode.DefinitionProvider {
    async provideDefinition(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): Promise<vscode.Definition | vscode.LocationLink[] | null> {
        const line = document.lineAt(position.line).text;
        
        const filePathRegex = /[\w./\-]+\.(?:ui\.)?(?:qml|js)/g;
        let fileMatch: RegExpExecArray | null;
        
        while ((fileMatch = filePathRegex.exec(line)) !== null) {
            const startPos = fileMatch.index;
            const endPos = startPos + fileMatch[0].length;
            const charPos = position.character;
            
            if (charPos >= startPos && charPos <= endPos) {
                const filePath = fileMatch[0];
                const result = await this.resolveFilePath(document, filePath);
                
                if (result) {
                    return [{
                        originSelectionRange: new vscode.Range(
                            position.line, startPos,
                            position.line, endPos
                        ),
                        targetUri: result.uri,
                        targetRange: result.range,
                        targetSelectionRange: result.range
                    }];
                }
                break;
            }
        }

        const wordRange = document.getWordRangeAtPosition(position, /[\w.]+/);
        if (!wordRange) {
            return null;
        }

        const word = document.getText(wordRange);
        if (line.match(/^\s*(depends|import)\s+/)) {
            const result = await this.resolveModuleName(word);
            if (result) {
                return [{
                    originSelectionRange: wordRange,
                    targetUri: result.uri,
                    targetRange: result.range,
                    targetSelectionRange: result.range
                }];
            }
        }

        return null;
    }

    private async resolveFilePath(
        document: vscode.TextDocument,
        filePath: string
    ): Promise<vscode.Location | null> {
        const qmldirDir = path.dirname(document.uri.fsPath);
        const absolutePath = path.resolve(qmldirDir, filePath);
        const fileUri = vscode.Uri.file(absolutePath);

        try {
            await vscode.workspace.fs.stat(fileUri);
            return new vscode.Location(fileUri, new vscode.Position(0, 0));
        } catch {
            return null;
        }
    }

    private async resolveModuleName(moduleName: string): Promise<vscode.Location | null> {
        const qmldirFiles = await vscode.workspace.findFiles('**/qmldir', '**/node_modules/**');
        
        for (const qmldirUri of qmldirFiles) {
            const content = await vscode.workspace.fs.readFile(qmldirUri);
            const text = Buffer.from(content).toString('utf8');
            
            const moduleMatch = text.match(/^\s*module\s+([\w.]+)/m);
            if (moduleMatch && moduleMatch[1] === moduleName) {
                return new vscode.Location(qmldirUri, new vscode.Position(0, 0));
            }

            const dirPath = path.dirname(qmldirUri.fsPath);
            const dirName = path.basename(dirPath);
            if (moduleName.endsWith(dirName)) {
                return new vscode.Location(qmldirUri, new vscode.Position(0, 0));
            }
        }

        return null;
    }
}
