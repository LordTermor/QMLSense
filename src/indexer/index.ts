/**
 * Indexer v2 - Simplified, KISS implementation.
 * 
 * Structure:
 * - IndexerService: Facade/orchestrator
 * - QmlFileIndexer: Parse .qml files, extract metadata, watch for changes
 * - ModuleIndexer: Parse qmldir files, load Qt builtins, watch for changes
 * - CacheStore: SQLite persistence layer
 * - types: Shared data structures
 * 
 * Features removed from v1:
 * - Wrapper classes (QmlFileExtractor, ModuleExtractor, etc)
 * - ModuleCache (just use Map)
 * - ModuleResolver (inlined suffix matching)
 * - DependencyResolver (unused dependency graph)
 * - ContentHasher (use crypto directly)
 * - Separate watcher classes (inline FileSystemWatcher)
 * - Configurable root markers (just use dirname)
 * 
 * Result: 5 files instead of 17, ~600 lines instead of ~2000
 */

export * from './IndexerService';
export * from './types';
