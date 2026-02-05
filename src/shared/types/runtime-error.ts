 /**
  * Represents a runtime error captured from the preview.
  */
 export interface RuntimeError {
   /** Error message */
   message: string;
   /** Stack trace if available */
   stack?: string;
   /** Component where the error occurred */
   componentStack?: string;
   /** File path if determinable from stack */
   filePath?: string;
   /** Line number if determinable */
   line?: number;
   /** Error type classification */
   type: RuntimeErrorType;
   /** Timestamp when error occurred */
   timestamp: string;
 }
 
 /**
  * Classification of runtime error types.
  */
 export type RuntimeErrorType =
   | 'RENDER_ERROR'      // React component render failure
   | 'REFERENCE_ERROR'   // Undefined variable access
   | 'TYPE_ERROR'        // Type mismatch at runtime
   | 'SYNTAX_ERROR'      // JavaScript syntax error
   | 'NETWORK_ERROR'     // Failed API/fetch call
   | 'PROMISE_ERROR'     // Unhandled promise rejection
   | 'UNKNOWN_ERROR';    // Catch-all
 
 /**
  * Classifies an error into a RuntimeErrorType.
  */
 export function classifyRuntimeError(error: Error): RuntimeErrorType {
   const message = error.message.toLowerCase();
   const name = error.name.toLowerCase();
 
   if (name === 'referenceerror' || message.includes('is not defined')) {
     return 'REFERENCE_ERROR';
   }
   if (name === 'typeerror' || message.includes('cannot read propert') || message.includes('is not a function')) {
     return 'TYPE_ERROR';
   }
   if (name === 'syntaxerror') {
     return 'SYNTAX_ERROR';
   }
   if (message.includes('fetch') || message.includes('network') || message.includes('cors')) {
     return 'NETWORK_ERROR';
   }
   if (message.includes('promise') || message.includes('async')) {
     return 'PROMISE_ERROR';
   }
   // React-specific render errors
   if (message.includes('render') || message.includes('component') || message.includes('hook')) {
     return 'RENDER_ERROR';
   }
 
   return 'UNKNOWN_ERROR';
 }
 
 /**
  * Parses a stack trace to extract file path and line number.
  */
 export function parseStackTrace(stack: string): { filePath?: string; line?: number } {
   // Match patterns like:
   // - "at Component (src/components/Foo.tsx:42:10)"
   // - "at src/App.tsx:15:5"
   const patterns = [
     /at\s+\w+\s+\(([^:)]+):(\d+):\d+\)/,
     /at\s+([^:)]+):(\d+):\d+/,
     /\(([^:)]+):(\d+):\d+\)/,
   ];
 
   for (const line of stack.split('\n')) {
     for (const pattern of patterns) {
       const match = line.match(pattern);
       if (match) {
         const filePath = match[1]?.trim();
         const lineNum = parseInt(match[2] ?? '0', 10);
         // Filter out node_modules and internal paths
         if (filePath && !filePath.includes('node_modules') && filePath.includes('src/')) {
           return { filePath, line: lineNum };
         }
       }
     }
   }
 
   return {};
 }
 
 /**
  * Creates a RuntimeError from a caught Error and optional component stack.
  */
 export function createRuntimeError(
   error: Error,
   componentStack?: string
 ): RuntimeError {
   const type = classifyRuntimeError(error);
   const stackInfo = error.stack ? parseStackTrace(error.stack) : {};
 
   return {
     message: error.message,
     stack: error.stack,
     componentStack,
     filePath: stackInfo.filePath,
     line: stackInfo.line,
     type,
     timestamp: new Date().toISOString(),
   };
 }