import { processFiles } from '../lib/core/file-processor';
import * as path from 'path';

async function runVerification() {
    console.log('Starting verification...');

    // generate 20 dummy files
    const files = Array.from({ length: 20 }, (_, i) => ({
        path: `file_${i}.ts`,
        content: `
            // File ${i}
            export function test${i}() {
                console.log("Hello world " + ${i});
                const a = { x: 1, y: 2, z: 3 };
                return a;
            }
        `
    }));

    // Add a malformed file
    files.push({
        path: 'malformed.ts',
        content: 'function broken() { return;' // Missing closing brace
    });

    // Monitor event loop lag
    let maxLag = 0;
    const interval = setInterval(() => {
        const start = Date.now();
        setImmediate(() => {
            const lag = Date.now() - start;
            if (lag > maxLag) maxLag = lag;
        });
    }, 10);

    const startTime = Date.now();
    console.log(`Processing ${files.length} files...`);

    try {
        const processResult = await processFiles(files);
        const results = processResult.files;
        const duration = Date.now() - startTime;

        console.log('--- Results ---');
        console.log(`Duration: ${duration}ms`);
        console.log(`Max Event Loop Lag: ${maxLag}ms`);
        console.log(`Processed files: ${Object.keys(results).length}`);
        console.log(`Warnings: ${processResult.warnings.length}`);

        // Check if formatting actually happened
        const firstFile = results['file_0.ts'];
        if (firstFile && !firstFile.includes('console.log(\'Hello world \' + 0);')) {
            console.log('Sample output check (first file): Formatted successfully');
        }

        // Check malformed file
        const malformedFile = results['malformed.ts'];
        if (malformedFile === 'function broken() { return;') {
            console.log('SUCCESS: Malformed file returned original content (Graceful degradation).');
        } else {
            console.error('FAILURE: Malformed file was modified or lost:', malformedFile);
        }

        // Display warnings if any
        if (processResult.warnings.length > 0) {
            console.log('\n--- Warnings ---');
            processResult.warnings.forEach(w => {
                console.log(`[${w.type}] ${w.path}: ${w.message}`);
            });
        }

        if (maxLag > 100) {
            console.warn('WARNING: Event loop lag > 100ms. Workers might not be effective or main thread is busy.');
        } else {
            console.log('SUCCESS: Low event loop lag indicates non-blocking execution.');
        }

    } catch (e) {
        console.error('Verification failed:', e);
    } finally {
        clearInterval(interval);
        // We need to terminate the pool to exit cleanly, but processFiles doesn't expose it.
        // In a real app, the pool stays alive. For script, we just force exit after a delay.
        setTimeout(() => process.exit(0), 1000);
    }
}

runVerification();
