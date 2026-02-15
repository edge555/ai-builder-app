const { parentPort } = require('worker_threads');
const prettier = require('prettier');

if (!parentPort) {
    throw new Error('This file must be run as a worker thread');
}

const prettierOptions = {
    semi: true,
    singleQuote: true,
    trailingComma: 'es5',
    printWidth: 100,
    tabWidth: 2,
};

function getParserForFile(filePath) {
    const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase();

    if (['.ts', '.tsx'].includes(ext)) return 'typescript';
    if (['.js', '.jsx'].includes(ext)) return 'babel';
    if (['.css', '.scss'].includes(ext)) return 'css';
    if (ext === '.json') return 'json';
    if (ext === '.html') return 'html';
    if (ext === '.md') return 'markdown';

    return undefined;
}

parentPort.on('message', async (message) => {
    const { id, content, filePath } = message;

    try {
        const parser = getParserForFile(filePath);

        if (!parser) {
            parentPort.postMessage({ id, result: content });
            return;
        }

        const formatted = await prettier.format(content, {
            ...prettierOptions,
            parser,
        });

        parentPort.postMessage({ id, result: formatted });
    } catch (error) {
        parentPort.postMessage({
            id,
            error: error.message || String(error),
            result: content, // Return original content on error
        });
    }
});
