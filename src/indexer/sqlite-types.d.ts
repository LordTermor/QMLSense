/**
 * Type definitions for dynamically loaded SQLite from lib/ folder
 */

declare module 'sqlite-dynamic' {
    export class Database {
        constructor(filename: string, callback?: (err: any) => void);
        run(sql: string, callback?: (err: any) => void): void;
        run(sql: string, params: any[], callback?: (err: any) => void): void;
        get(sql: string, callback?: (err: any, row: any) => void): void;
        get(sql: string, params: any[], callback?: (err: any, row: any) => void): void;
        all(sql: string, callback?: (err: any, rows: any[]) => void): void;
        all(sql: string, params: any[], callback?: (err: any, rows: any[]) => void): void;
        prepare(sql: string): Statement;
        close(): void;
        serialize(callback: () => void): void;
    }

    export class Statement {
        run(...params: any[]): void;
        finalize(callback?: (err: any) => void): void;
    }
}
