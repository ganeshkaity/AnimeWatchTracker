import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

function parseChapterNumber(filename) {
  if (!filename) return null;
  let clean = String(filename).replace(/\.(pdf|zip|cbz)$/i, '').trim();

  // Strip resolution tags and year brackets
  clean = clean.replace(/\[\d{3,4}p\]/gi, '').replace(/\(\d{3,4}p\)/gi, '');
  clean = clean.replace(/[\(\[]\d{4}[\)\]]/g, '');

  // 1. Explicit Chapter keywords: Chapter 01, Ch. 12, Chap 5
  const chMatch = clean.match(/(?:chapter|chap|ch)[\s._-]*(\d+(?:\.\d+)?)/i);
  if (chMatch) return parseFloat(chMatch[1]);

  // 2. Volume + Chapter: Vol 1 Ch 2 or v01 c02
  const vcMatch = clean.match(/(?:vol|volume)[\s._-]*\d+[\s._-]*(?:ch|c)[\s._-]*(\d+(?:\.\d+)?)/i);
  if (vcMatch) return parseFloat(vcMatch[1]);

  // 3. Word-bounded "c01", "c.01"
  const cMatch = clean.match(/(?:^|[\s_\-\[])c[\s._-]*(\d+(?:\.\d+)?)(?:$|[\s_\-\]\.])/i);
  if (cMatch) return parseFloat(cMatch[1]);

  // 4. Separator number e.g. "Title - 01"
  const sepMatch = clean.match(/[-–—]\s*(\d+(?:\.\d+)?)/);
  if (sepMatch) return parseFloat(sepMatch[1]);

  // 5. Volume keyword alone: Volume 01, Vol. 2
  const volMatch = clean.match(/(?:volume|vol|v)[\s._-]*(\d+(?:\.\d+)?)/i);
  if (volMatch) return parseFloat(volMatch[1]);

  // 6. Leading numbers e.g. "01 - The Beginning", "01.pdf"
  const leadingMatch = clean.match(/^\[?(\d+(?:\.\d+)?)\]?[\s._-]/);
  if (leadingMatch) return parseFloat(leadingMatch[1]);

  // 7. Last standalone number
  const allNums = clean.match(/\b(\d+(?:\.\d+)?)\b/g);
  if (allNums && allNums.length > 0) {
    return parseFloat(allNums[allNums.length - 1]);
  }

  return null;
}

// Safe recursive directory scanner for PDF files
function scanPdfDirSafe(dirPath, maxDepth = 4, currentDepth = 0, filesList = []) {
  if (currentDepth > maxDepth) return filesList;
  try {
    const entries = fs.readdirSync(dirPath);
    for (const entry of entries) {
      if (
        entry.startsWith('.') ||
        entry === 'node_modules' ||
        entry === '$RECYCLE.BIN' ||
        entry === 'System Volume Information'
      ) {
        continue;
      }

      const fullPath = path.join(dirPath, entry);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        scanPdfDirSafe(fullPath, maxDepth, currentDepth + 1, filesList);
      } else if (stat.isFile()) {
        const ext = path.extname(entry).toLowerCase();
        if (ext === '.pdf') {
          const parsedNum = parseChapterNumber(entry);
          filesList.push({
            name: entry,
            fileName: entry,
            filePath: fullPath,
            size: stat.size,
            chapterNumber: parsedNum !== null ? parsedNum : filesList.length + 1,
            title: entry.replace(/\.pdf$/i, ''),
            createdAt: stat.birthtimeMs || stat.mtimeMs || Date.now(),
            updatedAt: stat.mtimeMs || Date.now(),
          });
        }
      }
    }
  } catch (err) {
    console.error(`[manga/scan] Error scanning ${dirPath}:`, err.message);
  }
  return filesList;
}

export async function POST(request) {
  try {
    let folderPath = null;
    try {
      const body = await request.json();
      folderPath = body?.folderPath;
    } catch (parseErr) {
      try {
        const rawText = await request.text();
        const match = rawText.match(/"folderPath"\s*:\s*"([^"]+)"/);
        if (match) folderPath = match[1].replace(/\\\\/g, '\\');
      } catch (rawErr) {
        // ignore
      }
    }

    if (!folderPath) {
      return NextResponse.json({ success: false, error: 'folderPath is required' }, { status: 400 });
    }

    const resolved = path.resolve(folderPath.trim());

    if (!fs.existsSync(resolved)) {
      return NextResponse.json({
        success: true,
        chapters: [],
        message: 'Directory does not exist on local disk.',
      });
    }

    const stat = fs.statSync(resolved);
    if (!stat.isDirectory()) {
      return NextResponse.json({
        success: false,
        error: 'Path provided is not a directory',
      }, { status: 400 });
    }

    const chapters = [];
    scanPdfDirSafe(resolved, 4, 0, chapters);

    // Natural sort: by chapterNumber ascending, or by filename
    chapters.sort((a, b) => {
      if (a.chapterNumber !== b.chapterNumber) {
        return a.chapterNumber - b.chapterNumber;
      }
      return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
    });

    return NextResponse.json({
      success: true,
      folderPath: resolved,
      count: chapters.length,
      chapters,
    });
  } catch (err) {
    console.error('[manga/scan] API error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
