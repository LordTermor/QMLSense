import * as vscode from 'vscode';
import { getIndexer } from './indexerService';
import type { ModuleComponent } from './moduleTypes';

/**
 * Indexer Debug Commands
 * Diagnostic tools for workspace indexing, module resolution, and dependency tracking.
 */

/**
 * Creates an output channel with a shorthand logging function.
 * React-hooks style helper to reduce boilerplate.
 */
function createOutput(name: string) {
    const output = vscode.window.createOutputChannel(name);
    const log = output.appendLine.bind(output);
    return { output, log };
}

export function registerIndexerDebugCommands(context: vscode.ExtensionContext): void {
    const indexer = getIndexer();

    context.subscriptions.push(
        vscode.commands.registerCommand('qml.indexer.reindexWorkspace', () => reindexWorkspace(indexer)),
        vscode.commands.registerCommand('qml.indexer.clearCache', () => clearCache(indexer)),
        vscode.commands.registerCommand('qml.indexer.dumpIndex', () => dumpIndex(indexer)),
        vscode.commands.registerCommand('qml.indexer.showDependencyGraph', () => showDependencyGraph(indexer)),
        vscode.commands.registerCommand('qml.indexer.showFileInfo', () => showFileInfo(indexer)),
        vscode.commands.registerCommand('qml.indexer.showModuleIndex', () => showModuleIndex(indexer)),
        vscode.commands.registerCommand('qml.indexer.resolveComponent', () => resolveComponent(indexer))
    );
}

async function reindexWorkspace(indexer: ReturnType<typeof getIndexer>): Promise<void> {
    const startTime = Date.now();
    vscode.window.showInformationMessage('QML: Reindexing workspace...');
    
    try {
        await indexer.clearIndex();
        await indexer.indexWorkspace();
        const duration = Date.now() - startTime;
        vscode.window.showInformationMessage(`QML: Workspace indexed in ${duration}ms`);
    } catch (error) {
        vscode.window.showErrorMessage(`QML: Indexing failed - ${error}`);
    }
}

function clearCache(indexer: ReturnType<typeof getIndexer>): void {
    indexer.clearIndex();
    vscode.window.showInformationMessage('QML: Index cache cleared');
}

function dumpIndex(indexer: ReturnType<typeof getIndexer>): void {
    const { output, log } = createOutput('QML Index Dump');
    output.clear();
    output.show();

    const allFiles = indexer.getAllFiles();
    log(`QML Index - ${allFiles.length} files\n`);
    log('='.repeat(80));

    for (const entry of allFiles) {
        log(`\nFile: ${entry.uri}`);
        log(`Last Modified: ${new Date(entry.lastModified).toISOString()}`);
        log(`Content Hash: ${entry.contentHash.substring(0, 12)}...`);
        
        log(`\nImports (${entry.imports.length}):`);
        for (const imp of entry.imports) {
            const version = imp.version ? ` ${imp.version}` : '';
            const qualifier = imp.qualifier ? ` ${imp.qualifier}` : '';
            log(`  [${imp.type}] ${imp.source}${version}${qualifier}`);
        }

        log(`\nExports:`);
        log(`  Root: ${entry.exports.rootComponent || '(none)'}`);
        if (entry.exports.inlineComponents.length > 0) {
            log(`  Inline: ${entry.exports.inlineComponents.join(', ')}`);
        }

        log(`\nSymbols (${entry.symbols.length}):`);
        const symbolsByKind = new Map<string, string[]>();
        for (const sym of entry.symbols) {
            if (!symbolsByKind.has(sym.kind)) {
                symbolsByKind.set(sym.kind, []);
            }
            symbolsByKind.get(sym.kind)!.push(`${sym.name}: ${sym.type}`);
        }
        for (const [kind, symbols] of symbolsByKind) {
            log(`  ${kind}: ${symbols.join(', ')}`);
        }

        log(`\nDependencies:`);
        log(`  Depends on (${entry.dependsOn.length}): ${entry.dependsOn.join(', ') || '(none)'}`);
        log(`  Depended by (${entry.dependedBy.length}): ${entry.dependedBy.join(', ') || '(none)'}`);
        
        log('\n' + '-'.repeat(80));
    }

    vscode.window.showInformationMessage('QML: Index dumped to output channel');
}

function showDependencyGraph(indexer: ReturnType<typeof getIndexer>): void {
    const { output, log } = createOutput('QML Dependency Graph');
    output.clear();
    output.show();

    const allFiles = indexer.getAllFiles();
    log(`QML Dependency Graph\n`);
    log('='.repeat(80));

    log('\nDOT Graph (paste into graphviz visualizer):');
    log('\ndigraph QML_Dependencies {');
    log('  rankdir=LR;');
    log('  node [shape=box];');
    
    for (const entry of allFiles) {
        const fileName = entry.uri.split('/').pop() || entry.uri;
        for (const depUri of entry.dependsOn) {
            const depFileName = depUri.split('/').pop() || depUri;
            log(`  "${fileName}" -> "${depFileName}";`);
        }
    }
    log('}');

    log('\n' + '='.repeat(80));
    log('\nText Representation:\n');
    
    for (const entry of allFiles) {
        const fileName = entry.uri.split('/').pop() || entry.uri;
        log(`${fileName}:`);
        
        if (entry.dependsOn.length > 0) {
            log(`  → depends on:`);
            for (const dep of entry.dependsOn) {
                const depFileName = dep.split('/').pop() || dep;
                log(`      ${depFileName}`);
            }
        }
        
        if (entry.dependedBy.length > 0) {
            log(`  ← depended by:`);
            for (const dep of entry.dependedBy) {
                const depFileName = dep.split('/').pop() || dep;
                log(`      ${depFileName}`);
            }
        }
        
        if (entry.dependsOn.length === 0 && entry.dependedBy.length === 0) {
            log(`  (no dependencies)`);
        }
        
        log('');
    }

    vscode.window.showInformationMessage('QML: Dependency graph generated');
}

async function showFileInfo(indexer: ReturnType<typeof getIndexer>): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== 'qml') {
        vscode.window.showWarningMessage('QML: No active QML file');
        return;
    }

    const entry = await indexer.getFileIndex(editor.document.uri);
    if (!entry) {
        vscode.window.showWarningMessage('QML: File not indexed');
        return;
    }

    const { output, log } = createOutput('QML File Info');
    output.clear();
    output.show();

    log(`QML File Information\n`);
    log('='.repeat(80));
    log(`\nFile: ${entry.uri}`);
    log(`Last Modified: ${new Date(entry.lastModified).toISOString()}`);
    log(`Content Hash: ${entry.contentHash}`);
    
    log(`\n${'─'.repeat(80)}`);
    log(`IMPORTS (${entry.imports.length})\n`);
    for (const imp of entry.imports) {
        log(`[${imp.type.toUpperCase()}] ${imp.source}`);
        if (imp.version) log(`  Version: ${imp.version}`);
        if (imp.qualifier) log(`  Qualifier: ${imp.qualifier}`);
        if (imp.resolvedPaths && imp.resolvedPaths.length > 0) {
            log(`  Resolved: ${imp.resolvedPaths.join(', ')}`);
        }
        log('');
    }

    log(`${'─'.repeat(80)}`);
    log(`EXPORTS\n`);
    log(`Root Component: ${entry.exports.rootComponent || '(none)'}`);
    log(`Inline Components: ${entry.exports.inlineComponents.join(', ') || '(none)'}`);
    log(`Singleton: ${entry.exports.singletonType ? 'Yes' : 'No'}`);

    log(`\n${'─'.repeat(80)}`);
    log(`SYMBOLS (${entry.symbols.length})\n`);
    
    const byKind = new Map<string, typeof entry.symbols>();
    for (const sym of entry.symbols) {
        if (!byKind.has(sym.kind)) {
            byKind.set(sym.kind, []);
        }
        byKind.get(sym.kind)!.push(sym);
    }

    for (const [kind, symbols] of byKind) {
        log(`${kind.toUpperCase()} (${symbols.length}):`);
        for (const sym of symbols) {
            const line = sym.range.start.line + 1;
            log(`  ${sym.name}: ${sym.type} @ line ${line}`);
        }
        log('');
    }

    log(`${'─'.repeat(80)}`);
    log(`DEPENDENCIES\n`);
    log(`Depends on (${entry.dependsOn.length}):`);
    for (const dep of entry.dependsOn) {
        log(`  → ${dep}`);
    }
    log(`\nDepended by (${entry.dependedBy.length}):`);
    for (const dep of entry.dependedBy) {
        log(`  ← ${dep}`);
    }
}

function showModuleIndex(indexer: ReturnType<typeof getIndexer>): void {
    const moduleIndexer = indexer.getModuleIndexer();
    const allModules = moduleIndexer.getAllModules();

    const { output, log } = createOutput('QML Module Index');
    output.clear();
    output.show();

    log('QML MODULE INDEX\n');
    log(`Total modules: ${allModules.length}\n`);
    log('='.repeat(80));

    for (const module of allModules) {
        log(`\nMODULE: ${module.moduleName}`);
        log(`Location: ${module.qmldirPath || '(builtin)'}`);
        log(`Components: ${module.components.size}\n`);

        for (const [name, comp] of module.components) {
            if (comp.isSingleton) {
                log(`  [SINGLETON] ${name} ${comp.version || ''} → ${comp.filePath}`);
            } else {
                log(`  ${name} ${comp.version || ''} → ${comp.filePath}`);
            }
        }

        log('-'.repeat(80));
    }
}

async function resolveComponent(indexer: ReturnType<typeof getIndexer>): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== 'qml') {
        vscode.window.showWarningMessage('QML: No active QML file');
        return;
    }

    const componentName = await vscode.window.showInputBox({
        prompt: 'Enter component name to resolve (e.g., "Button", "Divider", "PolarisComponents.Divider")',
        placeHolder: 'Component name'
    });

    if (!componentName) return;

    const moduleIndexer = indexer.getModuleIndexer();
    const fileEntry = await indexer.getFileIndex(editor.document.uri);
    
    const { output, log } = createOutput('QML Component Resolution');
    output.clear();
    output.show();

    log(`Resolving component: ${componentName}\n`);
    log('='.repeat(80));

    if (!fileEntry) {
        log('\nFile not indexed yet');
        return;
    }

    log(`\nFile: ${editor.document.uri.fsPath}`);
    log(`Imports (${fileEntry.imports.length}):`);
    for (const imp of fileEntry.imports) {
        if (imp.type === 'module') {
            log(`  ${imp.source}${imp.version ? ' ' + imp.version : ''}${imp.qualifier ? ' as ' + imp.qualifier : ''}`);
        }
    }

    log('\n' + '-'.repeat(80));
    log('Resolution Results:\n');

    let targetModule: string | null = null;
    let targetComponent = componentName;
    
    if (componentName.includes('.')) {
        const parts = componentName.split('.');
        const qualifier = parts[0];
        targetComponent = parts.slice(1).join('.');
        
        const aliasedImport = fileEntry.imports.find(imp => 
            imp.type === 'module' && imp.qualifier === qualifier
        );
        
        if (aliasedImport) {
            targetModule = aliasedImport.source;
            log(`Resolved alias "${qualifier}" → module "${targetModule}"\n`);
        } else {
            log(`Alias "${qualifier}" not found in imports`);
            log(`Available aliases:`);
            for (const imp of fileEntry.imports) {
                if (imp.type === 'module' && imp.qualifier) {
                    log(`  ${imp.qualifier} → ${imp.source}`);
                }
            }
            log('');
        }
    }

    let found = false;
    for (const imp of fileEntry.imports) {
        if (imp.type !== 'module') continue;
        
        if (targetModule && imp.source !== targetModule) continue;
        if (!targetModule && imp.qualifier) continue;
        
        const component = moduleIndexer.resolveComponent(imp.source, targetComponent);
        if (component) {
            log(`✓ Found in module: ${imp.source}`);
            if (imp.qualifier) {
                log(`  Imported as: ${imp.qualifier}`);
            }
            log(`  Component: ${component.name} ${component.version || ''}`);
            log(`  File: ${component.filePath}`);
            log(`  Singleton: ${component.isSingleton ? 'Yes' : 'No'}`);
            found = true;
            break;
        }
    }
    
    if (!found) {
        log(`✗ Component "${targetComponent}" not found in accessible modules`);
    }

    log('\n' + '-'.repeat(80));
    log('All matching components in imported modules:\n');

    for (const imp of fileEntry.imports) {
        if (imp.type !== 'module') continue;
        
        const module = moduleIndexer.resolveModule(imp.source);
        if (!module) continue;

        const matching: ModuleComponent[] = [];
        for (const [name, comp] of module.components) {
            if (name === targetComponent) {
                matching.push(comp);
            }
        }

        if (matching.length > 0) {
            log(`Module: ${imp.source}${imp.qualifier ? ' as ' + imp.qualifier : ''}`);
            for (const match of matching) {
                log(`  ${match.name} ${match.version || ''} → ${match.filePath}`);
            }
        }
    }
}
