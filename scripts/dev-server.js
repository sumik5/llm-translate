#!/usr/bin/env node

import { spawn, execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createServer } from 'http';
import { readFile, stat } from 'fs/promises';
import { extname } from 'path';
import process from 'process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

let httpServer = null;
let watchProcess = null;

// MIME types
const mimeTypes = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
};

// Clean up function
function cleanup() {
    console.log('\n🛑 Stopping development server...');
    
    if (httpServer) {
        httpServer.close();
        httpServer = null;
    }
    
    if (watchProcess) {
        watchProcess.kill('SIGTERM');
        watchProcess = null;
    }
    
    console.log('✅ Development server stopped');
    process.exit(0);
}

// Set up signal handlers
process.on('SIGINT', cleanup);  // Ctrl+C
process.on('SIGTERM', cleanup); // Kill command
process.on('exit', cleanup);    // Normal exit

// Create HTTP server with no-cache headers
httpServer = createServer(async (req, res) => {
    try {
        let filePath = req.url === '/' ? '/translator.html' : req.url;
        
        console.log(`📥 Request: ${req.url} -> ${filePath}`);
        
        // Remove query parameters for file lookup
        filePath = filePath.split('?')[0];
        
        const fullPath = join(projectRoot, filePath);
        const ext = extname(filePath);
        
        const fileStats = await stat(fullPath);
        const fileContent = await readFile(fullPath);
        
        // Set aggressive no-cache headers for development
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        res.setHeader('Last-Modified', new Date().toUTCString());
        res.setHeader('ETag', Math.random().toString(36));
        
        // Set content type
        const mimeType = mimeTypes[ext] || 'application/octet-stream';
        res.setHeader('Content-Type', mimeType);
        
        console.log(`✅ Served: ${filePath} (${fileContent.length} bytes)`);
        
        res.writeHead(200);
        res.end(fileContent);
        
    } catch (error) {
        console.log(`❌ Not found: ${req.url}`);
        res.writeHead(404);
        res.end('File not found');
    }
});

// Start HTTP server
console.log('🚀 Starting HTTP server on http://localhost:8000');
httpServer.listen(8000, () => {
    console.log('✅ HTTP server started');
});

// Start file watcher
console.log('👀 Starting file watcher...');
watchProcess = spawn('npm', ['run', 'dev'], {
    cwd: projectRoot,
    stdio: 'inherit',
    shell: true
});

// Handle child process errors
httpServer.on('error', (err) => {
    console.error('❌ Failed to start HTTP server:', err);
    cleanup();
});

watchProcess.on('error', (err) => {
    console.error('❌ Failed to start watch process:', err);
    cleanup();
});

console.log('✅ Development environment running');
console.log('📝 Access your app at: http://localhost:8000/translator.html');
console.log('Press Ctrl+C to stop\n');