import { NextRequest, NextResponse } from 'next/server';
import { getLogFilePath } from '../../../lib/debug-logger';
import fs from 'fs';

export async function GET(request: NextRequest) {
    try {
        const logFilePath = getLogFilePath();
        
        if (!fs.existsSync(logFilePath)) {
            return NextResponse.json({ error: 'Log file not found' }, { status: 404 });
        }
        
        const logContent = fs.readFileSync(logFilePath, 'utf-8');
        const lines = logContent.split('\n');
        
        // Get last N lines if requested
        const url = new URL(request.url);
        const tailLines = parseInt(url.searchParams.get('tail') || '100');
        
        const content = tailLines > 0 ? lines.slice(-tailLines).join('\n') : logContent;
        
        return NextResponse.json({ 
            logFilePath,
            totalLines: lines.length,
            showingLines: tailLines > 0 ? Math.min(tailLines, lines.length) : lines.length,
            content 
        });
    } catch (error) {
        return NextResponse.json({ 
            error: 'Failed to read log file', 
            details: error instanceof Error ? error.message : 'Unknown error' 
        }, { status: 500 });
    }
}