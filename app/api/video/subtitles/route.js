import { spawn, execSync } from 'child_process';
import fs from 'fs';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Detect subtitle codec and pick best conversion approach
function getSubtitleCodec(filePath, streamIndex) {
  try {
    const result = execSync(
      `ffprobe -v error -select_streams ${streamIndex} -show_entries stream=codec_name -of csv=p=0 "${filePath.replace(/"/g, '\\"')}"`,
      { encoding: 'utf8', timeout: 8000 }
    ).trim().toLowerCase();
    return result;
  } catch {
    return 'unknown';
  }
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const filePath = searchParams.get('path');
    const indexStr = searchParams.get('index');

    if (!filePath || indexStr === null || indexStr === undefined) {
      return NextResponse.json({ success: false, error: 'path and index are required' }, { status: 400 });
    }
    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ success: false, error: 'File not found' }, { status: 404 });
    }

    const index = parseInt(indexStr, 10);
    if (isNaN(index)) {
      return NextResponse.json({ success: false, error: 'Invalid index' }, { status: 400 });
    }

    // Detect codec: ASS/SSA need special handling
    const codec = getSubtitleCodec(filePath, index);
    const isImageBased = ['hdmv_pgs_subtitle', 'dvd_subtitle', 'dvbsub'].includes(codec);

    if (isImageBased) {
      // We cannot convert image-based subs to WebVTT with ffmpeg alone
      return NextResponse.json(
        { success: false, error: `Image-based subtitle codec (${codec}) is not supported for browser rendering.` },
        { status: 422 }
      );
    }

    // For ASS/SSA/SRT/SUBRIP — convert to WebVTT via ffmpeg
    const ffmpegArgs = [
      '-v', 'error',
      '-i', filePath,
      '-map', `0:${index}`,
      '-f', 'webvtt',
      // For ASS, remove style info so text is clean
      ...(codec === 'ass' || codec === 'ssa' ? ['-c:s', 'webvtt'] : []),
      'pipe:1',
    ];

    const ffmpeg = spawn('ffmpeg', ffmpegArgs);

    const chunks = [];
    let stderr = '';

    await new Promise((resolve, reject) => {
      ffmpeg.stdout.on('data', chunk => chunks.push(chunk));
      ffmpeg.stderr.on('data', d => { stderr += d.toString(); });
      ffmpeg.on('close', code => {
        if (code === 0 || chunks.length > 0) resolve();
        else reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-300)}`));
      });
      ffmpeg.on('error', reject);
    });

    const rawVtt = Buffer.concat(chunks).toString('utf8');

    // ── Post-process: strip ASS override tags from text lines ────────────────
    const cleanVtt = rawVtt
      .replace(/\{[^}]*\}/g, '')       // Remove {ASS override tags}
      .replace(/<[^>]+>/g, '')          // Remove <html-style> tags (kept by webvtt filter sometimes)
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/\r\n/g, '\n');

    return new Response(cleanVtt, {
      headers: {
        'Content-Type': 'text/vtt; charset=utf-8',
        'Cache-Control': 'public, max-age=3600',
      },
    });

  } catch (err) {
    console.error('[subtitle route error]', err.message);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
