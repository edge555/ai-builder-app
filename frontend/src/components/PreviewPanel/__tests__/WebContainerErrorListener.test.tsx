import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { WebContainerErrorListener } from '../WebContainerErrorListener';

const captureBundlerError = vi.fn();
const clearErrors = vi.fn();

vi.mock('@/hooks/useErrorMonitor', () => ({
  useErrorMonitor: vi.fn(() => ({
    captureBundlerError,
    clearErrors,
  })),
}));

describe('WebContainerErrorListener', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    captureBundlerError.mockReset();
    clearErrors.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('ignores non-fatal terminal noise from the dev server', async () => {
    render(
      <WebContainerErrorListener
        serverOutput={'npm WARN deprecated package\n[vite] ready in 120ms\n'}
        installOutput=""
      />,
    );

    await vi.advanceTimersByTimeAsync(1600);
    expect(captureBundlerError).not.toHaveBeenCalled();
  });

  it('captures recognized fatal server failures only', async () => {
    render(
      <WebContainerErrorListener
        serverOutput={'Failed to compile\nModule not found: Cannot find module \'react-chartjs-2\'\n'}
        installOutput=""
      />,
    );

    await vi.advanceTimersByTimeAsync(1600);
    expect(captureBundlerError).toHaveBeenCalledWith(
      expect.stringContaining('Failed to compile'),
    );
  });

  it('captures fatal install failures but ignores warnings', () => {
    const { rerender } = render(
      <WebContainerErrorListener
        serverOutput=""
        installOutput={'npm WARN deprecated old-package\n'}
      />,
    );

    expect(captureBundlerError).not.toHaveBeenCalled();

    rerender(
      <WebContainerErrorListener
        serverOutput=""
        installOutput={'npm WARN deprecated old-package\nnpm ERR! code ERESOLVE\nnpm ERR! unable to resolve dependency tree\n'}
      />,
    );

    expect(captureBundlerError).toHaveBeenCalledWith(
      expect.stringContaining('npm ERR! code ERESOLVE'),
    );
  });
});
