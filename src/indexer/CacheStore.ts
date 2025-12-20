import * as vscode from 'vscode';
import * as path from 'path';
import { QmlFile, Module, Component } from './types';

// Dynamic type for SQLite database
type Database = any;

/**
 * SQLite cache for QML files and modules.
 * Simple persistence layer with validation.
 */
export class CacheStore {
    private db: Database | null = null;
    private dbPath: string;

    constructor(workspaceFolder: vscode.WorkspaceFolder) {
        this.dbPath = path.join(workspaceFolder.uri.fsPath, '.vscode', 'qmlindex.db');
    }

    async initialize(): Promise<void> {
        const dir = path.dirname(this.dbPath);
        try {
            await vscode.workspace.fs.createDirectory(vscode.Uri.file(dir));
        } catch {}

        const sqlitePath = path.join(__dirname, '..', '..', 'lib', 'sqlite3');
        const { Database: DatabaseImpl } = require(sqlitePath);

        return new Promise((resolve, reject) => {
            this.db = new DatabaseImpl(this.dbPath, (err: any) => {
                if (err) return reject(err);
                
                this.db!.run('PRAGMA journal_mode=WAL', () => {
                    this.createTables().then(resolve).catch(reject);
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
                        uri TEXT PRIMARY KEY,
                        hash TEXT NOT NULL,
                        mtime INTEGER NOT NULL,
                        data TEXT NOT NULL
                    )
                `);

                this.db!.run(`
                    CREATE TABLE IF NOT EXISTS modules (
                        name TEXT PRIMARY KEY,
                        version TEXT NOT NULL,
                        qmldir_path TEXT,
                        mtime INTEGER NOT NULL
                    )
                `);

                this.db!.run(`
                    CREATE TABLE IF NOT EXISTS components (
                        module_name TEXT NOT NULL,
                        name TEXT NOT NULL,
                        file_path TEXT,
                        is_builtin INTEGER NOT NULL,
                        is_singleton INTEGER NOT NULL,
                        version TEXT,
                        PRIMARY KEY (module_name, name),
                        FOREIGN KEY (module_name) REFERENCES modules(name) ON DELETE CASCADE
                    )
                `, (err: any) => {
                    if (err) reject(err);
                    else resolve();
                });
            });
        });
    }

    // QML Files
    async saveQmlFilesBatch(files: Array<{ path: string; file: QmlFile }>): Promise<void> {
        if (!this.db || files.length === 0) return;

        return new Promise((resolve, reject) => {
            this.db!.serialize(() => {
                this.db!.run('BEGIN TRANSACTION');

                const stmt = this.db!.prepare(`
                    INSERT OR REPLACE INTO qml_files (uri, hash, mtime, data)
                    VALUES (?, ?, ?, ?)
                `);

                for (const { path: filePath, file } of files) {
                    stmt.run(file.uri, file.hash, file.mtime, JSON.stringify(file));
                }

                stmt.finalize((err: any) => {
                    if (err) {
                        this.db!.run('ROLLBACK');
                        reject(err);
                    } else {
                        this.db!.run('COMMIT', (commitErr: any) => {
                            commitErr ? reject(commitErr) : resolve();
                        });
                    }
                });
            });
        });
    }

    async loadAllQmlFiles(): Promise<Map<string, QmlFile>> {
        if (!this.db) return new Map();

        return new Promise((resolve, reject) => {
            this.db!.all('SELECT uri, data FROM qml_files', async (err: any, rows: any[]) => {
                if (err) return reject(err);

                const results = new Map<string, QmlFile>();
                
                for (const row of rows || []) {
                    try {
                        const file: QmlFile = JSON.parse(row.data);
                        
                        const currentMtime = await this.getFileMtime(vscode.Uri.parse(file.uri).fsPath);
                        if (currentMtime === file.mtime) {
                            results.set(file.uri, file);
                        } else {
                            await this.removeQmlFile(vscode.Uri.parse(file.uri).fsPath);
                        }
                    } catch (error) {
                        console.error('[Cache] Failed to parse cached file:', error);
                    }
                }

                resolve(results);
            });
        });
    }

    async removeQmlFile(filePath: string): Promise<void> {
        if (!this.db) return;

        return new Promise((resolve, reject) => {
            this.db!.run('DELETE FROM qml_files WHERE uri = ?', [vscode.Uri.file(filePath).toString()], (err: any) => {
                err ? reject(err) : resolve();
            });
        });
    }

    // Modules
    async saveModule(module: Module): Promise<void> {
        if (!this.db) return;

        const mtime = module.qmldirPath ? await this.getFileMtime(module.qmldirPath) : Date.now();

        return new Promise((resolve, reject) => {
            this.db!.serialize(() => {
                this.db!.run('BEGIN TRANSACTION');

                this.db!.run(`
                    INSERT OR REPLACE INTO modules (name, version, qmldir_path, mtime)
                    VALUES (?, ?, ?, ?)
                `, [module.name, module.version, module.qmldirPath || null, mtime]);

                this.db!.run('DELETE FROM components WHERE module_name = ?', [module.name]);

                const stmt = this.db!.prepare(`
                    INSERT INTO components (module_name, name, file_path, is_builtin, is_singleton, version)
                    VALUES (?, ?, ?, ?, ?, ?)
                `);

                for (const [name, comp] of module.components) {
                    stmt.run(
                        module.name, name, comp.filePath || null,
                        comp.isBuiltin ? 1 : 0, comp.isSingleton ? 1 : 0, comp.version || null
                    );
                }

                stmt.finalize((err: any) => {
                    if (err) {
                        this.db!.run('ROLLBACK');
                        reject(err);
                    } else {
                        this.db!.run('COMMIT', (commitErr: any) => {
                            commitErr ? reject(commitErr) : resolve();
                        });
                    }
                });
            });
        });
    }

    async loadAllModules(): Promise<Module[]> {
        if (!this.db) return [];

        return new Promise((resolve, reject) => {
            this.db!.all('SELECT name FROM modules', async (err: any, rows: any[]) => {
                if (err) return reject(err);

                const modules: Module[] = [];
                
                for (const row of rows || []) {
                    const module = await this.loadModule(row.name);
                    if (module) modules.push(module);
                }

                resolve(modules);
            });
        });
    }

    private async loadModule(name: string): Promise<Module | null> {
        if (!this.db) return null;

        return new Promise((resolve, reject) => {
            this.db!.get('SELECT * FROM modules WHERE name = ?', [name], async (err: any, moduleRow: any) => {
                if (err) return reject(err);
                if (!moduleRow) return resolve(null);

                if (moduleRow.qmldir_path) {
                    const currentMtime = await this.getFileMtime(moduleRow.qmldir_path);
                    if (currentMtime !== moduleRow.mtime) {
                        await this.removeModule(name);
                        return resolve(null);
                    }
                }

                this.db!.all('SELECT * FROM components WHERE module_name = ?', [name], (compErr: any, componentRows: any[]) => {
                    if (compErr) return reject(compErr);

                    const components = new Map<string, Component>();
                    for (const row of componentRows || []) {
                        components.set(row.name, {
                            name: row.name,
                            filePath: row.file_path,
                            isBuiltin: row.is_builtin === 1,
                            isSingleton: row.is_singleton === 1,
                            version: row.version
                        });
                    }

                    resolve({
                        name: moduleRow.name,
                        version: moduleRow.version,
                        qmldirPath: moduleRow.qmldir_path,
                        components
                    });
                });
            });
        });
    }

    private async removeModule(name: string): Promise<void> {
        if (!this.db) return;

        return new Promise((resolve, reject) => {
            this.db!.run('DELETE FROM modules WHERE name = ?', [name], (err: any) => {
                err ? reject(err) : resolve();
            });
        });
    }

    // Utilities
    private async getFileMtime(filePath: string): Promise<number> {
        try {
            const stat = await vscode.workspace.fs.stat(vscode.Uri.file(filePath));
            return stat.mtime;
        } catch {
            return 0;
        }
    }

    async clearCache(): Promise<void> {
        if (!this.db) return;

        return new Promise((resolve, reject) => {
            this.db!.serialize(() => {
                this.db!.run('DELETE FROM qml_files');
                this.db!.run('DELETE FROM components');
                this.db!.run('DELETE FROM modules', (err: any) => {
                    err ? reject(err) : resolve();
                });
            });
        });
    }

    dispose(): void {
        if (this.db) {
            this.db.close();
            this.db = null;
        }
    }
}
