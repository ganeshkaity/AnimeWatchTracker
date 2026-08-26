import { spawn, execSync } from 'child_process';
import fs from 'fs';
import { NextResponse } from 'next/server';
import { resolveMedia, getMediaCorsHeaders } from '../../../lib/mediaRegistry';

export const dynamic = 'force-dynamic';

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

export async function GET(request, { params }) {
  try {
    const mediaId = params?.mediaId;
    const { searchParams } = new URL(request.url);
    const indexStr = searchParams.get('index') || '0';

    if (!mediaId) {
      return NextResponse.json(
        { success: false, error: 'mediaId is required' },
        { status: 400, headers: getMediaCorsHeaders() }
      );
    }

    const resolved = resolveMedia(mediaId);
    if (!resolved || !resolved.filePath || !fs.existsSync(resolved.filePath)) {
      return NextResponse.json(
        { success: false, error: 'Media file not found' },
        { status: 404, headers: getMediaCorsHeaders() }
      );
    }

    const filePath = resolved.filePath;
    const index = parseInt(indexStr, 10);
    if (isNaN(index)) {
      return NextResponse.json(
        { success: false, error: 'Invalid track index' },
        { status: 400, headers: getMediaCorsHeaders() }
      );
    }

    const codec = getSubtitleCodec(filePath, index);
    const isImageBased = ['hdmv_pgs_subtitle', 'dvd_subtitle', 'dvbsub'].includes(codec);

    if (isImageBased) {
      return NextResponse.json(
        { success: false, error: `Image-based subtitle codec (${codec}) is not supported for text rendering.` },
        { status: 422, headers: getMediaCorsHeaders() }
      );
    }

    const ffmpegArgs = [
      '-v', 'error',
      '-i', filePath,
      '-map', `0:${index}`,
      '-c:s', 'webvtt',
      '-f', 'webvtt',
      'pipe:1',
    ];

    const ffmpeg = spawn('ffmpeg', ffmpegArgs);
    const chunks = [];
    let stderr = '';

    await new Promise((resolve, reject) => {
      ffmpeg.stdout.on('data', (chunk) => chunks.push(chunk));
      ffmpeg.stderr.on('data', (d) => { stderr += d.toString(); });
      ffmpeg.on('close', (code) => {
        if (code === 0 || chunks.length > 0) resolve();
        else reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-300)}`));
      });
      ffmpeg.on('error', reject);
    });

    const rawVtt = Buffer.concat(chunks).toString('utf8');
    const cleanVtt = rawVtt
      .replace(/\{[^}]*\}/g, '')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/\r\n/g, '\n');

    return new Response(cleanVtt, {
      headers: {
        ...getMediaCorsHeaders(),
        'Content-Type': 'text/vtt; charset=utf-8',
        'Cache-Control': 'public, max-age=3600',
      },
    });

  } catch (err) {
    console.error('[media subtitle route error]', err);
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500, headers: getMediaCorsHeaders() }
    );
  }
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: getMediaCorsHeaders(),
  });
}
