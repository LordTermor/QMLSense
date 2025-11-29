export interface ModuleComponent {
    name: string;
    filePath?: string;
    isBuiltin: boolean;
    isSingleton: boolean;
    version?: string;
}

export interface ModuleIndex {
    moduleName: string;
    version: string;
    components: Map<string, ModuleComponent>;
    qmldirPath?: string;
}

export interface QmldirEntry {
    type: 'module' | 'singleton' | 'typeinfo' | 'plugin' | 'classname' | 'depends' | 'import' | 'optional' | 'default' | 'designersupported';
    typeName?: string;
    version?: string;
    filePath?: string;
    moduleName?: string;
}
