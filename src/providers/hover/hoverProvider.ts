import * as vscode from 'vscode';
import { getParser } from '../../parser/qmlParser';
import type { SyntaxNode } from '../../parser/qmlParser';
import * as ast from '../../symbols/ast';
import { getIndexer } from '../../indexer/IndexerService';
import { SymbolResolver } from '../../services/SymbolResolver';
import { QmlSymbolKind } from '../../models/SymbolInfo';

/**
 * QML Hover Provider - Shows documentation and type information on hover.
 */

export type HoverRule = (
    node: SyntaxNode,
    root: SyntaxNode,
    document: vscode.TextDocument
) => vscode.Hover | undefined;

class HoverRules {
    private resolver = new SymbolResolver();

    getRules(): HoverRule[] {
        return [
            this.hoverForComponentType.bind(this),
            this.hoverForProperty.bind(this),
            this.hoverForId.bind(this),
            this.hoverForImport.bind(this),
            this.hoverForParentKeyword.bind(this)
        ];
    }

    /**
     * Hover for QML component types (Rectangle, Button, etc).
     */
    private hoverForComponentType(
        node: SyntaxNode,
        root: SyntaxNode,
        document: vscode.TextDocument
    ): vscode.Hover | undefined {
        if (!ast.isNodeType(node, 'type_identifier', 'identifier')) {
            return undefined;
        }

        const parent = node.parent;
        if (!parent || parent.type !== 'ui_object_definition') {
            return undefined;
        }

        const typeName = ast.getFieldText(parent, 'type_name');
        if (!typeName) return undefined;

        const indexer = getIndexer();
        const modules = indexer.getModuleIndexer()?.getAllModules() ?? [];

        for (const module of modules) {
            const component = module.components.get(typeName);
            if (component) {
                const markdown = new vscode.MarkdownString();
                markdown.appendCodeblock(`${typeName}`, 'qml');
                markdown.appendMarkdown(`\n**Module**: ${module.name}\n\n`);
                
                if (component.isSingleton) {
                    markdown.appendMarkdown('*Singleton type*\n\n');
                }

                if (component.isBuiltin) {
                    markdown.appendMarkdown('Qt builtin component\n\n');
                } else if (component.filePath) {
                    markdown.appendMarkdown(`**File**: \`${component.filePath}\`\n\n`);
                }

                if (component.version) {
                    markdown.appendMarkdown(`**Version**: ${component.version}\n\n`);
                }

                const commonProps = this.getCommonPropertiesDoc(typeName);
                if (commonProps) {
                    markdown.appendMarkdown(`\n---\n\n**Common properties**:\n${commonProps}`);
                }

                return new vscode.Hover(markdown, ast.nodeToRange(node, document));
            }
        }

        return undefined;
    }

    /**
     * Hover for property/signal declarations and bindings.
     */
    private hoverForProperty(
        node: SyntaxNode,
        root: SyntaxNode,
        document: vscode.TextDocument
    ): vscode.Hover | undefined {
        const parent = node.parent;
        
        if (parent?.type === 'ui_property') {
            const propertyType = ast.getFieldText(parent, 'type');
            const propertyName = ast.getFieldText(parent, 'name');
            
            const markdown = new vscode.MarkdownString();
            markdown.appendCodeblock(`property ${propertyType} ${propertyName}`, 'qml');
            markdown.appendMarkdown('\n**Property declaration**\n\n');
            markdown.appendMarkdown(`Type: \`${propertyType}\``);
            
            return new vscode.Hover(markdown, ast.nodeToRange(parent, document));
        }

        if (parent?.type === 'ui_signal') {
            const signalName = ast.getFieldText(parent, 'name');
            
            const markdown = new vscode.MarkdownString();
            markdown.appendCodeblock(`signal ${signalName}()`, 'qml');
            markdown.appendMarkdown('\n**Signal declaration**');
            
            return new vscode.Hover(markdown, ast.nodeToRange(parent, document));
        }

        if (parent?.type === 'ui_binding') {
            const propertyName = ast.getFieldText(parent, 'name');
            const value = ast.getFieldText(parent, 'value');
            
            const markdown = new vscode.MarkdownString();
            markdown.appendCodeblock(`${propertyName}: ${value}`, 'qml');
            
            if (propertyName && ast.qml.isSignalHandler(propertyName)) {
                const signalName = propertyName.slice(2); // Remove 'on' prefix
                markdown.appendMarkdown(`\n**Signal handler** for \`${signalName}\``);
            } else {
                markdown.appendMarkdown('\n**Property binding**');
            }
            
            return new vscode.Hover(markdown, ast.nodeToRange(node, document));
        }

        return undefined;
    }

    /**
     * Hover for id references.
     */
    private hoverForId(
        node: SyntaxNode,
        root: SyntaxNode,
        document: vscode.TextDocument
    ): vscode.Hover | undefined {
        const symbolInfo = this.resolver.resolveSymbol(node, root);
        
        if (symbolInfo?.kind === QmlSymbolKind.Id) {
            const markdown = new vscode.MarkdownString();
            markdown.appendCodeblock(`id: ${symbolInfo.name}`, 'qml');
            markdown.appendMarkdown('\n**Object ID reference**\n\n');
            
            const declarationNode = symbolInfo.declarationNode;
            if (declarationNode.parent?.type === 'ui_binding') {
                const parentObject = ast.qml.findParentQmlObject(declarationNode);
                if (parentObject) {
                    const typeName = ast.getFieldText(parentObject, 'type_name');
                    if (typeName) {
                        markdown.appendMarkdown(`Type: \`${typeName}\``);
                    }
                }
            }
            
            return new vscode.Hover(markdown, ast.nodeToRange(node, document));
        }

        return undefined;
    }

    /**
     * Hover for import statements.
     */
    private hoverForImport(node: SyntaxNode, root: SyntaxNode, document: vscode.TextDocument): vscode.Hover | undefined {
        const importNode = ast.qml.findContainingImport(node);
        if (!importNode) return undefined;

        const importInfo = ast.qml.parseImport(importNode);
        if (!importInfo) return undefined;

        const markdown = new vscode.MarkdownString();
        markdown.appendCodeblock(`import ${importInfo.source} ${importInfo.version || ''}`, 'qml');
        markdown.appendMarkdown('\n**Import statement**\n\n');
        markdown.appendMarkdown(`Source: \`${importInfo.source}\`\n\n`);
        
        if (importInfo.version) {
            markdown.appendMarkdown(`Version: ${importInfo.version}\n\n`);
        }
        
        if (importInfo.alias) {
            markdown.appendMarkdown(`Alias: \`${importInfo.alias}\`\n\n`);
        }

        const indexer = getIndexer();
        const module = indexer.getModuleIndexer()?.resolveModule(importInfo.source, importInfo.version);
        
        if (module) {
            markdown.appendMarkdown(`\n---\n\n**Available components** (${module.components.size}):\n\n`);
            const components = Array.from(module.components.keys()).slice(0, 10);
            markdown.appendMarkdown(components.map(c => `- ${c}`).join('\n'));
            
            if (module.components.size > 10) {
                markdown.appendMarkdown(`\n- ... and ${module.components.size - 10} more`);
            }
        }

        return new vscode.Hover(markdown, ast.nodeToRange(importNode, document));
    }

    /**
     * Hover for 'parent' keyword.
     */
    private hoverForParentKeyword(node: SyntaxNode, root: SyntaxNode, document: vscode.TextDocument): vscode.Hover | undefined {
        if (node.type !== 'identifier' || node.text !== 'parent') {
            return undefined;
        }

        const containingObject = ast.qml.findParentQmlObject(node);
        if (!containingObject) return undefined;

        const parentObject = ast.qml.findParentQmlObject(containingObject);
        const parentType = parentObject ? ast.getFieldText(parentObject, 'type_name') : 'unknown';

        const markdown = new vscode.MarkdownString();
        markdown.appendCodeblock('parent', 'qml');
        markdown.appendMarkdown('\n**Parent object reference**\n\n');
        markdown.appendMarkdown('References the parent QML object in the hierarchy.\n\n');
        
        if (parentType) {
            markdown.appendMarkdown(`Parent type: \`${parentType}\``);
        }

        return new vscode.Hover(markdown, ast.nodeToRange(node, document));
    }

    /**
     * Get documentation for common properties of a type.
     */
    private getCommonPropertiesDoc(typeName: string): string | undefined {
        const docs: Record<string, string> = {
            'Rectangle': '`color`, `border`, `radius`, `width`, `height`',
            'Text': '`text`, `color`, `font`, `wrapMode`, `horizontalAlignment`',
            'Image': '`source`, `fillMode`, `sourceSize`, `asynchronous`',
            'MouseArea': '`onClicked`, `onPressed`, `onReleased`, `hoverEnabled`',
            'Button': '`text`, `onClicked`, `enabled`, `flat`, `highlighted`',
            'Item': '`width`, `height`, `x`, `y`, `visible`, `enabled`, `opacity`, `anchors`',
        };

        return docs[typeName];
    }
}

export class QmlHoverProvider implements vscode.HoverProvider {
    private rules = new HoverRules();

    async provideHover(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): Promise<vscode.Hover | undefined> {
        const parser = getParser();
        if (!parser.isInitialized()) {
            await parser.initialize();
        }

        const tree = parser.parse(document.getText());
        const offset = document.offsetAt(position);
        const node = ast.getNodeAtPosition(tree.rootNode, offset, ast.qml.isIdentifierNode);

        if (!node) return undefined;

        for (const rule of this.rules.getRules()) {
            const hover = rule(node, tree.rootNode, document);
            if (hover) return hover;
        }

        return undefined;
    }
}
