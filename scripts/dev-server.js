#!/usr/bin/env node

import { spawn, execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import process from 'process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

let httpServer = null;
let watchProcess = null;

// Clean up function
function cleanup() {
    console.log('\n🛑 Stopping development server...');
    
    if (httpServer) {
        httpServer.kill('SIGTERM');
        httpServer = null;
    }
    
    if (watchProcess) {
        watchProcess.kill('SIGTERM');
        watchProcess = null;
    }
    
    // Kill any remaining Python http.server processes
    try {
        if (process.platform === 'darwin' || process.platform === 'linux') {
            execSync('pkill -f "python3 -m http.server 8000" 2>/dev/null || true', { shell: true });
        }
    } catch (e) {
        // Ignore errors
    }
    
    console.log('✅ Development server stopped');
    process.exit(0);
}

// Set up signal handlers
process.on('SIGINT', cleanup);  // Ctrl+C
process.on('SIGTERM', cleanup); // Kill command
process.on('exit', cleanup);    // Normal exit

// Start HTTP server
console.log('🚀 Starting HTTP server on http://localhost:8000');
httpServer = spawn('python3', ['-m', 'http.server', '8000'], {
    cwd: projectRoot,
    stdio: 'inherit'
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