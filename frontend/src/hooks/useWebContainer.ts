import { useEffect, useRef, useState, useCallback } from 'react';
import { WebContainer } from '@webcontainer/api';
import { buildWebContainerFileTree, detectDevScript } from '../utils/webcontainer-file-tree';

export type WebContainerPhase =
  | 'idle'
  | 'booting'
  | 'mounting'
  | 'installing'
  | 'starting'
  | 'ready'
  | 'error';

export interface UseWebContainerReturn {
  phase: WebContainerPhase;
  previewUrl: string | null;
  bootError: string | null;
  installOutput: string;
  serverOutput: string;
  terminalLines: string[];
  refresh: () => Promise<void>;
  updateFiles: (files: Record<string, string>) => Promise<void>;
}

// Module-level singleton — WebContainer boots once per page
let wcInstance: WebContainer | null = null;
let wcBootPromise: Promise<WebContainer> | null = null;

async function getWebContainerInstance(): Promise<WebContainer> {
  if (wcInstance) return wcInstance;
  if (wcBootPromise) return wcBootPromise;
  wcBootPromise = WebContainer.boot().then(instance => {
    wcInstance = instance;
    return instance;
  });
  return wcBootPromise;
}

/**
 * Compute a signature for a set of files to detect major vs minor changes.
 * Uses sorted keys + content lengths to avoid hashing full content.
 */
function computeFilesSignature(files: Record<string, string>): string {
  const keys = Object.keys(files).sort();
  return keys.map(k => `${k}:${files[k].length}`).join('|');
}

/**
 * Determine which files changed between two file maps.
 */
function diffFiles(
  prev: Record<string, string>,
  next: Record<string, string>
): string[] {
  const changed: string[] = [];
  for (const [path, content] of Object.entries(next)) {
    if (prev[path] !== content) {
      changed.push(path);
    }
  }
  return changed;
}

/**
 * Hook that manages the full WebContainer lifecycle.
 * - Boots a singleton WebContainer instance (once per app session)
 * - Mounts files when project changes
 * - Runs npm install then npm run dev
 * - Exposes previewUrl, phase, error, terminal output
 * - Provides updateFiles() for incremental file writes
 * - Provides refresh() to restart the dev server
 */
export function useWebContainer(files: Record<string, string> | null): UseWebContainerReturn {
  const [phase, setPhase] = useState<WebContainerPhase>('idle');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);
  const [installOutput, setInstallOutput] = useState('');
  const [serverOutput, setServerOutput] = useState('');
  const [terminalLines, setTerminalLines] = useState<string[]>([]);

  const instanceRef = useRef<WebContainer | null>(null);
  const serverProcessRef = useRef<Awaited<ReturnType<WebContainer['spawn']>> | null>(null);
  const abortRef = useRef(false);
  const prevFilesRef = useRef<Record<string, string> | null>(null);
  const prevSignatureRef = useRef<string | null>(null);
  const currentFilesRef = useRef<Record<string, string> | null>(files);

  // Keep currentFilesRef in sync
  useEffect(() => {
    currentFilesRef.current = files;
  }, [files]);

  const appendTerminalLine = useCallback((line: string) => {
    setTerminalLines(prev => [...prev.slice(-200), line]);
  }, []);

  const killServer = useCallback(async () => {
    if (serverProcessRef.current) {
      try {
        serverProcessRef.current.kill();
      } catch {
        // ignore
      }
      serverProcessRef.current = null;
    }
  }, []);

  const startDevServer = useCallback(async (instance: WebContainer, fileMap: Record<string, string>) => {
    if (abortRef.current) return;

    setPhase('starting');
    const devScript = detectDevScript(fileMap);

    const serverProcess = await instance.spawn('npm', ['run', devScript]);
    serverProcessRef.current = serverProcess;

    // Collect stdout
    serverProcess.output.pipeTo(new WritableStream({
      write(chunk: string) {
        setServerOutput(prev => prev + chunk);
        appendTerminalLine(chunk);
      }
    }));

    // Listen for server-ready event
    instance.on('server-ready', (_port, url) => {
      if (!abortRef.current) {
        setPreviewUrl(url);
        setPhase('ready');
      }
    });
  }, [appendTerminalLine]);

  const mountAndStart = useCallback(async (instance: WebContainer, fileMap: Record<string, string>) => {
    if (abortRef.current) return;

    // Mount files
    setPhase('mounting');
    const fileTree = buildWebContainerFileTree(fileMap);
    await instance.mount(fileTree);

    if (abortRef.current) return;

    // Check for package.json and run install
    const hasPkg = 'package.json' in fileMap || '/package.json' in fileMap;
    if (hasPkg) {
      setPhase('installing');
      setInstallOutput('');
      appendTerminalLine('Running npm install...');

      const installProcess = await instance.spawn('npm', ['install']);

      await new Promise<void>((resolve) => {
        installProcess.output.pipeTo(new WritableStream({
          write(chunk: string) {
            setInstallOutput(prev => prev + chunk);
            appendTerminalLine(chunk);
          },
          close() {
            resolve();
          }
        }));
      });

      const exitCode = await installProcess.exit;
      if (exitCode !== 0 && !abortRef.current) {
        setPhase('error');
        setBootError(`npm install failed with exit code ${exitCode}`);
        return;
      }
    }

    if (abortRef.current) return;

    await startDevServer(instance, fileMap);
  }, [appendTerminalLine, startDevServer]);

  const refresh = useCallback(async () => {
    const instance = instanceRef.current;
    const fileMap = currentFilesRef.current;
    if (!instance || !fileMap) return;

    await killServer();
    setPreviewUrl(null);
    setServerOutput('');
    await startDevServer(instance, fileMap);
  }, [killServer, startDevServer]);

  const updateFiles = useCallback(async (updatedFiles: Record<string, string>) => {
    const instance = instanceRef.current;
    if (!instance) return;

    for (const [path, content] of Object.entries(updatedFiles)) {
      const normalizedPath = path.startsWith('/') ? path : `/${path}`;
      try {
        await instance.fs.writeFile(normalizedPath, content);
      } catch {
        // Directory may not exist — try to create path
        const parts = normalizedPath.split('/');
        const dir = parts.slice(0, -1).join('/') || '/';
        try {
          await instance.fs.mkdir(dir, { recursive: true });
          await instance.fs.writeFile(normalizedPath, content);
        } catch {
          // ignore write failures for individual files
        }
      }
    }
  }, []);

  // Main effect: boot and lifecycle management
  useEffect(() => {
    if (!files || Object.keys(files).length === 0) {
      setPhase('idle');
      return;
    }

    const signature = computeFilesSignature(files);
    const prevSignature = prevSignatureRef.current;

    // Detect if this is a minor update (same structure, ≤5 files changed)
    if (
      instanceRef.current &&
      prevSignature !== null &&
      prevFilesRef.current !== null &&
      phase === 'ready'
    ) {
      const prevKeys = Object.keys(prevFilesRef.current).sort().join('|');
      const nextKeys = Object.keys(files).sort().join('|');

      if (prevKeys === nextKeys) {
        // Same file set — check how many changed
        const changed = diffFiles(prevFilesRef.current, files);
        if (changed.length > 0 && changed.length <= 5) {
          // Minor update: write files in place (HMR picks them up)
          prevFilesRef.current = files;
          prevSignatureRef.current = signature;
          const changedMap: Record<string, string> = {};
          for (const path of changed) {
            changedMap[path] = files[path];
          }
          void updateFiles(changedMap);
          return;
        }
      }
    }

    // Major change: full remount
    abortRef.current = false;
    prevFilesRef.current = files;
    prevSignatureRef.current = signature;

    setPhase('booting');
    setPreviewUrl(null);
    setBootError(null);
    setInstallOutput('');
    setServerOutput('');
    setTerminalLines([]);

    let didAbort = false;

    (async () => {
      try {
        const instance = await getWebContainerInstance();
        if (didAbort || abortRef.current) return;

        instanceRef.current = instance;

        // Kill any existing server before remounting
        await killServer();
        if (didAbort || abortRef.current) return;

        await mountAndStart(instance, files);
      } catch (err) {
        if (!didAbort && !abortRef.current) {
          setPhase('error');
          setBootError(err instanceof Error ? err.message : String(err));
        }
      }
    })();

    return () => {
      didAbort = true;
      abortRef.current = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files]);

  return {
    phase,
    previewUrl,
    bootError,
    installOutput,
    serverOutput,
    terminalLines,
    refresh,
    updateFiles,
  };
}
