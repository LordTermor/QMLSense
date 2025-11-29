import { QmldirEntry } from '../moduleTypes';

/**
 * Extracts module information from qmldir file content.
 * Parses qmldir syntax into structured data.
 */
export class ModuleExtractor {
    /**
     * Parse qmldir file content into structured entries.
     */
    parse(content: string): QmldirEntry[] {
        const entries: QmldirEntry[] = [];
        const lines = content.split('\n');

        for (const line of lines) {
            const trimmed = line.trim();
            
            if (!trimmed || trimmed.startsWith('#')) continue;

            const entry = this.parseLine(trimmed);
            if (entry) {
                entries.push(entry);
            }
        }

        return entries;
    }

    private parseLine(line: string): QmldirEntry | null {
        const parts = line.split(/\s+/);
        if (parts.length === 0) return null;

        const keyword = parts[0];

        switch (keyword) {
            case 'module':
                return {
                    type: 'module',
                    moduleName: parts[1]
                };

            case 'singleton':
                if (parts.length >= 4) {
                    return {
                        type: 'singleton',
                        typeName: parts[1],
                        version: parts[2],
                        filePath: parts[3]
                    };
                }
                return null;

            case 'typeinfo':
                return {
                    type: 'typeinfo',
                    filePath: parts[1]
                };

            case 'plugin':
                return {
                    type: 'plugin',
                    moduleName: parts[1]
                };

            case 'classname':
                return {
                    type: 'classname',
                    typeName: parts[1]
                };

            case 'depends':
                if (parts.length >= 3) {
                    return {
                        type: 'depends',
                        moduleName: parts[1],
                        version: parts[2]
                    };
                }
                return null;

            case 'import':
                if (parts.length >= 3) {
                    return {
                        type: 'import',
                        moduleName: parts[1],
                        version: parts[2]
                    };
                }
                return null;

            case 'optional':
                return {
                    type: 'optional',
                    moduleName: parts[1]
                };

            case 'default':
                return {
                    type: 'default',
                    typeName: parts[1]
                };

            case 'designersupported':
                return {
                    type: 'designersupported'
                };

            default:
                if (parts.length >= 3) {
                    return {
                        type: 'module',
                        typeName: parts[0],
                        version: parts[1],
                        filePath: parts[2]
                    };
                }
                return null;
        }
    }
}
