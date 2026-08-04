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
      const { targetPath } = body;
      if (!targetPath || !fs.existsSync(targetPath)) {
        return NextResponse.json({ success: false, error: 'Target path does not exist' }, { status: 400 });
      }
      fs.rmSync(targetPath, { recursive: true, force: true });
      return NextResponse.json({ success: true, message: 'Deleted successfully' });
    }

    if (action === 'rename') {
      const { oldPath, newName } = body;
      if (!oldPath || !fs.existsSync(oldPath)) {
        return NextResponse.json({ success: false, error: 'Original item does not exist' }, { status: 400 });
      }
      const parentDir = path.dirname(oldPath);
      const newPath = path.join(parentDir, newName);
      if (fs.existsSync(newPath)) {
        return NextResponse.json({ success: false, error: 'An item with that name already exists' }, { status: 400 });
      }
      fs.renameSync(oldPath, newPath);
      return NextResponse.json({ success: true, newPath, message: 'Renamed successfully' });
    }

    if (action === 'createFolder') {
      const { parentPath, folderName } = body;
      if (!parentPath || !fs.existsSync(parentPath)) {
        return NextResponse.json({ success: false, error: 'Parent directory does not exist' }, { status: 400 });
      }
      const newFolderPath = path.join(parentPath, folderName);
      if (fs.existsSync(newFolderPath)) {
        return NextResponse.json({ success: false, error: 'Folder already exists' }, { status: 400 });
      }
      fs.mkdirSync(newFolderPath, { recursive: true });
      return NextResponse.json({ success: true, newFolderPath, message: 'Folder created successfully' });
    }

    if (action === 'move') {
      const { sourcePath, destFolderPath } = body;
      if (!sourcePath || !fs.existsSync(sourcePath)) {
        return NextResponse.json({ success: false, error: 'Source file does not exist' }, { status: 400 });
      }
      if (!destFolderPath || !fs.existsSync(destFolderPath)) {
        return NextResponse.json({ success: false, error: 'Destination directory does not exist' }, { status: 400 });
      }
      const targetPath = path.join(destFolderPath, path.basename(sourcePath));
      if (fs.existsSync(targetPath)) {
        return NextResponse.json({ success: false, error: 'A file with that name already exists in destination' }, { status: 400 });
      }
      fs.renameSync(sourcePath, targetPath);
      return NextResponse.json({ success: true, targetPath, message: 'Moved successfully' });
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
