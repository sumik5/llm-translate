#!/usr/bin/env node

/**
 * Build script to bundle and minify JavaScript files
 */

const fs = require('fs');
const path = require('path');
const { minify } = require('terser');

// Define the order of JavaScript files to bundle
const jsFiles = [
    // Core utilities and constants
    'js/constants.js',
    'js/base-file-processor.js',
    
    // Services and managers
    'js/config-manager.js',
    'js/dom-controller.js',
    'js/state-manager.js',
    'js/html-generator.js',
    'js/ui-manager.js',
    'js/api-client.js',
    
    // Processors
    'js/markdown-processor.js',
    'js/text-processor.js',
    'js/epub-processor.js',
    'js/pdf-processor.js',
    'js/file-processor.js',
    
    // Translation service
    'js/translation-service.js',
    
    // Main app
    'js/translator-app.js'
];

async function build() {
    console.log('Starting build process...');
    
    try {
        // Read and combine all JavaScript files
        let combinedCode = '';
        const moduleExports = new Set();
        const moduleImports = new Set();
        
        for (const file of jsFiles) {
            console.log(`Processing ${file}...`);
            let content = fs.readFileSync(path.join(__dirname, file), 'utf8');
            
            // Remove import statements - they're not needed in bundled version
            content = content.replace(/^import\s+(?:{[^}]+}|[\w\s,]+)\s+from\s+['"][^'"]+['"];?\s*$/gm, '');
            
            // Remove export statements but keep the code
            content = content.replace(/^export\s+default\s+(\w+);?\s*$/gm, '');
            content = content.replace(/^export\s+{([^}]+)};?\s*$/gm, '');
            content = content.replace(/^export\s+(const|let|var|class|function)\s+(\w+)/gm, '$1 $2');
            
            combinedCode += `\n// ========== ${file} ==========\n`;
            combinedCode += content;
            combinedCode += '\n';
        }
        
        // Wrap in IIFE but expose necessary classes to window
        const wrappedCode = `(function() {
    'use strict';
    
    ${combinedCode}
    
    // Expose necessary classes to window for debugging and inter-module dependencies
    window.FileProcessor = FileProcessor;
    window.EPUBProcessor = EPUBProcessor;
    window.PDFProcessor = PDFProcessor;
    window.TextProcessor = TextProcessor;
    window.MarkdownProcessor = MarkdownProcessor;
    
    // Initialize the app when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            window.translatorApp = new TranslatorApp();
        });
    } else {
        window.translatorApp = new TranslatorApp();
    }
})();`;
        
        // Write the combined file
        const outputPath = path.join(__dirname, 'translator.bundle.js');
        fs.writeFileSync(outputPath, wrappedCode);
        console.log(`Combined JavaScript written to ${outputPath}`);
        
        // Minify the code
        console.log('Minifying code...');
        const minified = await minify(wrappedCode, {
            compress: {
                drop_console: false, // Keep console for debugging
                drop_debugger: true,
                passes: 2
            },
            mangle: {
                reserved: ['JSZip', 'pdfjsLib', 'marked', 'Prism'] // External libraries
            },
            format: {
                comments: false
            }
        });
        
        if (minified.error) {
            throw minified.error;
        }
        
        // Write minified file
        const minPath = path.join(__dirname, 'translator.min.js');
        fs.writeFileSync(minPath, minified.code);
        console.log(`Minified JavaScript written to ${minPath}`);
        
        // Show file sizes
        const originalSize = Buffer.byteLength(wrappedCode, 'utf8');
        const minifiedSize = Buffer.byteLength(minified.code, 'utf8');
        const reduction = ((1 - minifiedSize / originalSize) * 100).toFixed(2);
        
        console.log(`\nBuild complete!`);
        console.log(`Original size: ${(originalSize / 1024).toFixed(2)} KB`);
        console.log(`Minified size: ${(minifiedSize / 1024).toFixed(2)} KB`);
        console.log(`Size reduction: ${reduction}%`);
        
    } catch (error) {
        console.error('Build failed:', error);
        process.exit(1);
    }
}

// Run the build
build();