import { defineConfig } from 'tsup';

export default defineConfig({
    entry: {
        'index': 'src/index.ts',
        'types': 'src/types/index.ts',
        'schemas': 'src/schemas/api.ts',
        'utils': 'src/utils/index.ts',
    },
    format: ['cjs', 'esm'],
    dts: true,
    tsconfig: './tsconfig.json',
    splitting: true,
    sourcemap: process.env.NODE_ENV !== 'production',
    clean: true,
});
