// build.config.js

const esbuild = require('esbuild');
const { analyzefile } = require('rollup-plugin-analyze');

esbuild.build({
    entryPoints: ['./src/index.js'],
    outdir: './dist',
    bundle: true,
    minify: true,
    splitting: true,
    format: 'esm', // Use ES Modules for code splitting
    sourcemap: true,
    loader: {
        '.js': 'jsx',
    },
    plugins: [
        analyzefile({
            summaryOnly: true,
        })
    ],
}).catch(() => process.exit(1));