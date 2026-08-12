import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

// Helper to recursively list files and directories
function scanDirectory(dirPath, rootPath = dirPath) {
  if (!fs.existsSync(dirPath)) {
    return { name: path.basename(dirPath), isDirectory: true, path: dirPath, relativePath: '', children: [] };
  }

  const stat = fs.statSync(dirPath);
  if (!stat.isDirectory()) {
    return {
      name: path.basename(dirPath),
      isDirectory: false,
      path: dirPath,
      relativePath: path.relative(rootPath, dirPath),
      size: stat.size,
      modifiedTime: stat.mtime
    };
  }

  const items = fs.readdirSync(dirPath);
  const children = [];

  for (const item of items) {
    // Ignore system / hidden folders
    if (item.startsWith('.') || item === '$RECYCLE.BIN' || item === 'System Volume Information') {
      continue;
    }
    const fullPath = path.join(dirPath, item);
    try {
      const itemStat = fs.statSync(fullPath);
      if (itemStat.isDirectory()) {
        children.push({
          name: item,
          isDirectory: true,
          path: fullPath,
          relativePath: path.relative(rootPath, fullPath),
          modifiedTime: itemStat.mtime,
          children: [] // Collapsed by default, loaded lazily or recursively
        });
      } else {
        children.push({
          name: item,
          isDirectory: false,
          path: fullPath,
          relativePath: path.relative(rootPath, fullPath),
          size: itemStat.size,
          modifiedTime: itemStat.mtime,
          extension: path.extname(item).toLowerCase()
        });
      }
    } catch (err) {
      console.error(`Error reading ${fullPath}:`, err);
    }
  }

  // Sort directories first, then files alphabetically
  children.sort((a, b) => {
    if (a.isDirectory && !b.isDirectory) return -1;
    if (!a.isDirectory && b.isDirectory) return 1;
    return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
  });

  return {
    name: path.basename(dirPath),
    isDirectory: true,
    path: dirPath,
    relativePath: path.relative(rootPath, dirPath),
    children
  };
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const folderPath = searchParams.get('path');

    if (!folderPath) {
      return NextResponse.json({ success: false, error: 'Folder path is required' }, { status: 400 });
    }

    if (!fs.existsSync(folderPath)) {
      return NextResponse.json({ success: false, error: `Directory does not exist: ${folderPath}` }, { status: 404 });
    }

    const tree = scanDirectory(folderPath);
    return NextResponse.json({ success: true, tree });
  } catch (error) {
    console.error('Error in GET /api/manage-folder:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { action } = body;

    if (action === 'delete') {
      return NextResponse.json({ success: true, message: 'Firestore episode item marked for deletion (local disk preserved)' });
    }

    if (action === 'rename') {
      const { newName } = body;
      return NextResponse.json({ success: true, message: 'Firestore episode item renamed (local disk preserved)' });
    }

    if (action === 'createFolder') {
      return NextResponse.json({ success: true, message: 'Firestore virtual folder created (local disk preserved)' });
    }

    if (action === 'move') {
      return NextResponse.json({ success: true, message: 'Firestore episode item moved (local disk preserved)' });
    }

    if (action === 'checkFile') {
      const { parentPath, fileName } = body;
      if (!parentPath || !fs.existsSync(parentPath)) {
        return NextResponse.json({ success: false, error: 'Parent directory does not exist' }, { status: 400 });
      }
      const filePath = path.join(parentPath, fileName);
      if (fs.existsSync(filePath)) {
        return NextResponse.json({ success: true, filePath, message: 'File is available in the folder' });
      } else {
        return NextResponse.json({ success: false, error: `There is no file named "${fileName}" available in this folder.` }, { status: 400 });
      }
    }

    return NextResponse.json({ success: false, error: `Invalid action: ${action}` }, { status: 400 });
  } catch (error) {
    console.error('Error in POST /api/manage-folder:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
