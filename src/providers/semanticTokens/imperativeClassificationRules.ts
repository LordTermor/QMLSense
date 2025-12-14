import type { SyntaxNode } from "../../parser/qmlParser";
import {
  TokenType,
  TokenModifier,
  type TokenClassification,
} from "./tokenClassifier";
import type { ClassificationContext } from "./classificationRules";
import { jsBuiltinGlobals, jsBuiltinMembers } from "./builtinTypes";
import * as ast from "../../symbols/ast";

/**
 * Helper to check if a node is in an imperative (JavaScript) context.
 * This includes function bodies, signal handlers, property bindings with expressions.
 */
function isInImperativeContext(node: SyntaxNode): boolean {
  return (
    ast.findAncestorOfType(node, [
      "statement_block",
      "expression_statement",
      "ternary_expression",
      "binary_expression",
      "unary_expression",
      "update_expression",
      "call_expression",
      "arguments",
      "parenthesized_expression",
      "return_statement",
      "if_statement",
      "for_statement",
      "while_statement",
      "lexical_declaration",
      "variable_declarator",
    ]) !== null
  );
}

// ============================================================================
// IMPERATIVE CLASSIFICATION RULES
// ============================================================================

/**
 * Rule: JavaScript built-in global objects (console, Math, undefined, etc.).
 */
export const jsBuiltinGlobalRule = (
  ctx: ClassificationContext
): TokenClassification | null => {
  const inContext = isInImperativeContext(ctx.node);
  if (ctx.debug) {
    console.log(
      `  [jsBuiltinGlobalRule] inContext: ${inContext}, isBuiltin: ${jsBuiltinGlobals.has(
        ctx.nodeText
      )}`
    );
  }
  if (!inContext) return null;

  const { node, parent, nodeText } = ctx;

  if (jsBuiltinGlobals.has(nodeText)) {
    if (
      parent?.type === "member_expression" &&
      ast.isAtField(node, parent, "object")
    ) {
      const modifiers = TokenModifier.DefaultLibrary | TokenModifier.Static;
      return { tokenType: TokenType.Namespace, modifiers };
    }

    return {
      tokenType: TokenType.Variable,
      modifiers: TokenModifier.DefaultLibrary,
    };
  }

  return null;
};

/**
 * Rule: JavaScript built-in methods/properties (console.log, Math.PI).
 */
export const jsBuiltinMemberRule = (
  ctx: ClassificationContext
): TokenClassification | null => {
  if (!isInImperativeContext(ctx.node)) return null;

  const { node, parent, nodeText } = ctx;

  // Must be property_identifier in member_expression
  if (
    node.type !== "property_identifier" ||
    parent?.type !== "member_expression"
  ) {
    return null;
  }

  if (!ast.isAtField(node, parent, "property")) return null;

  const objectNode = parent.childForFieldName("object");
  if (!objectNode) return null;

  const objectName = objectNode.text;
  const fullName = `${objectName}.${nodeText}`;

  if (jsBuiltinMembers.has(fullName)) {
    const grandParent = parent.parent;
    const isMethodCall =
      grandParent?.type === "call_expression" &&
      ast.nodesEqual(parent, grandParent.childForFieldName("function"));

    if (isMethodCall) {
      return {
        tokenType: TokenType.Method,
        modifiers: TokenModifier.DefaultLibrary,
      };
    } else {
      return {
        tokenType: TokenType.Property,
        modifiers: TokenModifier.DefaultLibrary,
      };
    }
  }

  return null;
};

/**
 * Rule: Member expression in imperative context (for non-builtins).
 * Handles cases like: obj.method(), obj.property
 */
export const imperativeMemberExpressionRule = (
  ctx: ClassificationContext
): TokenClassification | null => {
  if (!isInImperativeContext(ctx.node)) return null;

  const { node, parent } = ctx;

  if (
    parent?.type !== "member_expression" ||
    node.type !== "property_identifier"
  ) {
    return null;
  }

  if (!ast.isAtField(node, parent, "property")) return null;

  const grandParent = parent.parent;
  const isMethodCall =
    grandParent?.type === "call_expression" &&
    ast.nodesEqual(parent, grandParent.childForFieldName("function"));

  if (isMethodCall) {
    return { tokenType: TokenType.Method, modifiers: 0 };
  }

  return { tokenType: TokenType.Property, modifiers: 0 };
};

/**
 * Rule: Variables in imperative context.
 * This handles identifiers that aren't caught by other rules.
 */
export const imperativeVariableRule = (
  ctx: ClassificationContext
): TokenClassification | null => {
  const inContext = isInImperativeContext(ctx.node);
  if (ctx.debug) {
    console.log(
      `  [imperativeVariableRule] inContext: ${inContext}, isIdentifier: ${ast.qml.isIdentifierNode(
        ctx.node
      )}`
    );
  }
  if (!inContext) return null;

  const { node } = ctx;

  if (!ast.qml.isIdentifierNode(node)) return null;

  return { tokenType: TokenType.Variable, modifiers: 0 };
};

// ============================================================================
// RULE REGISTRY
// ============================================================================

/**
 * All imperative (JavaScript) classification rules in priority order.
 * These should be integrated after QML-specific rules but before the default fallback.
 */
export const imperativeRules = [
  jsBuiltinGlobalRule,
  jsBuiltinMemberRule,
  imperativeMemberExpressionRule,
  imperativeVariableRule,
];
