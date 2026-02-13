import type { FileType } from './plan';

/**
 * Entry in the file index representing a single file's metadata.
 */
export interface FileIndexEntry {
  /** Path to the file */
  filePath: string;
  /** Type of file */
  fileType: FileType;
  /** SHA-256 hash of file content */
  hash: string;
  /** Exports from this file */
  exports: ExportInfo[];
  /** Imports in this file */
  imports: ImportInfo[];
  /** React components defined in this file */
  components: ComponentInfo[];
  /** Functions defined in this file */
  functions: FunctionInfo[];
}

/**
 * Information about an export from a file.
 */
export interface ExportInfo {
  /** Name of the export */
  name: string;
  /** Type of export */
  type: 'default' | 'named';
  /** Kind of exported value */
  kind: 'component' | 'function' | 'constant' | 'type' | 'interface';
}

/**
 * Information about an import in a file.
 */
export interface ImportInfo {
  /** Source module path */
  source: string;
  /** Imported specifiers */
  specifiers: string[];
  /** Whether this is a relative import */
  isRelative: boolean;
}

/**
 * Information about a React component.
 */
export interface ComponentInfo {
  /** Name of the component */
  name: string;
  /** Props accepted by the component */
  props: string[];
  /** Starting line number */
  startLine: number;
  /** Ending line number */
  endLine: number;
}

/**
 * Information about a function.
 */
export interface FunctionInfo {
  /** Name of the function */
  name: string;
  /** Parameter names */
  params: string[];
  /** Starting line number */
  startLine: number;
  /** Ending line number */
  endLine: number;
}

/**
 * A subset of project files relevant to a modification request.
 */
export interface CodeSlice {
  /** Path to the file */
  filePath: string;
  /** Content of the file */
  content: string;
  /** Relevance of this slice to the modification */
  relevance: 'primary' | 'context';
}
