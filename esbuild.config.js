import * as esbuild from 'esbuild';
import fs from 'fs';

// Development build configuration
const devConfig = {
    entryPoints: ['src/translator-app.ts'],
    bundle: true,
    outfile: 'translator.bundle.js',
    format: 'iife',
    globalName: 'TranslatorApp',
    platform: 'browser',
    target: ['es2020'],
    sourcemap: true,
    loader: {
        '.ts': 'ts',
    },
    define: {
        'process.env.NODE_ENV': '"development"'
    },
    banner: {
        js: '/* LLM Translator - Development Build */',
    },
};

// Production build configuration
const prodConfig = {
    ...devConfig,
    outfile: 'translator.min.js',
    minify: true,
    sourcemap: false,
    define: {
        'process.env.NODE_ENV': '"production"'
    },
    banner: {
        js: '/* LLM Translator - Production Build */',
    },
};

// Build function
async function build() {
    try {
        console.log('🔨 Building development bundle...');
        const devResult = await esbuild.build(devConfig);
        
        const devStats = fs.statSync('translator.bundle.js');
        console.log(`✅ Development build complete: ${(devStats.size / 1024).toFixed(2)} KB`);
        
        console.log('\n🔨 Building production bundle...');
        const prodResult = await esbuild.build(prodConfig);
        
        const prodStats = fs.statSync('translator.min.js');
        console.log(`✅ Production build complete: ${(prodStats.size / 1024).toFixed(2)} KB`);
        
        const reduction = ((1 - prodStats.size / devStats.size) * 100).toFixed(2);
        console.log(`\n📊 Size reduction: ${reduction}%`);
        
    } catch (error) {
        console.error('❌ Build failed:', error);
        process.exit(1);
    }
}

// Watch mode for development
async function watch() {
    const ctx = await esbuild.context(devConfig);
    await ctx.watch();
    console.log('👀 Watching for changes...');
}

// Check command line arguments
const isWatch = process.argv.includes('--watch') || process.argv.includes('-w');

if (isWatch) {
    watch();
} else {
    build();
}