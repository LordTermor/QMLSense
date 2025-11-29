import type { SyntaxNode, Tree } from '../../parser/qmlParser';
import * as vscode from 'vscode';
import { SymbolResolver } from '../../services/SymbolResolver';
import * as ast from '../../symbols/ast';
import { getIndexer } from '../../indexer/indexerService';

export type DefinitionRule = (
    symbolName: string,
    node: SyntaxNode,
    root: SyntaxNode,
    document: vscode.TextDocument
) => vscode.Location | null | Promise<vscode.Location | null>;

export class DefinitionRules {
    private resolver = new SymbolResolver();

    getRules(): DefinitionRule[] {
        return [
            this.resolveImportAlias.bind(this),
            this.resolveImportModule.bind(this),
            this.resolveParentKeyword.bind(this),
            this.resolveImportedComponent.bind(this),
            this.resolveFromDeclaration.bind(this)
        ];
    }

    private resolveImportAlias(
        symbolName: string,
        node: SyntaxNode,
        root: SyntaxNode,
        document: vscode.TextDocument
    ): vscode.Location | null {
        console.log('[resolveImportAlias]', {
            symbolName,
            nodeType: node.type,
            parentType: node.parent?.type,
            nodeText: node.text
        });
        
        if (ast.hasAncestorChain(node, ['nested_identifier'])) {
            if (ast.qml.isFirstPartOfNestedIdentifier(node, node.parent!)) {
                const aliasNode = ast.qml.findImportAlias(root, symbolName);
                if (aliasNode) {
                    console.log('[resolveImportAlias] ✓ Found alias for qualifier');
                    return new vscode.Location(
                        document.uri,
                        ast.nodeToRange(aliasNode, document)
                    );
                }
            }
            console.log('[resolveImportAlias] Not clicking on qualifier part');
            return null;
        }
        
        const aliasNode = ast.qml.findImportAlias(root, symbolName);
        if (!aliasNode) {
            console.log('[resolveImportAlias] No alias found');
            return null;
        }

        console.log('[resolveImportAlias] ✓ Found alias');
        return new vscode.Location(
            document.uri,
            ast.nodeToRange(aliasNode, document)
        );
    }

    private async resolveImportModule(
        symbolName: string,
        node: SyntaxNode,
        root: SyntaxNode,
        document: vscode.TextDocument
    ): Promise<vscode.Location | null> {
        console.log('[resolveImportModule]', {
            symbolName,
            nodeType: node.type,
            parentType: node.parent?.type
        });
        
        let currentNode: SyntaxNode | null = node;
        
        if (ast.hasAncestorChain(currentNode, ['nested_identifier'])) {
            currentNode = currentNode.parent!;
        }
        
        const importNode = ast.findAncestorOfType(currentNode, ['ui_import', 'program']);
        
        if (!importNode || !ast.isNodeType(importNode, 'ui_import')) {
            console.log('[resolveImportModule] Not in import statement');
            return null;
        }

        const sourceNode = importNode.childForFieldName('source');
        if (!sourceNode) {
            console.log('[resolveImportModule] No source node');
            return null;
        }

        const moduleName = sourceNode.text.replace(/['"]/g, '');
        
        if (moduleName.startsWith('.') || moduleName.startsWith('/') || moduleName.endsWith('.qml')) {
            console.log('[resolveImportModule] Not a module import');
            return null;
        }

        const indexer = getIndexer();
        const moduleIndexer = indexer.getModuleIndexer();
        const module = moduleIndexer.resolveModule(moduleName);
        
        if (module?.qmldirPath) {
            console.log('[resolveImportModule] ✓ Found module:', module.qmldirPath);
            return new vscode.Location(
                vscode.Uri.file(module.qmldirPath),
                new vscode.Position(0, 0)
            );
        }

        console.log('[resolveImportModule] Module not found:', moduleName);
        return null;
    }

    private resolveParentKeyword(
        symbolName: string,
        node: SyntaxNode,
        root: SyntaxNode,
        document: vscode.TextDocument
    ): vscode.Location | null {
        console.log('[resolveParentKeyword]', { symbolName });
        
        if (symbolName !== 'parent') return null;

        const parentObject = ast.qml.findParentQmlObject(node);
        if (!parentObject) return null;

        const typeNameNode = ast.getField(parentObject, 'type_name');
        if (!typeNameNode) return null;

        console.log('[resolveParentKeyword] ✓ Found parent');
        return new vscode.Location(
            document.uri,
            ast.nodeToRange(typeNameNode, document)
        );
    }

    private async resolveImportedComponent(
        symbolName: string,
        node: SyntaxNode,
        root: SyntaxNode,
        document: vscode.TextDocument
    ): Promise<vscode.Location | null> {
        console.log('[resolveImportedComponent]', {
            symbolName,
            nodeType: node.type,
            parentType: node.parent?.type,
            grandParentType: node.parent?.parent?.type,
            nodeText: node.text,
            parentText: node.parent?.text
        });
        
        let typeNameNode: SyntaxNode | null = null;
        
        if (ast.hasAncestorChain(node, ['nested_identifier', 'ui_object_definition'])) {
            console.log('[resolveImportedComponent] Checking nested_identifier case');
            
            const objDef = node.parent!.parent!;
            const firstChild = objDef.namedChildren[0];
            
            console.log('[resolveImportedComponent] first child type:', firstChild?.type);
            console.log('[resolveImportedComponent] our parent type:', node.parent!.type);
            
            if (firstChild?.type === 'nested_identifier') {
                typeNameNode = node.parent!;
                console.log('[resolveImportedComponent] Found type_name via nested_identifier');
            }
        }
        else if (ast.hasAncestorChain(node, ['ui_object_definition'])) {
            const typeNameField = node.parent!.childForFieldName('type_name');
            if (ast.nodesEqual(node, typeNameField)) {
                typeNameNode = node;
                console.log('[resolveImportedComponent] Found type_name directly');
            }
        }
        
        if (!typeNameNode) {
            console.log('[resolveImportedComponent] Not a type_name');
            return null;
        }

        const fullTypeName = typeNameNode.text;
        console.log('[resolveImportedComponent] Full type name:', fullTypeName);

        const indexer = getIndexer();
        const moduleIndexer = indexer.getModuleIndexer();
        const fileEntry = await indexer.getFileIndex(document.uri);
        
        if (!fileEntry) {
            console.log('[resolveImportedComponent] File not indexed');
            return null;
        }

        let targetModule: string | null = null;
        const parsed = ast.qml.parseQualifiedTypeName(fullTypeName);
        const componentName = parsed.component;
        
        if (parsed.qualifier) {
            const qualifier = parsed.qualifier;
            
            console.log('[resolveImportedComponent] Qualified name - qualifier:', qualifier, 'component:', componentName);
            
            const aliasedImport = fileEntry.imports.find(imp => 
                imp.type === 'module' && imp.qualifier === qualifier
            );
            
            if (aliasedImport) {
                targetModule = aliasedImport.source;
                console.log('[resolveImportedComponent] Resolved qualifier to module:', targetModule);
            } else {
                console.log('[resolveImportedComponent] Qualifier not found in imports');
                return null;
            }
        }

        if (!targetModule) {
            const currentModule = await moduleIndexer.findModuleForFile(document.uri.fsPath);
            if (currentModule) {
                console.log('[resolveImportedComponent] Current file is in module:', currentModule.moduleName);
                const component = currentModule.components.get(componentName);
                if (component?.filePath) {
                    console.log('[resolveImportedComponent] ✓ Found component in current module:', component.filePath);
                    return new vscode.Location(
                        vscode.Uri.file(component.filePath),
                        new vscode.Position(0, 0)
                    );
                }
            }
        }

        console.log('[resolveImportedComponent] Searching imports for:', componentName);
        for (const imp of fileEntry.imports) {
            if (imp.type !== 'module') continue;
            
            if (targetModule && imp.source !== targetModule) continue;
            
            if (!targetModule && imp.qualifier) continue;
            
            const component = moduleIndexer.resolveComponent(imp.source, componentName);
            if (component?.filePath) {
                console.log('[resolveImportedComponent] ✓ Found component in module:', imp.source, '→', component.filePath);
                return new vscode.Location(
                    vscode.Uri.file(component.filePath),
                    new vscode.Position(0, 0)
                );
            }
        }

        console.log('[resolveImportedComponent] Component not found in any imported module');
        return null;
    }

    private resolveFromDeclaration(
        symbolName: string,
        node: SyntaxNode,
        root: SyntaxNode,
        document: vscode.TextDocument
    ): vscode.Location | null {
        console.log('[resolveFromDeclaration]', { symbolName });
        
        const declaration = this.resolver.findDeclaration(root, symbolName);
        if (!declaration) {
            console.log('[resolveFromDeclaration] No declaration found');
            return null;
        }

        console.log('[resolveFromDeclaration] ✓ Found declaration');
        return new vscode.Location(
            document.uri,
            ast.nodeToRange(declaration.node, document)
        );
    }
}
