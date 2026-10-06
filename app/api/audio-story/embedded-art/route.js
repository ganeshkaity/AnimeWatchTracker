import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import { resolveMedia } from '../../../lib/mediaRegistry';

export const dynamic = 'force-dynamic';

/**
 * GET /api/audio-story/embedded-art
 * Extracts the embedded album/cover art from an audio (or video) file using ffmpeg.
 * Query params:
 *   - mediaId  (preferred) - a registered mediaId resolved via mediaRegistry
 *   - path     (fallback)  - direct file path on the server
 *
 * Returns: image/jpeg  (with Cache-Control: public, max-age=86400)
 * Returns: 404 if no embedded art is found or file doesn't exist
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const mediaId = searchParams.get('mediaId');
    const rawPath = searchParams.get('path');

    let filePath = null;

    // 1. Resolve via mediaId (preferred — safe, server-side only)
    if (mediaId) {
      const resolved = resolveMedia(mediaId);
      if (resolved?.filePath) {
        filePath = resolved.filePath;
      }
    }

    // 2. Fallback to direct path param
    if (!filePath && rawPath) {
      filePath = rawPath;
    }

    if (!filePath) {
      return NextResponse.json({ error: 'No file path provided' }, { status: 400 });
    }

    // Extract embedded image using ffmpeg piped to stdout
    const imageBuffer = await extractEmbeddedArt(filePath);

    if (!imageBuffer || imageBuffer.length === 0) {
      return new NextResponse(null, { status: 404 });
    }

    return new NextResponse(imageBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'public, max-age=86400',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (err) {
    console.error('[embedded-art] Error:', err);
    return new NextResponse(null, { status: 404 });
  }
}

/**
 * Use ffmpeg to pull the first video/image stream (embedded art) from an audio file.
 * Returns a Buffer of JPEG bytes, or null if no art found.
 */
function extractEmbeddedArt(filePath) {
  return new Promise((resolve) => {
    const chunks = [];

    // -map 0:v:0 selects first video stream (album art in MP3/FLAC/M4A)
    // -frames:v 1 extracts just one frame
    // -c:v mjpeg -f image2 pipe:1 pipes JPEG to stdout
    const args = [
      '-v', 'error',
      '-i', filePath,
      '-map', '0:v:0',
      '-frames:v', '1',
      '-c:v', 'mjpeg',
      '-f', 'image2',
      'pipe:1',
    ];

    const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });

    proc.stdout.on('data', (chunk) => {
      chunks.push(chunk);
    });

    proc.on('close', (code) => {
      if (code === 0 && chunks.length > 0) {
        resolve(Buffer.concat(chunks));
      } else {
        resolve(null);
      }
    });

    proc.on('error', () => {
      resolve(null);
    });

    // Timeout safety — 8 seconds
    setTimeout(() => {
      try { proc.kill('SIGKILL'); } catch {}
      resolve(null);
    }, 8000);
  });
}
