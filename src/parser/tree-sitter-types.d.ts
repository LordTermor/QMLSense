/**
 * Type definitions for web-tree-sitter loaded from lib/
 */

declare module 'tree-sitter-dynamic' {
    export interface Point {
        row: number;
        column: number;
    }

    export interface Range {
        startPosition: Point;
        endPosition: Point;
        startIndex: number;
        endIndex: number;
    }

    export interface Edit {
        startIndex: number;
        oldEndIndex: number;
        newEndIndex: number;
        startPosition: Point;
        oldEndPosition: Point;
        newEndPosition: Point;
    }

    export interface Logger {
        (message: string, params: { [param: string]: string }, type: 'parse' | 'lex'): void;
    }

    export class SyntaxNode {
        readonly id: number;
        readonly typeId: number;
        readonly grammarId: number;
        readonly type: string;
        readonly grammarType: string;
        readonly isNamed: boolean;
        readonly isMissing: boolean;
        readonly isExtra: boolean;
        readonly hasChanges: boolean;
        readonly hasError: boolean;
        readonly isError: boolean;
        readonly text: string;
        readonly parseState: number;
        readonly nextParseState: number;
        readonly startPosition: Point;
        readonly endPosition: Point;
        readonly startIndex: number;
        readonly endIndex: number;
        readonly parent: SyntaxNode | null;
        readonly children: Array<SyntaxNode>;
        readonly namedChildren: Array<SyntaxNode>;
        readonly childCount: number;
        readonly namedChildCount: number;
        readonly firstChild: SyntaxNode | null;
        readonly firstNamedChild: SyntaxNode | null;
        readonly lastChild: SyntaxNode | null;
        readonly lastNamedChild: SyntaxNode | null;
        readonly nextSibling: SyntaxNode | null;
        readonly nextNamedSibling: SyntaxNode | null;
        readonly previousSibling: SyntaxNode | null;
        readonly previousNamedSibling: SyntaxNode | null;
        readonly descendantCount: number;

        equals(other: SyntaxNode): boolean;
        toString(): string;
        child(index: number): SyntaxNode | null;
        namedChild(index: number): SyntaxNode | null;
        childForFieldName(fieldName: string): SyntaxNode | null;
        childForFieldId(fieldId: number): SyntaxNode | null;
        fieldNameForChild(childIndex: number): string | null;
        childrenForFieldName(fieldName: string): Array<SyntaxNode>;
        childrenForFieldId(fieldId: number): Array<SyntaxNode>;
        firstChildForIndex(index: number): SyntaxNode | null;
        firstNamedChildForIndex(index: number): SyntaxNode | null;
        descendantForIndex(index: number): SyntaxNode;
        descendantForIndex(startIndex: number, endIndex: number): SyntaxNode;
        namedDescendantForIndex(index: number): SyntaxNode;
        namedDescendantForIndex(startIndex: number, endIndex: number): SyntaxNode;
        descendantForPosition(position: Point): SyntaxNode;
        descendantForPosition(startPosition: Point, endPosition: Point): SyntaxNode;
        namedDescendantForPosition(position: Point): SyntaxNode;
        namedDescendantForPosition(startPosition: Point, endPosition: Point): SyntaxNode;
        descendantsOfType(types: string | Array<string>, startPosition?: Point, endPosition?: Point): Array<SyntaxNode>;
        walk(): TreeCursor;
    }

    export class Tree {
        readonly rootNode: SyntaxNode;
        
        edit(delta: Edit): Tree;
        walk(): TreeCursor;
        getChangedRanges(other: Tree): Range[];
        getEditedRange(other: Tree): Range;
        printDotGraph(): string;
    }

    export class TreeCursor {
        nodeType: string;
        nodeTypeId: number;
        nodeStateId: number;
        nodeText: string;
        nodeId: number;
        nodeIsNamed: boolean;
        nodeIsMissing: boolean;
        startPosition: Point;
        endPosition: Point;
        startIndex: number;
        endIndex: number;
        readonly currentNode: SyntaxNode;
        readonly currentFieldName: string;
        readonly currentFieldId: number;
        readonly currentDepth: number;
        readonly currentDescendantIndex: number;

        reset(node: SyntaxNode): void;
        resetTo(cursor: TreeCursor): void;
        gotoParent(): boolean;
        gotoFirstChild(): boolean;
        gotoFirstChildForIndex(index: number): boolean;
        gotoFirstChildForPosition(position: Point): boolean;
        gotoNextSibling(): boolean;
        gotoDescendant(index: number): void;
    }

    export class Language {
        static load(moduleOrPath: ArrayBuffer | string): Promise<Language>;
        readonly version: number;
        readonly fieldCount: number;
        readonly stateCount: number;
        readonly nodeTypeCount: number;

        fieldNameForId(fieldId: number): string | null;
        fieldIdForName(fieldName: string): number | null;
        idForNodeType(type: string, named: boolean): number;
        nodeTypeForId(typeId: number): string | null;
        nodeTypeIsNamed(typeId: number): boolean;
        nodeTypeIsVisible(typeId: number): boolean;
        query(source: string): Query;
    }

    export class Query {
        readonly patternCount: number;
        readonly captureCount: number;
        readonly stringCount: number;

        captureNameForId(captureId: number): string | null;
        stringValueForId(stringId: number): string | null;
        disableCapture(captureName: string): void;
        disablePattern(patternIndex: number): void;
        isPatternGuaranteedAtStep(byteOffset: number): boolean;
        matches(node: SyntaxNode, startPosition?: Point, endPosition?: Point): QueryMatch[];
        captures(node: SyntaxNode, startPosition?: Point, endPosition?: Point): QueryCapture[];
    }

    export interface QueryMatch {
        pattern: number;
        captures: QueryCapture[];
    }

    export interface QueryCapture {
        name: string;
        node: SyntaxNode;
    }

    export interface ParserOptions {
        locateFile?: (scriptName: string, scriptDirectory: string) => string;
    }

    export default class Parser {
        static init(options?: ParserOptions): Promise<void>;
        
        delete(): void;
        parse(input: string | Input, oldTree?: Tree, options?: { includedRanges?: Range[] }): Tree;
        getIncludedRanges(): Range[];
        getLanguage(): Language | null;
        getLogger(): Logger | null;
        getTimeoutMicros(): number;
        reset(): void;
        setLanguage(language: Language | null): void;
        setLogger(logFunc: Logger | null): void;
        setTimeoutMicros(timeout: number): void;

        static Language: typeof Language;
    }

    export type Input = (index: number, position?: Point) => string | null;
}
