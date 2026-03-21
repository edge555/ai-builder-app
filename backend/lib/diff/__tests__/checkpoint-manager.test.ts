import { describe, it, expect } from 'vitest';
import { CheckpointManager } from '../checkpoint-manager';

describe('CheckpointManager', () => {
  it('should capture and rollback a single file', () => {
    const mgr = new CheckpointManager();
    const files = {
      'src/App.tsx': 'original app content',
      'src/utils.ts': 'original utils content',
    };

    mgr.capture(files, ['src/App.tsx']);

    expect(mgr.rollback('src/App.tsx')).toBe('original app content');
  });

  it('should return null for uncaptured file', () => {
    const mgr = new CheckpointManager();
    const files = {
      'src/App.tsx': 'original app content',
    };

    mgr.capture(files, ['src/App.tsx']);

    expect(mgr.rollback('src/other.tsx')).toBeNull();
  });

  it('should return null when nothing captured', () => {
    const mgr = new CheckpointManager();
    expect(mgr.rollback('src/anything.ts')).toBeNull();
  });

  it('should rollbackAll with correct state', () => {
    const mgr = new CheckpointManager();
    const files = {
      'src/App.tsx': 'app content',
      'src/utils.ts': 'utils content',
      'src/types.ts': 'types content',
    };

    mgr.capture(files, ['src/App.tsx', 'src/utils.ts']);

    const all = mgr.rollbackAll();
    expect(all).toEqual({
      'src/App.tsx': 'app content',
      'src/utils.ts': 'utils content',
    });
    // types.ts was not captured
    expect(all['src/types.ts']).toBeUndefined();
  });

  it('should rollbackAll return a copy (not a reference)', () => {
    const mgr = new CheckpointManager();
    mgr.capture({ 'a.ts': 'content' }, ['a.ts']);

    const copy1 = mgr.rollbackAll();
    copy1['a.ts'] = 'mutated';

    // Original should be unchanged
    expect(mgr.rollback('a.ts')).toBe('content');
  });

  it('should skip files not present in source', () => {
    const mgr = new CheckpointManager();
    const files = { 'src/App.tsx': 'content' };

    mgr.capture(files, ['src/App.tsx', 'src/missing.ts']);

    expect(mgr.has('src/App.tsx')).toBe(true);
    expect(mgr.has('src/missing.ts')).toBe(false);
  });

  it('should report has() correctly', () => {
    const mgr = new CheckpointManager();
    mgr.capture({ 'a.ts': 'x' }, ['a.ts']);

    expect(mgr.has('a.ts')).toBe(true);
    expect(mgr.has('b.ts')).toBe(false);
  });
});
