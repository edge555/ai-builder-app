/**
 * @fileoverview Tests for file-index-parsers module
 * Tests regex-based parsing of TypeScript/JavaScript code metadata
 */

import { describe, it, expect } from 'vitest';
import {
  parseExports,
  parseImports,
  parseComponents,
  parseFunctions,
} from '../../analysis/file-index-parsers';

describe('parseExports', () => {
  it('should parse default function exports', () => {
    const content = `
export default function myFunction() {
  return 'hello';
}
`;
    const exports = parseExports(content);
    expect(exports).toHaveLength(1);
    expect(exports[0]).toEqual({
      name: 'myFunction',
      type: 'default',
      kind: 'function',
    });
  });

  it('should parse default constant exports', () => {
    const content = `
export default const MY_CONSTANT = 'value';
`;
    const exports = parseExports(content);
    expect(exports).toHaveLength(1);
    expect(exports[0]).toEqual({
      name: 'MY_CONSTANT',
      type: 'default',
      kind: 'constant',
    });
  });

  it('should parse named function exports', () => {
    const content = `
export function myFunction() {
  return 'hello';
}
`;
    const exports = parseExports(content);
    expect(exports).toHaveLength(1);
    expect(exports[0]).toEqual({
      name: 'myFunction',
      type: 'named',
      kind: 'function',
    });
  });

  it('should parse named constant exports', () => {
    const content = `
export const MY_CONSTANT = 'value';
`;
    const exports = parseExports(content);
    expect(exports).toHaveLength(1);
    expect(exports[0]).toEqual({
      name: 'MY_CONSTANT',
      type: 'named',
      kind: 'constant',
    });
  });

  it('should parse interface exports', () => {
    const content = `
export interface MyInterface {
  name: string;
  age: number;
}
`;
    const exports = parseExports(content);
    expect(exports).toHaveLength(1);
    expect(exports[0]).toEqual({
      name: 'MyInterface',
      type: 'named',
      kind: 'interface',
    });
  });

  it('should parse type exports', () => {
    const content = `
export type MyType = string | number;
`;
    const exports = parseExports(content);
    expect(exports).toHaveLength(1);
    expect(exports[0]).toEqual({
      name: 'MyType',
      type: 'named',
      kind: 'type',
    });
  });

  it('should parse re-exports', () => {
    const content = `
export { func1, func2, func3 } from './module';
`;
    const exports = parseExports(content);
    expect(exports).toHaveLength(3);
    expect(exports[0]).toEqual({
      name: 'func1',
      type: 'named',
      kind: 'constant',
    });
    expect(exports[1]).toEqual({
      name: 'func2',
      type: 'named',
      kind: 'constant',
    });
    expect(exports[2]).toEqual({
      name: 'func3',
      type: 'named',
      kind: 'constant',
    });
  });

  it('should parse re-exports with aliases', () => {
    const content = `
export { func1 as f1, func2 as f2 } from './module';
`;
    const exports = parseExports(content);
    expect(exports).toHaveLength(2);
    expect(exports[0]).toEqual({
      name: 'f1',
      type: 'named',
      kind: 'constant',
    });
    expect(exports[1]).toEqual({
      name: 'f2',
      type: 'named',
      kind: 'constant',
    });
  });

  it('should identify component exports (PascalCase)', () => {
    const content = `
export function MyComponent() {
  return <div>Hello</div>;
}
`;
    const exports = parseExports(content);
    expect(exports).toHaveLength(1);
    expect(exports[0]).toEqual({
      name: 'MyComponent',
      type: 'named',
      kind: 'component',
    });
  });

  it('should parse multiple exports', () => {
    const content = `
export function func1() {}
export const CONST1 = 'value';
export interface Interface1 {}
export type Type1 = string;
export default function DefaultFunc() {}
`;
    const exports = parseExports(content);
    expect(exports).toHaveLength(5);
    expect(exports[0].name).toBe('func1');
    expect(exports[1].name).toBe('CONST1');
    expect(exports[2].name).toBe('Interface1');
    expect(exports[3].name).toBe('Type1');
    expect(exports[4].name).toBe('DefaultFunc');
  });

  it('should handle empty content', () => {
    const exports = parseExports('');
    expect(exports).toHaveLength(0);
  });

  it('should handle content with no exports', () => {
    const content = `
function internalFunc() {}
const internalConst = 'value';
`;
    const exports = parseExports(content);
    expect(exports).toHaveLength(0);
  });
});

describe('parseImports', () => {
  it('should parse named imports', () => {
    const content = `
import { func1, func2, func3 } from 'module';
`;
    const imports = parseImports(content);
    expect(imports).toHaveLength(1);
    expect(imports[0]).toEqual({
      source: 'module',
      specifiers: ['func1', 'func2', 'func3'],
      isRelative: false,
    });
  });

  it('should parse default imports', () => {
    const content = `
import MyModule from 'module';
`;
    const imports = parseImports(content);
    expect(imports).toHaveLength(1);
    expect(imports[0]).toEqual({
      source: 'module',
      specifiers: ['MyModule'],
      isRelative: false,
    });
  });

  it('should parse mixed imports', () => {
    const content = `
import DefaultModule, { func1, func2 } from 'module';
`;
    const imports = parseImports(content);
    expect(imports).toHaveLength(1);
    expect(imports[0]).toEqual({
      source: 'module',
      specifiers: ['DefaultModule', 'func1', 'func2'],
      isRelative: false,
    });
  });

  it('should parse namespace imports', () => {
    const content = `
import * as Namespace from 'module';
`;
    const imports = parseImports(content);
    expect(imports).toHaveLength(1);
    expect(imports[0]).toEqual({
      source: 'module',
      specifiers: ['Namespace'],
      isRelative: false,
    });
  });

  it('should parse side-effect imports', () => {
    const content = `
import 'module';
`;
    const imports = parseImports(content);
    expect(imports).toHaveLength(1);
    expect(imports[0]).toEqual({
      source: 'module',
      specifiers: [],
      isRelative: false,
    });
  });

  it('should identify relative imports', () => {
    const content = `
import { func1 } from './module';
import { func2 } from '../other';
import { func3 } from '@/components';
`;
    const imports = parseImports(content);
    expect(imports).toHaveLength(3);
    expect(imports[0].isRelative).toBe(true);
    expect(imports[1].isRelative).toBe(true);
    expect(imports[2].isRelative).toBe(false);
  });

  it('should handle imports with aliases', () => {
    const content = `
import { func1 as f1, func2 as f2 } from 'module';
`;
    const imports = parseImports(content);
    expect(imports).toHaveLength(1);
    expect(imports[0].specifiers).toEqual(['func1', 'func2']);
  });

  it('should parse multiple imports', () => {
    const content = `
import { func1 } from 'module1';
import Default from 'module2';
import * as NS from 'module3';
import 'module4';
`;
    const imports = parseImports(content);
    expect(imports).toHaveLength(4);
  });

  it('should handle empty content', () => {
    const imports = parseImports('');
    expect(imports).toHaveLength(0);
  });

  it('should handle content with no imports', () => {
    const content = `
function internalFunc() {}
const internalConst = 'value';
`;
    const imports = parseImports(content);
    expect(imports).toHaveLength(0);
  });
});

describe('parseComponents', () => {
  it('should parse function components with JSX', () => {
    const content = `
function MyComponent() {
  return <div>Hello</div>;
}
`;
    const components = parseComponents(content);
    expect(components).toHaveLength(1);
    expect(components[0].name).toBe('MyComponent');
    expect(components[0].startLine).toBe(2);
    expect(components[0].endLine).toBe(4);
  });

  it('should parse const components with JSX', () => {
    const content = `
const MyComponent = () => {
  return <div>Hello</div>;
};
`;
    const components = parseComponents(content);
    expect(components).toHaveLength(1);
    expect(components[0].name).toBe('MyComponent');
  });

  it('should parse components with props', () => {
    const content = `
function MyComponent({ prop1, prop2 }) {
  return <div>{prop1} {prop2}</div>;
}
`;
    const components = parseComponents(content);
    expect(components).toHaveLength(1);
    expect(components[0].props).toEqual(['prop1', 'prop2']);
  });

  it('should parse components with typed props', () => {
    const content = `
function MyComponent(props: PropsType) {
  return <div>Hello</div>;
}
`;
    const components = parseComponents(content);
    expect(components).toHaveLength(1);
    expect(components[0].props).toEqual(['props']);
  });

  it('should parse exported components', () => {
    const content = `
export function MyComponent() {
  return <div>Hello</div>;
}
`;
    const components = parseComponents(content);
    expect(components).toHaveLength(1);
    expect(components[0].name).toBe('MyComponent');
  });

  it('should not parse regular functions as components', () => {
    const content = `
function myFunction() {
  return 'hello';
}
`;
    const components = parseComponents(content);
    expect(components).toHaveLength(0);
  });

  it('should not parse functions without JSX', () => {
    const content = `
function MyComponent() {
  return 'hello';
}
`;
    const components = parseComponents(content);
    expect(components).toHaveLength(0);
  });

  it('should parse multiple components', () => {
    const content = `
function Component1() {
  return <div>1</div>;
}

function Component2() {
  return <div>2</div>;
}
`;
    const components = parseComponents(content);
    expect(components).toHaveLength(2);
    expect(components[0].name).toBe('Component1');
    expect(components[1].name).toBe('Component2');
  });

  it('should handle components with nested braces', () => {
    const content = `
function MyComponent() {
  const data = { key: 'value' };
  return <div>{data.key}</div>;
}
`;
    const components = parseComponents(content);
    expect(components).toHaveLength(1);
    expect(components[0].endLine).toBeGreaterThan(components[0].startLine);
  });

  it('should handle empty content', () => {
    const components = parseComponents('');
    expect(components).toHaveLength(0);
  });
});

describe('parseFunctions', () => {
  it('should parse function declarations', () => {
    const content = `
function myFunction(param1, param2) {
  return param1 + param2;
}
`;
    const functions = parseFunctions(content);
    expect(functions).toHaveLength(1);
    expect(functions[0].name).toBe('myFunction');
    expect(functions[0].params).toEqual(['param1', 'param2']);
    expect(functions[0].startLine).toBe(2);
    expect(functions[0].endLine).toBe(4);
  });

  it('should parse arrow functions', () => {
    const content = `
const myFunction = (param1, param2) => {
  return param1 + param2;
};
`;
    const functions = parseFunctions(content);
    expect(functions).toHaveLength(1);
    expect(functions[0].name).toBe('myFunction');
    expect(functions[0].params).toEqual(['param1', 'param2']);
  });

  it('should parse async arrow functions', () => {
    const content = `
const myFunction = async (param1, param2) => {
  return await fetchData(param1, param2);
};
`;
    const functions = parseFunctions(content);
    expect(functions).toHaveLength(1);
    expect(functions[0].name).toBe('myFunction');
  });

  it('should parse functions with destructured params', () => {
    const content = `
function myFunction({ param1, param2 }) {
  return param1 + param2;
}
`;
    const functions = parseFunctions(content);
    expect(functions).toHaveLength(1);
    expect(functions[0].params).toEqual(['param1', 'param2']);
  });

  it('should parse functions with typed params', () => {
    const content = `
function myFunction(param1: string, param2: number) {
  return param1 + param2;
}
`;
    const functions = parseFunctions(content);
    expect(functions).toHaveLength(1);
    expect(functions[0].params).toEqual(['param1', 'param2']);
  });

  it('should parse functions with default params', () => {
    const content = `
function myFunction(param1 = 'default', param2 = 0) {
  return param1 + param2;
}
`;
    const functions = parseFunctions(content);
    expect(functions).toHaveLength(1);
    expect(functions[0].params).toEqual(['param1', 'param2']);
  });

  it('should parse exported functions', () => {
    const content = `
export function myFunction(param1) {
  return param1;
}
`;
    const functions = parseFunctions(content);
    expect(functions).toHaveLength(1);
    expect(functions[0].name).toBe('myFunction');
  });

  it('should not parse components as functions', () => {
    const content = `
function MyComponent() {
  return <div>Hello</div>;
}
`;
    const functions = parseFunctions(content);
    expect(functions).toHaveLength(0);
  });

  it('should parse multiple functions', () => {
    const content = `
function func1(param1) {
  return param1;
}

function func2(param1, param2) {
  return param1 + param2;
}
`;
    const functions = parseFunctions(content);
    expect(functions).toHaveLength(2);
    expect(functions[0].name).toBe('func1');
    expect(functions[1].name).toBe('func2');
  });

  it('should handle functions with no params', () => {
    const content = `
function myFunction() {
  return 'hello';
}
`;
    const functions = parseFunctions(content);
    expect(functions).toHaveLength(1);
    expect(functions[0].params).toEqual([]);
  });

  it('should handle empty content', () => {
    const functions = parseFunctions('');
    expect(functions).toHaveLength(0);
  });

  it('should handle functions with nested braces', () => {
    const content = `
function myFunction() {
  const data = { key: 'value' };
  if (data.key) {
    return data.key;
  }
  return null;
}
`;
    const functions = parseFunctions(content);
    expect(functions).toHaveLength(1);
    expect(functions[0].endLine).toBeGreaterThan(functions[0].startLine);
  });
});

describe('Integration tests', () => {
  it('should parse a complete TypeScript file', () => {
    const content = `
import { useState } from 'react';
import { helper } from './utils';

export interface Props {
  name: string;
  age: number;
}

export type Status = 'active' | 'inactive';

export function MyComponent({ name, age }: Props) {
  const [status, setStatus] = useState<Status>('active');
  return <div>{name} is {age} years old</div>;
}

export const CONSTANT = 'value';

function helperFunction(param: string): string {
  return param.toUpperCase();
}

export default MyComponent;
`;

    const exports = parseExports(content);
    expect(exports.length).toBeGreaterThan(0);

    const imports = parseImports(content);
    expect(imports).toHaveLength(2);

    const components = parseComponents(content);
    expect(components).toHaveLength(1);
    expect(components[0].name).toBe('MyComponent');

    const functions = parseFunctions(content);
    expect(functions).toHaveLength(1);
    expect(functions[0].name).toBe('helperFunction');
  });
});
