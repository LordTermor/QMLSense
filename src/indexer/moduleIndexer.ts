/**
 * @deprecated This file is kept for backward compatibility.
 * Use './modules/ModuleIndexer' instead.
 */
export { ModuleIndexer } from './modules/ModuleIndexer';

let moduleIndexerInstance: import('./modules/ModuleIndexer').ModuleIndexer | null = null;

export function getModuleIndexer(): import('./modules/ModuleIndexer').ModuleIndexer {
    if (!moduleIndexerInstance) {
        const { ModuleIndexer } = require('./modules/ModuleIndexer');
        moduleIndexerInstance = new ModuleIndexer();
    }
    return moduleIndexerInstance!;
}

