import * as vscode from "vscode";
import { getParser } from "../../parser/qmlParser";
import type { SyntaxNode } from "../../parser/qmlParser";
import * as ast from "../../symbols/ast";

export class QmlSyntaxDiagnosticsProvider {
  private diagnosticCollection: vscode.DiagnosticCollection;
  private disposables: vscode.Disposable[] = [];

  constructor() {
    this.diagnosticCollection =
      vscode.languages.createDiagnosticCollection("qml-syntax");
  }

  public activate(context: vscode.ExtensionContext) {
    if (vscode.window.activeTextEditor) {
      this.updateDiagnostics(vscode.window.activeTextEditor.document);
    }

    this.disposables.push(
      vscode.workspace.onDidOpenTextDocument((doc) => {
        if (doc.languageId === "qml") {
          this.updateDiagnostics(doc);
        }
      }),
      vscode.workspace.onDidChangeTextDocument((event) => {
        if (event.document.languageId === "qml") {
          this.updateDiagnostics(event.document);
        }
      }),
      vscode.workspace.onDidCloseTextDocument((doc) => {
        if (doc.languageId === "qml") {
          this.diagnosticCollection.delete(doc.uri);
        }
      }),
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (editor && editor.document.languageId === "qml") {
          this.updateDiagnostics(editor.document);
        }
      })
    );

    context.subscriptions.push(this.diagnosticCollection, ...this.disposables);
  }

  private async updateDiagnostics(document: vscode.TextDocument) {
    if (document.languageId !== "qml") {
      return;
    }

    const parser = getParser();
    if (!parser.isInitialized()) {
      await parser.initialize();
    }

    const tree = parser.parse(document.getText());
    const diagnostics: vscode.Diagnostic[] = [];

    this.collectErrorNodes(tree.rootNode, document, diagnostics);

    this.diagnosticCollection.set(document.uri, diagnostics);
  }

  private collectErrorNodes(
    node: SyntaxNode,
    document: vscode.TextDocument,
    diagnostics: vscode.Diagnostic[]
  ) {
    if (node.type === "ERROR") {
      const range = ast.nodeToRange(node, document);
      const errorText =
        node.text.length > 50 ? node.text.substring(0, 50) + "..." : node.text;

      let message = `Syntax error: unexpected token`;

      if (node.parent?.type === "ui_object_initializer") {
        message = `Syntax error: invalid property or object definition`;
      } else if (node.parent?.type === "ui_binding") {
        message = `Syntax error: invalid property binding`;
      } else if (node.parent?.type === "ui_object_definition") {
        message = `Syntax error: invalid object definition`;
      } else if (node.parent?.type === "program") {
        message = `Syntax error: invalid top-level declaration`;
      }

      if (errorText.trim()) {
        message += ` near "${errorText}"`;
      }

      const diagnostic = new vscode.Diagnostic(
        range,
        message,
        vscode.DiagnosticSeverity.Error
      );
      diagnostic.source = "qml-syntax";
      diagnostics.push(diagnostic);
    }

    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child) {
        this.collectErrorNodes(child, document, diagnostics);
      }
    }
  }
}
