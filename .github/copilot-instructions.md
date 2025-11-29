# VS Code QML Extension - AI Coding Guide

## Architecture: Vertical Slices Pattern

The codebase follows a **vertical architecture** where each feature owns its full stack:

```
src/
├── symbols/           # AST navigation and utilities (used by ALL providers)
│   └── ast/           # Tree-sitter AST utilities
│       ├── navigation.ts  # Generic tree-sitter utilities
│       ├── qml.ts     # QML-specific AST patterns
│       └── index.ts   # Unified export (import * as ast from 'symbols/ast')
├── models/            # Domain types (SymbolInfo, etc.)
├── services/          # Business logic (SymbolResolver - used by multiple providers)
├── providers/         # Language feature implementations (organized by feature)
│   ├── definition/    # Go-to-definition
│   ├── references/    # Find references + document highlight
│   ├── symbols/       # Document outline
│   ├── selection/     # Smart selection expansion
│   ├── semanticTokens/ # Syntax highlighting
│   └── qmldir/        # Support for qmldir module definition files
├── indexer/           # Workspace indexing (2 vertical slices)
│   ├── qml-files/     # QML file parsing & caching
│   ├── modules/       # Module resolution (qmldir parsing, Qt builtins)
│   └── shared/        # Shared indexer utilities (file watching, hashing)
└── parser/            # tree-sitter parser singleton
```

**Critical Pattern**: Each provider folder is self-contained. Adding a new feature = creating a new provider folder, not modifying existing ones.

## Core Concepts

### 1. Tree-Sitter AST Navigation

All features work by traversing the tree-sitter AST. **Never** use regex for QML parsing.

**Common node types**:
- `ui_object_definition` - QML object (e.g., `Rectangle { ... }`)
- `ui_property` - Property declaration (`property string name`)
- `ui_binding` - Property assignment (`width: 100` or `id: myRect`)
- `ui_signal` - Signal declaration
- `ui_import` - Import statement
- `ui_inline_component` - Inline component definition
- `identifier`, `property_identifier`, `type_identifier` - Name tokens

**Key utilities in `symbols/ast/navigation.ts`**:
- `nodeToRange()` - Convert tree-sitter node to VS Code Range (used everywhere)
- `getNodeAtPosition()` - Find relevant node at cursor position
- `findNode()` - Recursive search with predicate
- `traverseParents()` - Walk up the AST
- `getField()` / `getFieldText()` - Access named children (e.g., `type_name`, `name`)
- `hasAncestorChain()` - Check if node's parent chain matches a type pattern (e.g., `['nested_identifier', 'ui_object_definition']`)

**QML-specific patterns in `symbols/ast/qml.ts`**:

*AST Navigation:*
- `isIdentifierNode()` - Check if node is any identifier type
- `findParentQmlObject()` - Walk up skipping property groups
- `findContainingImport()` - Get ui_import ancestor if any
- `findImportAlias()` - Find import alias declaration
- `getLeftmostIdentifier()` - Get first identifier in nested_identifier chain (e.g., "QQC" from "QQC.Button")
- `isFirstPartOfNestedIdentifier()` - Check if node is the qualifier part of a qualified name
- `isLastPartOfNestedIdentifier()` - Check if node is the component part of a qualified name

*Semantic Parsers:*
- `parseImport()` → `ImportInfo` - Parse import statement into structured data (source, version, alias, positions)
- `parseQualifiedType()` → `QualifiedTypeInfo` - Parse qualified type from AST node (handles "QQC.Button")
- `parseQualifiedTypeName()` - Parse qualified type from string (text-only, no AST nodes)
- `isSignalHandler()` - Check if name follows signal handler pattern (onXxx)

**Import pattern**: All providers use `import * as ast from '../../symbols/ast'`
- Generic utilities: `ast.nodeToRange()`, `ast.getField()`, `ast.hasAncestorChain()`, etc.
- QML-specific: `ast.qml.isIdentifierNode()`, `ast.qml.parseImport()`, `ast.qml.isSignalHandler()`, etc.

**CRITICAL**: Node identity comparison fails! When comparing nodes (e.g., `parent.childForFieldName('type_name') === node`), the comparison will always be `false` even if they represent the same AST position. Instead, **always compare by position**:
```typescript
// ❌ WRONG - will always be false
if (parent.childForFieldName('type_name') === node) { ... }

// ✅ CORRECT - compare positions
const typeName = parent.childForFieldName('type_name');
if (typeName && node.startIndex === typeName.startIndex && node.endIndex === typeName.endIndex) { ... }
```
This applies to ALL node comparisons: `childForFieldName()`, `firstNamedChild`, `lastNamedChild`, etc.

### 2. QML-Specific AST Utilities

All QML-specific AST patterns are in `symbols/ast/qml.ts`:

- **Parent keyword resolution**: `findParentQmlObject()` - walks up skipping property groups (anchors, font)
- **Property groups**: Objects starting with lowercase (e.g., `anchors {}`) aren't real QML components
- **Import aliases**: `import QtQuick 2.15 as QQ` - alias detection via `findImportAlias()`
- **Import detection**: `findContainingImport()` - efficiently checks if node is in import statement

### 3. Indexing Architecture

**Two independent vertical slices**:

1. **QML File Indexer** (`indexer/qml-files/`):
   - Extracts: imports, exports (root component + inline components), symbols, dependencies
   - Batch processing (default 200 files/batch) for speed
   - SQLite persistent cache (`.vscode/qmlindex.db`)
   - File watchers for incremental updates

2. **Module Indexer** (`indexer/modules/`):
   - Parses `qmldir` files to build module → components mapping
   - Loads Qt builtin metadata from `src/indexer/data/qt-builtins.json`
   - Caches to same SQLite database
   - Enables "go to definition" on imported component types

**Performance**: ~8-12 seconds for 18,000 files (previously 63 seconds before batch optimization)

### 4. Rules Pattern (Chain of Responsibility)

Multiple providers use the **Rules pattern** for clean, extensible decision-making:

**Providers using Rules pattern:**
- `DefinitionRules` - Go-to-definition resolution (6 rules)
- `ClassificationRule` - Semantic token classification (20+ rules)
- `HoverRules` - Hover information (5 rules)
- `SymbolResolver` - Symbol resolution (3 rules for symbols, 6 for declarations)

**Pattern:**
```typescript
export type MyRule = (context: Context) => Result | null;

class MyRules {
    getRules(): MyRule[] {
        return [
            this.rule1.bind(this),
            this.rule2.bind(this),
            this.fallbackRule.bind(this)
        ];
    }
    
    private rule1(context: Context): Result | null {
        if (!matches) return null;
        return result;
    }
}

// Usage
for (const rule of rules.getRules()) {
    const result = rule(context);
    if (result) return result; // First match wins
}
```

**When to use Rules pattern:**
- Decision-making with multiple conditions checked in priority order
- Each rule is independent and self-contained
- Easy to add/remove/reorder rules
- Clear separation of concerns

**When NOT to use:**
- Accumulating multiple results (use direct conditionals instead)
- Simple if-else chains (2-3 conditions don't need the overhead)

### 5. Symbol Resolution Service

The `SymbolResolver` service (`services/SymbolResolver.ts`) centralizes symbol lookup logic used by multiple providers:

```typescript
// Find what a symbol refers to (definition, references, highlight all use this)
resolveSymbol(node, root) → QmlSymbolInfo | null

// Find declaration of a named symbol
findDeclaration(root, symbolName) → DeclarationSearchResult | null
```

**Resolution order** (first match wins):
1. Import alias (if symbol used in qualified name like `QtQuick.Button`)
2. Parent context (walk up AST checking parent nodes)
3. Generic reference (fallback)

## Development Workflows

### Adding a New Language Feature Provider

1. Create folder: `src/providers/<feature-name>/`
2. Implement VS Code provider interface (e.g., `HoverProvider`)
3. Use `getParser()` from `parser/qmlParser.ts` (singleton)
4. Use utilities from `symbols/ast` - import as `import * as ast from '../../symbols/ast'`
5. Register in `extension.ts` activation

**Example pattern** (all providers follow this):
```typescript
import { getParser } from '../../parser/qmlParser';
import * as ast from '../../symbols/ast';

export class QmlXxxProvider implements vscode.XxxProvider {
    async provideXxx(document, position) {
        const parser = getParser();
        if (!parser.isInitialized()) await parser.initialize();
        
        const tree = parser.parse(document.getText());
        const offset = document.offsetAt(position);
        const node = ast.getNodeAtPosition(tree.rootNode, offset, ast.qml.isIdentifierNode);
        
        // Process node...
        return result;
    }
}
```

### Building & Testing

```bash
bun --bun run compile   # Compile TypeScript → out/ (use bun, not npm)
bun --bun run watch     # Watch mode for development
bun run copy-data       # Copy qt-builtins.json to out/ (required!)
```

**Critical**: 
- Always use `bun --bun run compile` (not `npm run compile`) for building the extension
- The `copy-data` script is required because `qt-builtins.json` is loaded at runtime from `out/indexer/data/`

### Debugging Tools (Commands)

Available via Command Palette (`Ctrl+Shift+P`):
- `QML: Show AST at Cursor` - Debug tree-sitter node structure
- `QML: Show Full AST` - Print entire file's AST
- `QML: Dump Index` - View all indexed file metadata
- `QML: Show Dependency Graph` - DOT graph of file imports
- `QML: Show Module Index` - View all resolved modules
- `QML: Resolve Component` - Debug component resolution

**Use these extensively** when working on provider features.

## Critical Patterns to Follow

### 1. No Code Duplication in Providers

If 2+ providers need the same logic, extract to:
- `symbols/ast/navigation.ts` for generic tree-sitter operations (e.g., `hasAncestorChain`)
- `symbols/ast/qml.ts` for QML-specific AST patterns and semantic parsers (e.g., `parseImport`, `isSignalHandler`)
- `services/` for multi-provider business logic (like `SymbolResolver`)

**Why**: Earlier versions had ~300 lines of duplicated code across 6 providers. Don't repeat that mistake.

**Prefer semantic parsers over manual AST walking**:
```typescript
// ❌ BAD - Manual parsing scattered in multiple providers
if (fullTypeName.includes('.')) {
    const parts = fullTypeName.split('.');
    const qualifier = parts[0];
    // ...
}

// ✅ GOOD - Centralized semantic parser
const parsed = ast.qml.parseQualifiedTypeName(fullTypeName);
const { qualifier, component } = parsed;
```

**Use `hasAncestorChain` instead of manual parent checks**:
```typescript
// ❌ BAD - Verbose and error-prone
if (node.parent?.type === 'nested_identifier' && 
    node.parent.parent?.type === 'ui_object_definition') {
    // ...
}

// ✅ GOOD - Clean and maintainable
if (ast.hasAncestorChain(node, ['nested_identifier', 'ui_object_definition'])) {
    // ...
}
```

### 2. Rules Pattern for Extensibility

See `DefinitionRules` and `SymbolResolver` - they use arrays of rule functions tried in order (chain of responsibility pattern). This makes adding new resolution rules trivial:

```typescript
const rules: Rule[] = [
    () => tryRule1(),
    () => tryRule2(),
    () => fallbackRule()
];

for (const rule of rules) {
    const result = rule();
    if (result) return result;
}
```

### 3. Persistent Cache Validation

When loading from SQLite cache, **always validate** by comparing file modification time:

```typescript
const currentModTime = await getFileModTime(filePath);
if (currentModTime !== cached.lastModified) {
    // Cache stale - remove and re-index
}
```

See `CacheStore.loadModule()` for example.

### 4. Batch Processing for Performance

When indexing large workspaces, use batch processing:

```typescript
const batchSize = config.get<number>('qml.indexing.batchSize', 200);
for (let i = 0; i < files.length; i += batchSize) {
    const batch = files.slice(i, i + batchSize);
    await Promise.all(batch.map(file => indexFile(file)));
}
```

This prevents event loop blocking and enables parallelism.

## Configuration

Users can configure via VS Code settings:
- `qml.semanticHighlighting.enabled` - Enable tree-sitter highlighting (default: true)
- `qml.indexing.enableOnStartup` - Auto-index workspace on activation (default: true)
- `qml.indexing.batchSize` - Parallel processing batch size (default: 200)
- `qml.indexing.ignoreFolders` - Glob patterns to exclude

## Known Limitations & Future Work

**Current scope**: File-scoped features only (except import alias resolution)

**Phase 2** (documented in `INDEXER.md`): Cross-file navigation
- Currently: Ctrl+Click on `CustomButton` won't jump to `CustomButton.qml`
- Planned: Module index will enable this via component type resolution

**Phase 4**: Persistent QML file cache (only module cache is persistent currently)

## Testing Checklist

When modifying providers, manually test:
- [ ] F12 (Go to Definition) on properties, functions, ids, `parent` keyword, import aliases
- [ ] Find All References (Shift+F12) for each symbol type
- [ ] Document symbols (Ctrl+Shift+O) shows all declarations
- [ ] Semantic highlighting colors correctly (imports, properties, functions)
- [ ] Expand selection (Shift+Alt+Right) works on QML objects

**No automated tests yet** - manual testing required.

## Key Files Reference

| File | Purpose |
|------|---------|
| `extension.ts` | Extension activation, provider registration |
| `parser/qmlParser.ts` | tree-sitter singleton (DO NOT create multiple instances) |
| `symbols/ast/navigation.ts` | Generic AST utilities (used by ALL providers) |
| `symbols/ast/qml.ts` | QML-specific AST patterns |
| `symbols/ast/index.ts` | Unified export for all AST utilities |
| `services/SymbolResolver.ts` | Centralized symbol resolution logic |
| `indexer/indexerService.ts` | Facade orchestrating QML + Module indexers |
| `indexer/cacheStore.ts` | SQLite persistent cache (modules + QML files) |

## External Dependencies

- `web-tree-sitter` (0.20.8): AST parsing engine
- `@vscode/sqlite3`: Native SQLite for persistent cache
- `tree-sitter-qmljs.wasm`: QML grammar (bundled in extension root)

**WASM loading**: The parser loads from `__dirname/../../tree-sitter-qmljs.wasm`, so WASM must be at extension root after compilation.
