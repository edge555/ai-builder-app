# Testing Guide — AI App Builder

> Instructions for generating tests in this codebase. Follow these patterns exactly.

## Framework & Tools

- **Vitest 4.x** — test runner for all workspaces
- **@testing-library/react** + **jsdom** — frontend component/hook tests
- **`vi` module** — mocking (functions, modules, timers)
- **TypeScript** — all tests are fully typed

## File Naming & Location

| Workspace | Pattern | Location |
|-----------|---------|----------|
| Backend | `*.test.ts` | `lib/__tests__/<category>/` or `lib/<module>/__tests__/` |
| Frontend | `*.test.ts` / `*.test.tsx` | Colocated: `src/<type>/<Name>/__tests__/` |
| Shared | `*.test.ts` | `src/__tests__/` |

Examples:
```
backend/lib/__tests__/utils/incremental-json-parser.test.ts
backend/lib/core/__tests__/validation-pipeline.test.ts
frontend/src/hooks/__tests__/useAutoSave.test.ts
frontend/src/components/TemplateGrid/__tests__/TemplateGrid.test.tsx
frontend/src/context/__tests__/ProjectContext.test.tsx
```

## Test Structure

Use **AAA pattern** (Arrange-Act-Assert) consistently:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('ModuleName', () => {
  // Setup shared across tests
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('methodName', () => {
    it('should return X when given Y', () => {
      // Arrange
      const input = createTestInput();

      // Act
      const result = moduleName.method(input);

      // Assert
      expect(result).toEqual(expectedOutput);
    });

    it('should throw when input is invalid', () => {
      expect(() => moduleName.method(null)).toThrow('Expected error message');
    });
  });
});
```

## What Every Test File Must Cover

### 1. Happy Path
Test the primary use case with valid inputs.

### 2. Edge Cases
- Empty inputs (`""`, `[]`, `{}`, `null`, `undefined`)
- Boundary values (0, 1, max length, min length)
- Large inputs (if the function processes data)
- Special characters in strings

### 3. Error Handling
- Invalid input types
- Missing required fields
- Network/IO failures (for async operations)
- Thrown errors with correct messages

### 4. Return Value Shape
Verify the complete structure of returned objects, not just one field.

### 5. Side Effects
- Verify mock functions were called with correct arguments
- Verify call count (`toHaveBeenCalledTimes`)
- Verify functions that should NOT be called (`not.toHaveBeenCalled`)

---

## Mocking Patterns

### Mock a Module

```typescript
// MUST be before imports
vi.mock('../../logger', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

// Then import the module under test
import { MyModule } from '../my-module';
```

### Mock Functions

```typescript
const mockCallback = vi.fn();
const mockAsync = vi.fn().mockResolvedValue({ data: 'result' });
const mockFailing = vi.fn().mockRejectedValue(new Error('Timeout'));

// Different return values per call
const mockRetry = vi.fn()
  .mockRejectedValueOnce(new Error('Fail 1'))
  .mockRejectedValueOnce(new Error('Fail 2'))
  .mockResolvedValue({ content: 'Success' });
```

### Mock Timers (for debounce, retry, delays)

```typescript
beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

it('should debounce saves', async () => {
  triggerSave();
  triggerSave();
  triggerSave();

  vi.advanceTimersByTime(500);
  await vi.runAllTimersAsync();

  expect(saveFn).toHaveBeenCalledTimes(1); // debounced
});
```

### Spy on Methods

```typescript
const spy = vi.spyOn(object, 'method');
// ... do work ...
expect(spy).toHaveBeenCalledWith(expectedArgs);
spy.mockRestore();
```

---

## Frontend-Specific Patterns

### Component Tests (`.test.tsx`)

```typescript
import { render, screen, fireEvent } from '@testing-library/react';
import { MyComponent } from '../MyComponent';

describe('MyComponent', () => {
  const defaultProps = {
    items: [{ id: '1', name: 'Item 1' }],
    onSelect: vi.fn(),
  };

  it('should render items', () => {
    render(<MyComponent {...defaultProps} />);
    expect(screen.getByText('Item 1')).toBeInTheDocument();
  });

  it('should call onSelect when clicked', () => {
    render(<MyComponent {...defaultProps} />);
    fireEvent.click(screen.getByText('Item 1'));
    expect(defaultProps.onSelect).toHaveBeenCalledWith(defaultProps.items[0]);
  });

  it('should show empty state when no items', () => {
    render(<MyComponent {...defaultProps} items={[]} />);
    expect(screen.getByText('No items found')).toBeInTheDocument();
  });

  it('should filter items on search', () => {
    render(<MyComponent {...defaultProps} />);
    const input = screen.getByPlaceholderText('Search...');
    fireEvent.change(input, { target: { value: 'nonexistent' } });
    expect(screen.queryByText('Item 1')).not.toBeInTheDocument();
  });
});
```

**Query priority** (prefer accessible queries):
1. `getByRole('button', { name: 'Submit' })` — best
2. `getByLabelText('Email')` — form fields
3. `getByPlaceholderText('Search...')` — inputs
4. `getByText('Click me')` — visible text
5. `getByTestId('custom-id')` — last resort

**Use `queryBy*` for asserting absence**:
```typescript
expect(screen.queryByText('Error')).not.toBeInTheDocument();
```

### Hook Tests

```typescript
import { renderHook, act } from '@testing-library/react';
import { useMyHook } from '../useMyHook';

describe('useMyHook', () => {
  it('should initialize with default state', () => {
    const { result } = renderHook(() => useMyHook());
    expect(result.current.value).toBe(0);
  });

  it('should update state on action', () => {
    const { result } = renderHook(() => useMyHook());

    act(() => {
      result.current.increment();
    });

    expect(result.current.value).toBe(1);
  });

  it('should respond to prop changes', () => {
    const { result, rerender } = renderHook(
      (props) => useMyHook(props.initialValue),
      { initialProps: { initialValue: 0 } }
    );

    rerender({ initialValue: 10 });
    expect(result.current.value).toBe(10);
  });

  it('should cleanup on unmount', () => {
    const { unmount } = renderHook(() => useMyHook());
    unmount();
    // Assert cleanup happened (e.g., listeners removed)
  });
});
```

### Context Provider Tests

```typescript
import { render, screen, fireEvent } from '@testing-library/react';

// Create a test consumer component
function TestConsumer() {
  const state = useMyContextState();
  const actions = useMyContextActions();
  return (
    <div>
      <span data-testid="value">{state.value}</span>
      <button onClick={() => actions.update('new')}>Update</button>
    </div>
  );
}

describe('MyContext', () => {
  it('should provide initial state', () => {
    render(
      <MyProvider>
        <TestConsumer />
      </MyProvider>
    );
    expect(screen.getByTestId('value')).toHaveTextContent('initial');
  });

  it('should update state via actions', () => {
    render(
      <MyProvider>
        <TestConsumer />
      </MyProvider>
    );
    fireEvent.click(screen.getByText('Update'));
    expect(screen.getByTestId('value')).toHaveTextContent('new');
  });

  it('should throw when used outside provider', () => {
    // Suppress console.error for expected error
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<TestConsumer />)).toThrow();
    spy.mockRestore();
  });
});
```

### Wrapping with Providers

When a component needs context providers to render:

```typescript
function renderWithProviders(ui: React.ReactElement) {
  return render(
    <ProjectProvider>
      <GenerationProvider>
        {ui}
      </GenerationProvider>
    </ProjectProvider>
  );
}
```

---

## Backend-Specific Patterns

### Pure Function Tests

```typescript
import { describe, it, expect } from 'vitest';
import { parseFiles } from '../parser';

describe('parseFiles', () => {
  it('should parse valid JSON files', () => {
    const input = '{"path":"app.tsx","content":"export default ()=><div/>"}';
    const result = parseFiles(input);
    expect(result).toEqual([{ path: 'app.tsx', content: 'export default ()=><div/>' }]);
  });

  it('should handle malformed JSON gracefully', () => {
    const result = parseFiles('{invalid');
    expect(result).toEqual([]);
  });
});
```

### API Route Tests

```typescript
import { describe, it, expect, vi } from 'vitest';
import { GET } from '../route';

describe('GET /api/health', () => {
  it('should return 200 with status ok', async () => {
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ status: 'ok' });
  });
});
```

### Async Operations with Retry Logic

```typescript
describe('executeWithRetry', () => {
  it('should retry on failure and succeed', async () => {
    const operation = vi.fn()
      .mockRejectedValueOnce(new Error('Timeout'))
      .mockResolvedValue({ content: 'Success' });

    vi.useFakeTimers();
    const promise = executeWithRetry(operation, { maxRetries: 3 });
    await vi.runAllTimersAsync();
    vi.useRealTimers();

    const result = await promise;
    expect(result).toEqual({ content: 'Success' });
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('should exhaust retries and throw', async () => {
    const operation = vi.fn().mockRejectedValue(new Error('Permanent failure'));

    vi.useFakeTimers();
    const promise = executeWithRetry(operation, { maxRetries: 2 });
    await vi.runAllTimersAsync();
    vi.useRealTimers();

    await expect(promise).rejects.toThrow('Permanent failure');
    expect(operation).toHaveBeenCalledTimes(3); // initial + 2 retries
  });
});
```

### Streaming / SSE Tests

```typescript
describe('SSE stream processing', () => {
  it('should parse SSE events from stream', async () => {
    const events: string[] = [];
    const stream = createMockSSEStream([
      'data: {"type":"file","path":"app.tsx"}\n\n',
      'data: {"type":"done"}\n\n',
    ]);

    await processStream(stream, (event) => events.push(event.type));

    expect(events).toEqual(['file', 'done']);
  });
});
```

### Performance Tests

```typescript
describe('performance', () => {
  it('should parse 10MB input in under 100ms', () => {
    const largeInput = generateLargeInput(10_000_000); // 10MB

    const start = performance.now();
    const result = parse(largeInput);
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(100);
    expect(result).toHaveLength(expectedCount);
  });

  it('should scale linearly with input size', () => {
    const small = measureTime(() => parse(generateInput(1000)));
    const large = measureTime(() => parse(generateInput(10000)));

    // Should be ~10x, allow 15x for variance
    expect(large / small).toBeLessThan(15);
  });
});
```

---

## Validation & Zod Schema Tests

```typescript
import { mySchema } from '@/shared/schemas';

describe('mySchema', () => {
  it('should accept valid input', () => {
    const result = mySchema.safeParse({ name: 'test', count: 5 });
    expect(result.success).toBe(true);
  });

  it('should reject missing required fields', () => {
    const result = mySchema.safeParse({});
    expect(result.success).toBe(false);
    expect(result.error?.issues).toContainEqual(
      expect.objectContaining({ path: ['name'] })
    );
  });

  it('should reject values exceeding max constraints', () => {
    const result = mySchema.safeParse({ name: 'a'.repeat(1000) });
    expect(result.success).toBe(false);
  });
});
```

---

## Rules

1. **One concern per test** — each `it()` block tests one behavior
2. **Descriptive names** — `it('should return empty array when input is null')` not `it('works')`
3. **No test interdependence** — tests must pass in any order; use `beforeEach` for setup
4. **Clean up** — restore mocks, timers, and spies in `afterEach`
5. **No real network calls** — mock all HTTP/API/database calls
6. **No real file system** — mock `fs` operations in backend tests
7. **Prefer `screen` queries over container queries** — for frontend tests
8. **Use `vi.mocked()` for type-safe mock access** — not raw type casting
9. **Test behavior, not implementation** — assert outcomes, not internal method calls (unless testing integration points)
10. **Keep tests fast** — each test file should complete in under 5 seconds

## Coverage Expectations

- **Backend utilities/core**: 80%+ line coverage
- **Frontend components**: 60%+ (configured threshold)
- **Shared schemas/types**: 90%+
- **Priority**: Cover error paths and edge cases over trivial happy paths

## Running Tests

```bash
# All tests
npm test

# Single workspace
npm run test --workspace=frontend
npm run test --workspace=@ai-app-builder/backend

# Single file
npx vitest run path/to/file.test.ts

# Watch mode
npx vitest path/to/file.test.ts

# With coverage
npx vitest run --coverage
```

## Checklist Before Submitting Tests

- [ ] All tests pass (`npm test`)
- [ ] No `console.log` left in test files (mock console if needed)
- [ ] Mocks are cleared in `beforeEach` (`vi.clearAllMocks()`)
- [ ] Fake timers are restored in `afterEach` (`vi.useRealTimers()`)
- [ ] No hardcoded timeouts/sleeps — use fake timers
- [ ] Edge cases covered (empty, null, large, malformed inputs)
- [ ] Error paths tested (rejected promises, thrown errors)
- [ ] Async tests properly awaited (no floating promises)
- [ ] Test descriptions read as sentences: `it('should ...')`
