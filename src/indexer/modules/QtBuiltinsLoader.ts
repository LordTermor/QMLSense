import * as path from 'path';
import * as fs from 'fs';
import { ModuleIndex, ModuleComponent } from '../moduleTypes';

interface QtBuiltinSpec {
    version: string;
    components: Array<{
        name: string;
        isSingleton: boolean;
    }>;
}

type QtBuiltinsData = Record<string, QtBuiltinSpec>;

/**
 * Loads Qt builtin modules from JSON data file.
 * Replaces hardcoded module definitions.
 */
export class QtBuiltinsLoader {
    private data: QtBuiltinsData;
    private builtinModules: Set<string>;

    constructor() {
        const dataPath = path.join(__dirname, '../data/qt-builtins.json');
        const content = fs.readFileSync(dataPath, 'utf8');
        this.data = JSON.parse(content);
        this.builtinModules = new Set(Object.keys(this.data));
        
        // Add additional known Qt modules not in data file
        this.builtinModules.add('QtQuick.Dialogs');
        this.builtinModules.add('QtQuick.Templates');
        this.builtinModules.add('QtQml.Models');
        this.builtinModules.add('Qt.labs.platform');
        this.builtinModules.add('Qt.labs.settings');
    }

    /**
     * Get builtin module by name.
     */
    getModule(moduleName: string, version?: string): ModuleIndex | null {
        const spec = this.data[moduleName];
        if (!spec) {
            return null;
        }

        const components = new Map<string, ModuleComponent>();
        for (const comp of spec.components) {
            components.set(comp.name, {
                name: comp.name,
                isBuiltin: true,
                isSingleton: comp.isSingleton,
                version: version || spec.version,
            });
        }

        return {
            moduleName,
            version: version || spec.version,
            components,
        };
    }

    /**
     * Check if module is a Qt builtin.
     */
    isBuiltin(moduleName: string): boolean {
        return this.builtinModules.has(moduleName);
    }

    /**
     * Get all builtin module names.
     */
    getAllModuleNames(): string[] {
        return Array.from(this.builtinModules);
    }

    /**
     * Load all builtin modules into cache.
     */
    loadAllBuiltins(): ModuleIndex[] {
        const modules: ModuleIndex[] = [];
        
        for (const moduleName of Object.keys(this.data)) {
            const module = this.getModule(moduleName);
            if (module) {
                modules.push(module);
            }
        }

        return modules;
    }
}
