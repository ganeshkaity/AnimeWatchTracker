import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

// Safe recursive directory scanner
function scanDirSafe(dirPath, maxDepth = 3, currentDepth = 0, filesList = []) {
  if (currentDepth > maxDepth) return filesList;
  try {
    const files = fs.readdirSync(dirPath);
    for (const file of files) {
      // Ignore hidden files and system paths
      if (file.startsWith('.') || file === 'node_modules' || file === '$RECYCLE.BIN' || file === 'System Volume Information') {
        continue;
      }
      const filePath = path.join(dirPath, file);
      const stat = fs.statSync(filePath);
      if (stat.isDirectory()) {
        scanDirSafe(filePath, maxDepth, currentDepth + 1, filesList);
      } else {
        const ext = path.extname(file).toLowerCase();
        if (['.mkv', '.mp4', '.avi', '.m4v', '.webm', '.mov', '.mp3'].includes(ext)) {
          filesList.push({
            name: file,
            path: filePath,
            size: stat.size,
            createdAt: stat.birthtimeMs || stat.mtimeMs
          });
        }
      }
    }
  } catch (err) {
    console.error(`Error scanning directory ${dirPath}:`, err.message);
  }
  return filesList;
}

export async function POST(request) {
  try {
    const { folderPath } = await request.json();
    if (!folderPath) {
      return NextResponse.json({ success: false, error: 'folderPath is required' }, { status: 400 });
    }
    
    if (!fs.existsSync(folderPath)) {
      return NextResponse.json({ success: false, error: 'Directory does not exist on this machine' }, { status: 404 });
    }

    const episodes = [];
    scanDirSafe(folderPath, 3, 0, episodes);

    return NextResponse.json({ success: true, episodes });
  } catch (err) {
    console.error("Scanning API error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
