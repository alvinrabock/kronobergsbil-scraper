import fs from 'fs';
import path from 'path';

const LOG_DIR = path.join(process.cwd(), 'logs');
const LOG_FILE = path.join(LOG_DIR, `scrape-debug-${new Date().toISOString().split('T')[0]}.log`);

// Ensure logs directory exists
if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
}

export function debugLog(...args: any[]) {
    const timestamp = new Date().toISOString();
    const message = `[${timestamp}] ${args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
    ).join(' ')}\n`;
    
    // Write to file
    fs.appendFileSync(LOG_FILE, message);
    
    // Also write to console
    console.log(...args);
}

export function clearDebugLog() {
    if (fs.existsSync(LOG_FILE)) {
        fs.writeFileSync(LOG_FILE, `=== Debug Log Started at ${new Date().toISOString()} ===\n`);
    }
}

export function getLogFilePath() {
    return LOG_FILE;
}