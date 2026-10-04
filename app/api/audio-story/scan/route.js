import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

const AUDIO_EXTENSIONS = new Set([
  '.mp3', '.m4a', '.aac', '.wav', '.flac', '.ogg', '.opus', '.wma', '.m4b', '.alac', '.aiff'
]);

const VIDEO_EXTENSIONS = new Set([
  '.mp4', '.mkv', '.avi', '.mov', '.webm', '.m4v', '.flv', '.wmv', '.ts'
]);

function parseTrackNumber(filename) {
  if (!filename) return null;
  let clean = String(filename).replace(/\.[a-z0-9]+$/i, '').trim();

  // Strip resolution tags and metadata in brackets
  clean = clean.replace(/\[\d{3,4}p\]/gi, '').replace(/\(\d{3,4}p\)/gi, '');
  clean = clean.replace(/[\(\[]\d{4}[\)\]]/g, '');

  // 1. Explicit Track/Part/Episode keywords: "Track 01", "Part 2", "Episode 03", "Chap 4"
  const kwMatch = clean.match(/(?:track|part|pt|episode|ep|chapter|chap|ch)[\s._-]*(\d+(?:\.\d+)?)/i);
  if (kwMatch) return parseFloat(kwMatch[1]);

  // 2. Word-bounded "t01", "e01"
  const teMatch = clean.match(/(?:^|[\s_\-\[])[te](\d+(?:\.\d+)?)(?:$|[\s_\-\]\.])/i);
  if (teMatch) return parseFloat(teMatch[1]);

  // 3. Leading numbers e.g. "01 - The Beginning", "01.mp3", "[01] Chapter"
  const leadingMatch = clean.match(/^\[?(\d+(?:\.\d+)?)\]?[\s._-]/);
  if (leadingMatch) return parseFloat(leadingMatch[1]);

  // 4. Separator number e.g. "Story Name - 01"
  const sepMatch = clean.match(/[-–—]\s*(\d+(?:\.\d+)?)/);
  if (sepMatch) return parseFloat(sepMatch[1]);

  // 5. Last standalone number in filename
  const allNums = clean.match(/\b(\d+(?:\.\d+)?)\b/g);
  if (allNums && allNums.length > 0) {
    return parseFloat(allNums[allNums.length - 1]);
  }

  return null;
}

function cleanTrackTitle(filename) {
  if (!filename) return 'Untitled Track';
  let title = String(filename).replace(/\.[a-z0-9]+$/i, '').trim();
  // Strip resolution tags like [1080p] or (720p)
  title = title.replace(/\[\d{3,4}p\]/gi, '').replace(/\(\d{3,4}p\)/gi, '').trim();
  // Normalize extra spacing or separators
  title = title.replace(/^[-_\s]+/, '').replace(/[-_\s]+$/, '');
  return title || filename;
}

// Safe recursive directory scanner for audio and video files
function scanAudioStoryDirSafe(dirPath, maxDepth = 4, currentDepth = 0, filesList = []) {
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
        scanAudioStoryDirSafe(fullPath, maxDepth, currentDepth + 1, filesList);
      } else if (stat.isFile()) {
        const ext = path.extname(entry).toLowerCase();
        const isAudio = AUDIO_EXTENSIONS.has(ext);
        const isVideo = VIDEO_EXTENSIONS.has(ext);

        if (isAudio || isVideo) {
          const parsedNum = parseTrackNumber(entry);
          filesList.push({
            name: entry,
            fileName: entry,
            filePath: fullPath,
            size: stat.size,
            trackNumber: parsedNum !== null ? parsedNum : filesList.length + 1,
            episodeNumber: parsedNum !== null ? parsedNum : filesList.length + 1,
            title: cleanTrackTitle(entry),
            ext: ext.replace('.', '').toUpperCase(),
            fileType: isVideo ? 'video' : 'audio',
            isVideo,
            createdAt: stat.birthtimeMs || stat.mtimeMs || Date.now(),
            updatedAt: stat.mtimeMs || Date.now(),
          });
        }
      }
    }
  } catch (err) {
    console.error(`[audio-story/scan] Error scanning ${dirPath}:`, err.message);
  }
  return filesList;
}

export async function POST(request) {
  try {
    let folderPath = null;
    try {
      const body = await request.json();
      folderPath = body?.folderPath;
    } catch {
      try {
        const rawText = await request.text();
        const match = rawText.match(/"folderPath"\s*:\s*"([^"]+)"/);
        if (match) folderPath = match[1].replace(/\\\\/g, '\\');
      } catch {
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
        tracks: [],
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

    const tracks = [];
    scanAudioStoryDirSafe(resolved, 4, 0, tracks);

    // Natural sort: by trackNumber ascending, or by name numeric sort
    tracks.sort((a, b) => {
      if (a.trackNumber !== b.trackNumber) {
        return a.trackNumber - b.trackNumber;
      }
      return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
    });

    // Re-index clean sequential track numbers if there are duplicates
    const audioCount = tracks.filter(t => !t.isVideo).length;
    const videoCount = tracks.filter(t => t.isVideo).length;

    return NextResponse.json({
      success: true,
      folderPath: resolved,
      count: tracks.length,
      audioCount,
      videoCount,
      tracks,
    });
  } catch (err) {
    console.error('[audio-story/scan] API error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
