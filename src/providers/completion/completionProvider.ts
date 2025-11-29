import * as vscode from 'vscode';
import { getParser } from '../../parser/qmlParser';
import type { SyntaxNode } from '../../parser/qmlParser';
import * as ast from '../../symbols/ast';
import { getIndexer } from '../../indexer/indexerService';
import { QmlSymbolKind } from '../../models/SymbolInfo';

/**
 * QML Completion Provider - IntelliSense autocomplete.
 * Provides context-aware suggestions for properties, types, imports, etc.
 */

export class QmlCompletionProvider implements vscode.CompletionItemProvider {
    async provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken,
        context: vscode.CompletionContext
    ): Promise<vscode.CompletionItem[] | vscode.CompletionList | undefined> {
        const parser = getParser();
        if (!parser.isInitialized()) {
            await parser.initialize();
        }

        const tree = parser.parse(document.getText());
        const offset = document.offsetAt(position);
        
        let node = tree.rootNode.descendantForIndex(offset);
        if (!node) return undefined;

        const completions: vscode.CompletionItem[] = [];

        if (this.isInImportContext(node)) {
            completions.push(...this.getImportCompletions());
        }

        if (this.isInTypeContext(node, document, offset)) {
            completions.push(...await this.getTypeCompletions(document));
        }

        if (this.isInPropertyContext(node)) {
            completions.push(...this.getPropertyCompletions(node, tree.rootNode));
        }
        
        const isPropertyType = this.isInPropertyTypeContext(node, document, position);
        console.log(`[QML Completion] isInPropertyTypeContext: ${isPropertyType}, node.type: ${node.type}, parent: ${node.parent?.type}`);
        if (isPropertyType) {
            const typeCompletions = this.getPropertyTypeCompletions();
            console.log(`[QML Completion] Adding ${typeCompletions.length} property type completions`);
            completions.push(...typeCompletions);
        }

        if (this.isInExpressionContext(node)) {
            completions.push(...this.getIdCompletions(tree.rootNode));
        }

        if (completions.length === 0) {
            completions.push(...this.getPropertyCompletions(node, tree.rootNode));
            completions.push(...await this.getTypeCompletions(document));
        }

        return completions;
    }

    /**
     * Check if cursor is in import statement context.
     */
    private isInImportContext(node: SyntaxNode): boolean {
        return ast.hasAncestorChain(node, ['ui_import']);
    }

    /**
     * Check if cursor is in type name position (e.g., after typing "Rec|" for Rectangle).
     */
    private isInTypeContext(node: SyntaxNode, document: vscode.TextDocument, offset: number): boolean {
        if (ast.isNodeType(node, 'type_identifier', 'identifier')) {
            const parent = node.parent;
            if (parent?.type === 'ui_object_definition') {
                const typeName = ast.getField(parent, 'type_name');
                if (typeName && ast.nodesEqual(typeName, node)) {
                    return true;
                }
            }
            if (parent?.type === 'nested_identifier') {
                return this.isInTypeContext(parent, document, offset);
            }
        }
        
        if (ast.isNodeType(node, 'ui_object_initializer', '{', '}')) {
            return true;
        }
        
        return false;
    }

    /**
     * Check if cursor is in property/binding context (inside QML object).
     */
    private isInPropertyContext(node: SyntaxNode): boolean {
        if (node.type === 'ui_object_initializer') {
            return true;
        }
        return ast.hasAncestorChain(node, ['ui_object_initializer']);
    }

    /**
     * Check if cursor is in expression context (right side of binding, etc).
     */
    private isInExpressionContext(node: SyntaxNode): boolean {
        if (ast.isNodeType(node, 'identifier', 'property_identifier')) {
            const parent = node.parent;
            if (parent?.type === 'ui_binding') {
                const name = ast.getField(parent, 'name');
                if (name && ast.nodesEqual(name, node)) {
                    return false;
                }
            }
            return true;
        }
        return false;
    }

    /**
     * Check if cursor is after "property " keyword (typing the type).
     */
    private isInPropertyTypeContext(node: SyntaxNode, document: vscode.TextDocument, position: vscode.Position): boolean {
        console.log(`[QML Completion] Checking property type context, node.type=${node.type}, text="${node.text.substring(0, 50)}"`);
        
        let current: SyntaxNode | null = node;
        while (current) {
            if (current.type === 'ui_property') {
                console.log(`[QML Completion] Found ui_property ancestor, node.type=${node.type}`);
                const typeNode = ast.getField(current, 'type');
                if (typeNode) {
                    const isTypeNode = ast.nodesEqual(typeNode, node);
                    console.log(`[QML Completion] typeNode exists, equals current node: ${isTypeNode}`);
                    if (isTypeNode) {
                        return true;
                    }
                }
                if (ast.isNodeType(node, 'type_identifier', 'identifier')) {
                    console.log(`[QML Completion] Node is type_identifier/identifier inside ui_property - returning true`);
                    return true;
                }
            }
            current = current.parent;
        }
        
        const line = document.lineAt(position.line);
        const textBeforeCursor = line.text.substring(0, position.character);
        
        const propertyKeywordMatch = /\bproperty\s+$/.test(textBeforeCursor);
        console.log(`[QML Completion] Text before cursor: "${textBeforeCursor}", matches property keyword: ${propertyKeywordMatch}`);
        
        if (propertyKeywordMatch) {
            return true;
        }
        
        console.log(`[QML Completion] No ui_property context found`);
        return false;
    }

    /**
     * Get completions for import statements.
     */
    private getImportCompletions(): vscode.CompletionItem[] {
        const completions: vscode.CompletionItem[] = [];

        const qtModules = [
            { name: 'QtQuick', description: 'Basic QML types' },
            { name: 'QtQuick.Controls', description: 'UI controls' },
            { name: 'QtQuick.Layouts', description: 'Layout managers' },
            { name: 'QtQuick.Window', description: 'Window management' },
            { name: 'QtQuick.Dialogs', description: 'Native dialogs' },
            { name: 'Qt.labs.platform', description: 'Platform integration' },
            { name: 'QtQml', description: 'QML engine basics' },
            { name: 'QtMultimedia', description: 'Audio/video playback' },
        ];

        for (const mod of qtModules) {
            const item = new vscode.CompletionItem(mod.name, vscode.CompletionItemKind.Module);
            item.detail = mod.description;
            item.insertText = new vscode.SnippetString(`${mod.name} \${1:2.15}`);
            completions.push(item);
        }

        return completions;
    }

    /**
     * Get completions for property types (var, int, string, etc).
     */
    private getPropertyTypeCompletions(): vscode.CompletionItem[] {
        const completions: vscode.CompletionItem[] = [];

        const basicTypes = [
            { name: 'var', description: 'Generic variant type' },
            { name: 'int', description: 'Integer number' },
            { name: 'real', description: 'Floating-point number' },
            { name: 'double', description: 'Double precision float' },
            { name: 'bool', description: 'Boolean (true/false)' },
            { name: 'string', description: 'Text string' },
            { name: 'url', description: 'Resource URL' },
            { name: 'color', description: 'Color value' },
            { name: 'date', description: 'Date value' },
            { name: 'point', description: 'Point (x, y)' },
            { name: 'size', description: 'Size (width, height)' },
            { name: 'rect', description: 'Rectangle (x, y, width, height)' },
            { name: 'font', description: 'Font specification' },
            { name: 'list', description: 'List type' },
            { name: 'alias', description: 'Property alias' },
        ];

        for (const type of basicTypes) {
            const item = new vscode.CompletionItem(type.name, vscode.CompletionItemKind.TypeParameter);
            item.detail = type.description;
            item.documentation = new vscode.MarkdownString(`QML property type: ${type.description}`);
            completions.push(item);
        }

        return completions;
    }

    /**
     * Get completions for QML type names (Rectangle, Button, etc).
     */
    private async getTypeCompletions(document: vscode.TextDocument): Promise<vscode.CompletionItem[]> {
        const completions: vscode.CompletionItem[] = [];
        const indexer = getIndexer();

        const modules = indexer.getModuleIndexer().getAllModules();

        for (const module of modules) {
            for (const [componentName, component] of module.components) {
                const moduleName = module.moduleName;
                const item = new vscode.CompletionItem(componentName, vscode.CompletionItemKind.Class);
                item.detail = component.isBuiltin 
                    ? `${moduleName} (Qt builtin)`
                    : `${moduleName}`;
                
                if (component.isSingleton) {
                    item.detail += ' [Singleton]';
                }

                if (this.hasCommonProperties(componentName)) {
                    item.insertText = new vscode.SnippetString(`${componentName} {\n\t$0\n}`);
                } else {
                    item.insertText = componentName;
                }

                item.sortText = component.isBuiltin ? `0_${componentName}` : `1_${componentName}`;
                completions.push(item);
            }
        }

        return completions;
    }

    /**
     * Get completions for properties/signals inside QML object.
     */
    private getPropertyCompletions(node: SyntaxNode, root: SyntaxNode): vscode.CompletionItem[] {
        const completions: vscode.CompletionItem[] = [];

        let containingObject: SyntaxNode | null = null;
        let current: SyntaxNode | null = node;
        
        while (current) {
            if (current.type === 'ui_object_definition') {
                containingObject = current;
                break;
            }
            current = current.parent;
        }

        if (!containingObject) {
            completions.push(
                this.createKeywordCompletion('property', 'Property declaration', 'property ${1:int} ${2:name}'),
                this.createKeywordCompletion('signal', 'Signal declaration', 'signal ${1:signalName}($2)'),
                this.createKeywordCompletion('function', 'Function declaration', 'function ${1:funcName}($2) {\n\t$0\n}'),
                this.createKeywordCompletion('readonly property', 'Read-only property', 'readonly property ${1:int} ${2:name}: ${3:0}')
            );
            return completions;
        }

        const typeName = ast.getFieldText(containingObject, 'type_name');
        if (!typeName) return completions;

        completions.push(...this.getCommonPropertiesForType(typeName));

        completions.push(
            this.createKeywordCompletion('property', 'Property declaration', 'property ${1:int} ${2:name}'),
            this.createKeywordCompletion('signal', 'Signal declaration', 'signal ${1:signalName}($2)'),
            this.createKeywordCompletion('function', 'Function declaration', 'function ${1:funcName}($2) {\n\t$0\n}'),
            this.createKeywordCompletion('readonly property', 'Read-only property', 'readonly property ${1:int} ${2:name}: ${3:0}')
        );

        return completions;
    }

    /**
     * Get completions for id references (parent, other object IDs, etc).
     */
    private getIdCompletions(root: SyntaxNode): vscode.CompletionItem[] {
        const completions: vscode.CompletionItem[] = [];

        const parentItem = new vscode.CompletionItem('parent', vscode.CompletionItemKind.Variable);
        parentItem.detail = 'Parent object reference';
        parentItem.documentation = new vscode.MarkdownString('Reference to the parent QML object');
        completions.push(parentItem);

        const ids = this.findAllIds(root);
        for (const id of ids) {
            const item = new vscode.CompletionItem(id, vscode.CompletionItemKind.Variable);
            item.detail = 'Object ID';
            completions.push(item);
        }

        return completions;
    }

    /**
     * Find all id: declarations in the AST.
     */
    private findAllIds(root: SyntaxNode): string[] {
        const ids: string[] = [];

        const findIds = (node: SyntaxNode) => {
            if (node.type === 'ui_binding') {
                const name = ast.getFieldText(node, 'name');
                if (name === 'id') {
                    const value = ast.getFieldText(node, 'value');
                    if (value) {
                        ids.push(value);
                    }
                }
            }

            for (let i = 0; i < node.childCount; i++) {
                const child = node.child(i);
                if (child) findIds(child);
            }
        };

        findIds(root);
        return ids;
    }

    /**
     * Get common properties for a QML type.
     */
    private getCommonPropertiesForType(typeName: string): vscode.CompletionItem[] {
        const completions: vscode.CompletionItem[] = [];

        const itemProps = ['id', 'width', 'height', 'x', 'y', 'visible', 'enabled', 'opacity', 'anchors'];
        
        const typeSpecificProps: Record<string, string[]> = {
            'Rectangle': ['color', 'border', 'radius'],
            'Text': ['text', 'color', 'font', 'wrapMode', 'horizontalAlignment'],
            'Image': ['source', 'fillMode', 'sourceSize'],
            'MouseArea': ['onClicked', 'onPressed', 'onReleased', 'hoverEnabled'],
            'Button': ['text', 'onClicked', 'enabled'],
            'TextField': ['text', 'placeholderText', 'onTextChanged'],
        };

        const props = [...itemProps, ...(typeSpecificProps[typeName] || [])];

        for (const prop of props) {
            const item = new vscode.CompletionItem(prop, vscode.CompletionItemKind.Property);
            
            if (prop === 'anchors') {
                item.insertText = new vscode.SnippetString('anchors {\n\t${1|fill,centerIn|}: ${2:parent}\n}');
            } else if (prop.startsWith('on')) {
                item.insertText = new vscode.SnippetString(`${prop}: {\n\t$0\n}`);
                item.kind = vscode.CompletionItemKind.Event;
            } else {
                item.insertText = new vscode.SnippetString(`${prop}: \${1}`);
            }

            completions.push(item);
        }

        return completions;
    }

    /**
     * Check if a type typically has nested properties (for snippet generation).
     */
    private hasCommonProperties(typeName: string): boolean {
        const typesWithProps = ['Rectangle', 'Item', 'Text', 'Image', 'MouseArea', 'Button', 'Column', 'Row'];
        return typesWithProps.includes(typeName);
    }

    /**
     * Helper to create keyword completion items.
     */
    private createKeywordCompletion(
        keyword: string,
        description: string,
        snippet: string
    ): vscode.CompletionItem {
        const item = new vscode.CompletionItem(keyword, vscode.CompletionItemKind.Keyword);
        item.detail = description;
        item.insertText = new vscode.SnippetString(snippet);
        return item;
    }
}
