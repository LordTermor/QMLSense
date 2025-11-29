import type { SyntaxNode } from '../../parser/qmlParser';
import { TokenType, TokenModifier, type TokenClassification } from './tokenClassifier';
import type { ImportTracker } from './importTracker';
import { qtBuiltInTypes, qtBuiltInModules, basicTypeNames, qmlKeywords } from './builtinTypes';
import * as ast from '../../symbols/ast';

/**
 * Context information passed to classification rules.
 */
export interface ClassificationContext {
    node: SyntaxNode;
    parent: SyntaxNode | null;
    nodeText: string;
    importTracker: ImportTracker;
    declaredIds: Set<string>;
    debug: boolean;
}

/**
 * A classification rule that attempts to match and classify a node.
 * Returns TokenClassification if matched, null if rule doesn't apply.
 */
export type ClassificationRule = (ctx: ClassificationContext) => TokenClassification | null;

/**
 * Helper to log debug messages.
 */
function log(ctx: ClassificationContext, message: string): void {
    if (ctx.debug) {
        console.log(`  ${message}`);
    }
}

// ============================================================================
// CLASSIFICATION RULES (ordered by priority)
// ============================================================================

/**
 * Rule: Keyword tokens (highest priority).
 */
export const keywordRule: ClassificationRule = (ctx) => {
    if (qmlKeywords.has(ctx.nodeText)) {
        log(ctx, '✓ Matched: Keyword');
        return { tokenType: TokenType.Keyword, modifiers: 0 };
    }
    return null;
};

/**
 * Rule: References to declared ID names.
 */
export const declaredIdReferenceRule: ClassificationRule = (ctx) => {
    const { node, nodeText, declaredIds } = ctx;
    if (ast.isNodeType(node, 'identifier', 'property_identifier') && 
        declaredIds.has(nodeText)) {
        log(ctx, '✓ Matched: Interface (ID reference)');
        return { tokenType: TokenType.Interface, modifiers: 0 };
    }
    return null;
};

/**
 * Rule: Import alias declaration (after 'as' keyword).
 */
export const importAliasDeclarationRule: ClassificationRule = (ctx) => {
    const containingImport = ast.qml.findContainingImport(ctx.node);
    if (!containingImport) return null;

    if (ast.isAtField(ctx.node, containingImport, 'alias')) {
        log(ctx, '✓ Matched: Decorator (import alias)');
        return { tokenType: TokenType.Decorator, modifiers: TokenModifier.Declaration };
    }
    return null;
};

/**
 * Rule: Import module path.
 */
export const importModulePathRule: ClassificationRule = (ctx) => {
    const containingImport = ast.qml.findContainingImport(ctx.node);
    if (!containingImport) return null;

    const modulePathNode = containingImport.childForFieldName('source');
    const fullModulePath = modulePathNode?.text || '';
    const modifiers = qtBuiltInModules.has(fullModulePath) ? TokenModifier.DefaultLibrary : 0;
    log(ctx, `✓ Matched: Namespace (import module path), isQt: ${qtBuiltInModules.has(fullModulePath)}`);
    return { tokenType: TokenType.Namespace, modifiers };
};

/**
 * Rule: Simple type name in ui_object_definition (e.g., Rectangle, CustomButton).
 */
export const simpleTypeNameRule: ClassificationRule = (ctx) => {
    const { node, parent, nodeText } = ctx;
    if (!parent || parent.type !== 'ui_object_definition' || node.type !== 'identifier') {
        return null;
    }

    if (!ast.isAtField(node, parent, 'type_name')) {
        return null;
    }

    if (nodeText[0] === nodeText[0].toLowerCase()) {
        log(ctx, '✓ Matched: Property (property group)');
        return { tokenType: TokenType.Property, modifiers: 0 };
    }

    const modifiers = qtBuiltInTypes.has(nodeText) ? TokenModifier.DefaultLibrary : 0;
    log(ctx, `✓ Matched: Class (ui_object_definition), isBuiltin: ${qtBuiltInTypes.has(nodeText)}`);
    return { tokenType: TokenType.Class, modifiers };
};

/**
 * Rule: type_identifier in ui_property (e.g., property string name).
 */
export const propertyTypeRule: ClassificationRule = (ctx) => {
    const { node, parent, nodeText } = ctx;
    if (node.type !== 'type_identifier' || !parent) return null;

    if (parent.type === 'ui_property') {
        const isBasic = basicTypeNames.has(nodeText);
        return { tokenType: TokenType.Type, modifiers: isBasic ? TokenModifier.DefaultLibrary : 0 };
    }

    const modifiers = qtBuiltInTypes.has(nodeText) ? TokenModifier.DefaultLibrary : 0;
    return { tokenType: TokenType.Class, modifiers };
};

/**
 * Rule: Property declaration name (e.g., property string name).
 */
export const propertyDeclarationRule: ClassificationRule = (ctx) => {
    const { node, parent } = ctx;
    if (!parent || parent.type !== 'ui_property') return null;

    if (ast.isAtField(node, parent, 'name')) {
        const modifier = parent.childForFieldName('modifier');
        let modifiers = TokenModifier.Declaration;
        if (modifier?.text === 'readonly') {
            modifiers |= TokenModifier.Readonly;
        }
        return { tokenType: TokenType.Property, modifiers };
    }
    return null;
};

/**
 * Rule: ui_binding name (property, signal handler, or id keyword).
 */
export const bindingNameRule: ClassificationRule = (ctx) => {
    const { node, parent, nodeText } = ctx;
    if (!parent || parent.type !== 'ui_binding') return null;

    if (!ast.isAtField(node, parent, 'name')) return null;

    if (nodeText === 'id') {
        return { tokenType: TokenType.Keyword, modifiers: 0 };
    }

    if (ast.qml.isSignalHandler(nodeText)) {
        return { tokenType: TokenType.Event, modifiers: 0 };
    }

    return { tokenType: TokenType.Property, modifiers: 0 };
};

/**
 * Rule: nested_identifier in ui_binding (e.g., Accessible.name: "text").
 */
export const nestedBindingNameRule: ClassificationRule = (ctx) => {
    const { node, parent, nodeText } = ctx;
    if (!parent || parent.type !== 'nested_identifier') return null;

    if (!ast.hasAncestorChain(node, ['nested_identifier', 'ui_binding'])) return null;

    const grandParent = parent.parent!;
    if (!ast.isAtField(parent, grandParent, 'name')) return null;

    const lastChild = parent.lastNamedChild;
    if (ast.nodesEqual(node, lastChild) && ast.qml.isSignalHandler(nodeText)) {
        return { tokenType: TokenType.Event, modifiers: 0 };
    }

    return { tokenType: TokenType.Property, modifiers: 0 };
};

/**
 * Rule: ID value declaration (e.g., id: myRect).
 */
export const idValueRule: ClassificationRule = (ctx) => {
    const { node, parent } = ctx;
    if (!parent || parent.type !== 'expression_statement') return null;

    if (!ast.hasAncestorChain(node, ['expression_statement', 'ui_binding'])) return null;

    const grandParent = parent.parent!;
    if (ast.qml.isIdBinding(grandParent)) {
        return { tokenType: TokenType.Interface, modifiers: TokenModifier.Declaration };
    }
    return null;
};

/**
 * Rule: Signal declaration name.
 */
export const signalDeclarationRule: ClassificationRule = (ctx) => {
    const { node, parent } = ctx;
    if (!parent || parent.type !== 'ui_signal') return null;

    if (ast.isAtField(node, parent, 'name')) {
        return { tokenType: TokenType.Event, modifiers: TokenModifier.Declaration };
    }
    return null;
};

/**
 * Rule: Function declaration name.
 */
export const functionDeclarationRule: ClassificationRule = (ctx) => {
    const { node, parent } = ctx;
    if (!parent || parent.type !== 'function_declaration') return null;

    if (ast.isAtField(node, parent, 'name')) {
        return { tokenType: TokenType.Method, modifiers: TokenModifier.Declaration };
    }
    return null;
};

/**
 * Rule: Function call in call_expression.
 */
export const functionCallRule: ClassificationRule = (ctx) => {
    const { node, parent } = ctx;
    if (!parent || parent.type !== 'call_expression') return null;

    if (ast.isAtField(node, parent, 'function')) {
        return { tokenType: TokenType.Method, modifiers: 0 };
    }
    return null;
};

/**
 * Rule: Object part of member_expression (e.g., root in root.width).
 */
export const memberExpressionObjectRule: ClassificationRule = (ctx) => {
    const { node, parent, nodeText, importTracker } = ctx;
    if (!parent || parent.type !== 'member_expression') return null;

    if (!ast.isAtField(node, parent, 'object')) return null;

    if (importTracker.isImportAlias(nodeText)) {
        const modifiers = importTracker.isQtAlias(nodeText) ? TokenModifier.DefaultLibrary : 0;
        return { tokenType: TokenType.Decorator, modifiers };
    }

    if (qtBuiltInTypes.has(nodeText)) {
        return { 
            tokenType: TokenType.Namespace, 
            modifiers: TokenModifier.DefaultLibrary | TokenModifier.Static 
        };
    }

    return { tokenType: TokenType.Variable, modifiers: 0 };
};

/**
 * Rule: Property part of member_expression (e.g., width in root.width).
 */
export const memberExpressionPropertyRule: ClassificationRule = (ctx) => {
    const { node, parent } = ctx;
    if (!parent || parent.type !== 'member_expression' || node.type !== 'property_identifier') {
        return null;
    }

    if (!ast.isAtField(node, parent, 'property')) return null;

    if (ast.hasAncestorChain(node, ['member_expression', 'call_expression'])) {
        const grandParent = parent.parent!;
        const funcField = grandParent.childForFieldName('function');
        if (ast.nodesEqual(parent, funcField)) {
            return { tokenType: TokenType.Method, modifiers: 0 };
        }
    }

    return { tokenType: TokenType.Property, modifiers: 0 };
};

/**
 * Rule: Qualified type name in ui_object_definition (e.g., QtQuick.Controls.Button).
 */
export const qualifiedTypeNameRule: ClassificationRule = (ctx) => {
    const { node, parent, nodeText, importTracker } = ctx;
    if (!parent || parent.type !== 'nested_identifier') return null;

    if (!ast.hasAncestorChain(node, ['nested_identifier', 'ui_object_definition'])) return null;

    const grandParent = parent.parent!;
    if (!ast.isAtField(parent, grandParent, 'type_name')) {
        log(ctx, '✗ Skipped: nested_identifier is not type_name field');
        return null;
    }

    const isLastPart = ast.qml.isLastPartOfNestedIdentifier(node, parent);

    if (isLastPart) {
        const modifiers = qtBuiltInTypes.has(nodeText) ? TokenModifier.DefaultLibrary : 0;
        log(ctx, `✓ Matched: Class (nested last part), isBuiltin: ${qtBuiltInTypes.has(nodeText)}`);
        return { tokenType: TokenType.Class, modifiers };
    }

    const isAlias = importTracker.isImportAlias(nodeText);
    const isQtAlias = isAlias && importTracker.isQtAlias(nodeText);

    if (isAlias) {
        const modifiers = isQtAlias ? TokenModifier.DefaultLibrary : 0;
        log(ctx, `✓ Matched: Decorator (import alias in qualified type), isQtAlias: ${isQtAlias}`);
        return { tokenType: TokenType.Decorator, modifiers };
    }

    const modifiers = qtBuiltInTypes.has(nodeText) ? TokenModifier.DefaultLibrary : 0;
    log(ctx, '✓ Matched: Namespace (qualified type namespace)');
    return { tokenType: TokenType.Namespace, modifiers };
};

/**
 * Rule: Inline component name declaration.
 */
export const inlineComponentRule: ClassificationRule = (ctx) => {
    const { node, parent } = ctx;
    if (!parent || parent.type !== 'ui_inline_component') return null;

    if (ast.isAtField(node, parent, 'name')) {
        return { tokenType: TokenType.Class, modifiers: TokenModifier.Declaration };
    }
    return null;
};

/**
 * Rule: Signal parameter type and name.
 */
export const signalParameterRule: ClassificationRule = (ctx) => {
    const { node, parent } = ctx;
    if (!parent || parent.type !== 'ui_signal_parameter') return null;

    if (ast.isAtField(node, parent, 'type') && node.type === 'type_identifier') {
        return { tokenType: TokenType.Type, modifiers: 0 };
    }

    if (ast.isAtField(node, parent, 'name')) {
        return { tokenType: TokenType.Parameter, modifiers: TokenModifier.Declaration };
    }

    return null;
};

/**
 * Rule: Function parameter.
 */
export const functionParameterRule: ClassificationRule = (ctx) => {
    if (ast.hasAncestorChain(ctx.node, ['required_parameter', 'formal_parameters'])) {
        return { tokenType: TokenType.Parameter, modifiers: TokenModifier.Declaration };
    }
    return null;
};

/**
 * Rule: Object literal property key.
 */
export const objectLiteralKeyRule: ClassificationRule = (ctx) => {
    const { node, parent } = ctx;
    if (parent?.type === 'pair' && node.type === 'property_identifier') {
        log(ctx, '✓ Matched: Property (pair in object literal)');
        return { tokenType: TokenType.Property, modifiers: 0 };
    }
    return null;
};

/**
 * Default fallback rule: treat as variable reference.
 */
export const defaultVariableRule: ClassificationRule = (ctx) => {
    log(ctx, '✗ No match - using default: Variable');
    return { tokenType: TokenType.Variable, modifiers: 0 };
};

// ============================================================================
// RULE REGISTRY
// ============================================================================

/**
 * All identifier classification rules in priority order.
 * First matching rule wins.
 */
export const identifierRules: ClassificationRule[] = [
    keywordRule,
    declaredIdReferenceRule,
    importAliasDeclarationRule,
    importModulePathRule,
    simpleTypeNameRule,
    propertyTypeRule,
    propertyDeclarationRule,
    bindingNameRule,
    nestedBindingNameRule,
    idValueRule,
    signalDeclarationRule,
    functionDeclarationRule,
    functionCallRule,
    memberExpressionObjectRule,
    memberExpressionPropertyRule,
    qualifiedTypeNameRule,
    inlineComponentRule,
    signalParameterRule,
    functionParameterRule,
    objectLiteralKeyRule,
    defaultVariableRule
];
