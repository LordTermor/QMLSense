import * as vscode from 'vscode';
import * as path from 'path';
import type { Database } from 'sqlite-dynamic';

// Load SQLite from lib/ folder at extension root
const sqlitePath = path.join(__dirname, '..', '..', 'lib', 'sqlite3');
const { Database: DatabaseImpl } = require(sqlitePath);

import { ModuleIndex, ModuleComponent } from './moduleTypes';
import { FileIndexEntry } from './types';

/**
 * SQLite-based persistent cache for QML workspace data.
 * Caches both module metadata and QML file parse results.
 */
export class CacheStore {
    private db: Database | null = null;
    private dbPath: string;

    constructor(workspaceFolder: vscode.WorkspaceFolder) {
        const vscodeDir = path.join(workspaceFolder.uri.fsPath, '.vscode');
        this.dbPath = path.join(vscodeDir, 'qmlindex.db');
    }

    async initialize(): Promise<void> {
        const vscodeDir = path.dirname(this.dbPath);
        try {
            await vscode.workspace.fs.createDirectory(vscode.Uri.file(vscodeDir));
        } catch (error) {
        }

        return new Promise((resolve, reject) => {
            this.db = new DatabaseImpl(this.dbPath, (err: any) => {
                if (err) {
                    console.error('[Cache Store] Failed to initialize:', err);
                    reject(err);
                    return;
                }
                
                this.db!.run('PRAGMA journal_mode=WAL', (walErr) => {
                    if (walErr) {
                        console.warn('[Cache Store] Failed to enable WAL mode:', walErr);
                    }
                    
                    this.createTables()
                        .then(() => {
                            console.log(`[Cache Store] Initialized at ${this.dbPath}`);
                            resolve();
                        })
                        .catch(reject);
                });
            });
        });
    }

    private async createTables(): Promise<void> {
        if (!this.db) return;

        return new Promise((resolve, reject) => {
            this.db!.serialize(() => {
                this.db!.run(`
                    CREATE TABLE IF NOT EXISTS qml_files (
                        file_path TEXT PRIMARY KEY,
                        content_hash TEXT NOT NULL,
                        last_modified INTEGER NOT NULL,
                        imports_json TEXT NOT NULL,
                        exports_json TEXT NOT NULL,
                        symbols_json TEXT NOT NULL,
                        depends_on_json TEXT NOT NULL
                    )
                `, (err) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                });

                // Module metadata table
                this.db!.run(`
                    CREATE TABLE IF NOT EXISTS modules (
                        module_name TEXT PRIMARY KEY,
                        version TEXT NOT NULL,
                        qmldir_path TEXT,
                        last_modified INTEGER NOT NULL
                    )
                `, (err) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                });

                // Component table with foreign keys to modules and qml_files
                this.db!.run(`
                    CREATE TABLE IF NOT EXISTS components (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        module_name TEXT NOT NULL,
                        component_name TEXT NOT NULL,
                        file_path TEXT,
                        is_builtin INTEGER NOT NULL,
                        is_singleton INTEGER NOT NULL,
                        version TEXT,
                        FOREIGN KEY (module_name) REFERENCES modules(module_name) ON DELETE CASCADE,
                        FOREIGN KEY (file_path) REFERENCES qml_files(file_path) ON DELETE SET NULL,
                        UNIQUE(module_name, component_name)
                    )
                `, (err) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                });

                // Indexes for fast lookups
                this.db!.run(`
                    CREATE INDEX IF NOT EXISTS idx_qml_files_hash 
                    ON qml_files(content_hash)
                `, (err) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                });

                this.db!.run(`
                    CREATE INDEX IF NOT EXISTS idx_components_module 
                    ON components(module_name)
                `, (err) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                });

                this.db!.run(`
                    CREATE INDEX IF NOT EXISTS idx_components_name 
                    ON components(component_name)
                `, (err) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    resolve();
                });
            });
        });
    }

    /**
     * Save module index to cache.
     */
    async saveModule(module: ModuleIndex): Promise<void> {
        if (!this.db) {
            console.log('[Cache Store] saveModule: No database connection');
            return;
        }

        const lastModified = module.qmldirPath 
            ? await this.getFileModTime(module.qmldirPath)
            : Date.now();

        console.log(`[Cache Store] Saving module: ${module.moduleName} (${module.components.size} components)`);

        return new Promise((resolve, reject) => {
            this.db!.serialize(() => {
                this.db!.run('BEGIN TRANSACTION');

                this.db!.run(`
                    INSERT OR REPLACE INTO modules (module_name, version, qmldir_path, last_modified)
                    VALUES (?, ?, ?, ?)
                `, [module.moduleName, module.version, module.qmldirPath || null, lastModified], (err) => {
                    if (err) {
                        this.db!.run('ROLLBACK');
                        reject(err);
                        return;
                    }
                });

                this.db!.run('DELETE FROM components WHERE module_name = ?', [module.moduleName], (err) => {
                    if (err) {
                        this.db!.run('ROLLBACK');
                        reject(err);
                        return;
                    }
                });

                const stmt = this.db!.prepare(`
                    INSERT INTO components (module_name, component_name, file_path, is_builtin, is_singleton, version)
                    VALUES (?, ?, ?, ?, ?, ?)
                `);

                for (const [componentName, component] of module.components) {
                    stmt.run(
                        module.moduleName,
                        componentName,
                        component.filePath || null,
                        component.isBuiltin ? 1 : 0,
                        component.isSingleton ? 1 : 0,
                        component.version || null
                    );
                }

                stmt.finalize((err) => {
                    if (err) {
                        this.db!.run('ROLLBACK');
                        reject(err);
                        return;
                    }

                    this.db!.run('COMMIT', (commitErr) => {
                        if (commitErr) {
                            reject(commitErr);
                        } else {
                            resolve();
                        }
                    });
                });
            });
        });
    }

    /**
     * Load module from cache if valid.
     */
    async loadModule(moduleName: string): Promise<ModuleIndex | null> {
        if (!this.db) return null;

        return new Promise((resolve, reject) => {
            this.db!.get(`
                SELECT module_name, version, qmldir_path, last_modified
                FROM modules WHERE module_name = ?
            `, [moduleName], async (err, moduleRow: any) => {
                if (err) {
                    reject(err);
                    return;
                }

                if (!moduleRow) {
                    resolve(null);
                    return;
                }

                if (moduleRow.qmldir_path) {
                    const currentModTime = await this.getFileModTime(moduleRow.qmldir_path);
                    if (currentModTime !== moduleRow.last_modified) {
                        await this.removeModule(moduleName);
                        resolve(null);
                        return;
                    }
                }

                this.db!.all(`
                    SELECT component_name, file_path, is_builtin, is_singleton, version
                    FROM components WHERE module_name = ?
                `, [moduleName], (compErr, componentRows: any[]) => {
                    if (compErr) {
                        reject(compErr);
                        return;
                    }

                    const components = new Map<string, ModuleComponent>();
                    for (const row of componentRows) {
                        components.set(row.component_name, {
                            name: row.component_name,
                            filePath: row.file_path,
                            isBuiltin: row.is_builtin === 1,
                            isSingleton: row.is_singleton === 1,
                            version: row.version
                        });
                    }

                    resolve({
                        moduleName: moduleRow.module_name,
                        version: moduleRow.version,
                        qmldirPath: moduleRow.qmldir_path,
                        components
                    });
                });
            });
        });
    }

    /**
     * Load all cached modules.
     */
    async loadAllModules(): Promise<ModuleIndex[]> {
        if (!this.db) {
            console.log('[Cache Store] loadAllModules: No database connection');
            return [];
        }

        return new Promise((resolve, reject) => {
            this.db!.all('SELECT module_name FROM modules', async (err, moduleRows: any[]) => {
                if (err) {
                    console.error('[Cache Store] loadAllModules error:', err);
                    reject(err);
                    return;
                }

                console.log(`[Cache Store] Found ${moduleRows?.length || 0} module records in database`);
                
                const modules: ModuleIndex[] = [];
                for (const row of moduleRows || []) {
                    const module = await this.loadModule(row.module_name);
                    if (module) {
                        modules.push(module);
                    } else {
                        console.log(`[Cache Store] Failed to load module: ${row.module_name}`);
                    }
                }

                console.log(`[Cache Store] Successfully loaded ${modules.length} modules from cache`);
                resolve(modules);
            });
        });
    }

    /**
     * Find module that contains the given file path.
     * Looks up the file in the components table to find its module.
     */
    async findModuleByFilePath(filePath: string): Promise<ModuleIndex | null> {
        if (!this.db) return null;

        return new Promise((resolve, reject) => {
            this.db!.get(`
                SELECT module_name
                FROM components
                WHERE file_path = ?
                LIMIT 1
            `, [filePath], async (err, row: any) => {
                if (err) {
                    reject(err);
                    return;
                }

                if (!row) {
                    resolve(null);
                    return;
                }

                const module = await this.loadModule(row.module_name);
                resolve(module);
            });
        });
    }

    /**
     * Remove module from cache.
     */
    async removeModule(moduleName: string): Promise<void> {
        if (!this.db) return;

        return new Promise((resolve, reject) => {
            this.db!.run('DELETE FROM modules WHERE module_name = ?', [moduleName], (err) => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }

    /**
     * Get cache statistics.
     */
    async getStats(): Promise<{ modules: number; components: number; qmlFiles: number }> {
        if (!this.db) return { modules: 0, components: 0, qmlFiles: 0 };

        return new Promise((resolve, reject) => {
            this.db!.get('SELECT COUNT(*) as count FROM modules', (err, moduleRow: any) => {
                if (err) {
                    reject(err);
                    return;
                }

                this.db!.get('SELECT COUNT(*) as count FROM components', (compErr, componentRow: any) => {
                    if (compErr) {
                        reject(compErr);
                        return;
                    }

                    this.db!.get('SELECT COUNT(*) as count FROM qml_files', (qmlErr, qmlRow: any) => {
                        if (qmlErr) {
                            reject(qmlErr);
                            return;
                        }

                        resolve({
                            modules: moduleRow.count,
                            components: componentRow.count,
                            qmlFiles: qmlRow.count
                        });
                    });
                });
            });
        });
    }

    private async getFileModTime(filePath: string): Promise<number> {
        try {
            const stat = await vscode.workspace.fs.stat(vscode.Uri.file(filePath));
            return stat.mtime;
        } catch {
            return 0;
        }
    }

    // ========================================================================
    // QML Files Cache
    // ========================================================================

    /**
     * Save batch of QML files in a single transaction.
     */
    async saveQmlFilesBatch(files: Array<{ filePath: string; entry: FileIndexEntry }>): Promise<void> {
        if (!this.db || files.length === 0) return;

        return new Promise((resolve, reject) => {
            this.db!.serialize(() => {
                this.db!.run('BEGIN TRANSACTION');

                const stmt = this.db!.prepare(`
                    INSERT OR REPLACE INTO qml_files 
                    (file_path, content_hash, last_modified, imports_json, exports_json, symbols_json, depends_on_json)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                `);

                for (const { filePath, entry } of files) {
                    stmt.run(
                        filePath,
                        entry.contentHash,
                        entry.lastModified,
                        JSON.stringify(entry.imports),
                        JSON.stringify(entry.exports),
                        JSON.stringify(entry.symbols),
                        JSON.stringify(entry.dependsOn)
                    );
                }

                stmt.finalize((err) => {
                    if (err) {
                        this.db!.run('ROLLBACK');
                        reject(err);
                        return;
                    }

                    this.db!.run('COMMIT', (commitErr) => {
                        if (commitErr) {
                            reject(commitErr);
                        } else {
                            resolve();
                        }
                    });
                });
            });
        });
    }

    /**
     * Load QML file from cache if valid.
     */
    async loadQmlFile(filePath: string): Promise<FileIndexEntry | null> {
        if (!this.db) return null;

        return new Promise((resolve, reject) => {
            this.db!.get(`
                SELECT file_path, content_hash, last_modified, imports_json, exports_json, symbols_json, depends_on_json
                FROM qml_files WHERE file_path = ?
            `, [filePath], async (err, row: any) => {
                if (err) {
                    reject(err);
                    return;
                }

                if (!row) {
                    resolve(null);
                    return;
                }

                const currentModTime = await this.getFileModTime(filePath);
                if (currentModTime !== row.last_modified) {
                    await this.removeQmlFile(filePath);
                    resolve(null);
                    return;
                }

                const entry: FileIndexEntry = {
                    uri: vscode.Uri.file(filePath).toString(),
                    imports: JSON.parse(row.imports_json),
                    exports: JSON.parse(row.exports_json),
                    symbols: JSON.parse(row.symbols_json),
                    dependsOn: JSON.parse(row.depends_on_json),
                    dependedBy: [], // Will be rebuilt
                    contentHash: row.content_hash,
                    lastModified: row.last_modified
                };

                resolve(entry);
            });
        });
    }

    /**
     * Remove QML file from cache.
     */
    async removeQmlFile(filePath: string): Promise<void> {
        if (!this.db) return;

        return new Promise((resolve, reject) => {
            this.db!.run('DELETE FROM qml_files WHERE file_path = ?', [filePath], (err) => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }

    /**
     * Load all cached QML files.
     */
    async loadAllQmlFiles(): Promise<Map<string, FileIndexEntry>> {
        if (!this.db) return new Map();

        return new Promise((resolve, reject) => {
            this.db!.all('SELECT file_path FROM qml_files', async (err, rows: any[]) => {
                if (err) {
                    reject(err);
                    return;
                }

                const results = new Map<string, FileIndexEntry>();
                
                for (const row of rows || []) {
                    const cached = await this.loadQmlFile(row.file_path);
                    if (cached) {
                        results.set(row.file_path, cached);
                    }
                }

                console.log(`[Cache Store] Loaded ${results.size} QML files from cache`);
                resolve(results);
            });
        });
    }

    /**
     * Clear entire cache (both QML files and modules).
     */
    async clearCache(): Promise<void> {
        if (!this.db) return;

        return new Promise((resolve, reject) => {
            this.db!.serialize(() => {
                this.db!.run('DELETE FROM qml_files');
                this.db!.run('DELETE FROM components');
                this.db!.run('DELETE FROM modules', (err) => {
                    if (err) {
                        reject(err);
                    } else {
                        console.log('[Cache Store] All caches cleared');
                        resolve();
                    }
                });
            });
        });
    }

    dispose(): void {
        if (this.db) {
            this.db.close();
            this.db = null;
            console.log('[Cache Store] Closed');
        }
    }
}
