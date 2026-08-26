import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';
import { resolveMedia, getMediaCorsHeaders } from '../../../lib/mediaRegistry';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  try {
    const mediaId = params?.mediaId;
    const { searchParams } = new URL(request.url);
    const audioIndexStr = searchParams.get('audioIndex');
    const ssStr = searchParams.get('ss');

    if (!mediaId) {
      return NextResponse.json(
        { success: false, error: 'mediaId is required' },
        { status: 400, headers: getMediaCorsHeaders() }
      );
    }

    const resolved = resolveMedia(mediaId);
    if (!resolved || !resolved.filePath) {
      return NextResponse.json(
        { success: false, error: 'Media not found on media server. The requested episode identifier could not be resolved to a local file.' },
        { status: 404, headers: getMediaCorsHeaders() }
      );
    }

    const filePath = resolved.filePath;
    if (!fs.existsSync(filePath)) {
      return NextResponse.json(
        { success: false, error: 'Media file missing on Windows disk at registered location.' },
        { status: 404, headers: getMediaCorsHeaders() }
      );
    }

    const ext = path.extname(filePath).toLowerCase();
    const isNativeFormat = (ext === '.mp4' || ext === '.mov' || ext === '.m4v' || ext === '.webm') && !audioIndexStr;
    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const range = request.headers.get('range');
    const contentType = ext === '.mov' ? 'video/quicktime' : (ext === '.webm' ? 'video/webm' : 'video/mp4');
    const corsHeaders = getMediaCorsHeaders();

    // ── Native HTTP Range Request Streaming (MP4/MOV/WEBM) ───────────────────
    if (isNativeFormat) {
      if (range) {
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

        if (isNaN(start) || start >= fileSize || (parts[1] && end >= fileSize)) {
          return new Response('Requested range not satisfiable', {
            status: 416,
            headers: {
              ...corsHeaders,
              'Content-Range': `bytes */${fileSize}`,
            },
          });
        }

        const chunkSize = end - start + 1;
        const fileStream = fs.createReadStream(filePath, { start, end });

        return new Response(fileStream, {
          status: 206,
          headers: {
            ...corsHeaders,
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': String(chunkSize),
            'Content-Type': contentType,
            'Cache-Control': 'no-cache',
          },
        });
      }

      // No range header provided — stream from start with Accept-Ranges
      const fileStream = fs.createReadStream(filePath);
      return new Response(fileStream, {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Length': String(fileSize),
          'Accept-Ranges': 'bytes',
          'Content-Type': contentType,
        },
      });
    }

    // ── MKV / Non-Native Format Streaming (FFmpeg remux to fragmented MP4) ────
    const ss = ssStr ? parseFloat(ssStr) : 0;
    const args = ['-v', 'error'];

    if (ss > 0) {
      args.push('-noaccurate_seek', '-ss', String(ss));
    }

    args.push('-i', filePath);

    if (audioIndexStr) {
      const audioIndex = parseInt(audioIndexStr, 10);
      args.push('-map', '0:v:0', '-map', `0:${audioIndex}`);
    }

    args.push(
      '-c:v', 'copy',
      '-c:a', 'aac',
      '-b:a', '192k',
      '-ac', '2',
      '-avoid_negative_ts', 'make_zero',
      '-f', 'mp4',
      '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
      'pipe:1'
    );

    const ffmpeg = spawn('ffmpeg', args);

    ffmpeg.stderr.on('data', (data) => {
      const msg = data.toString();
      if (msg.includes('Error') || msg.includes('error')) {
        console.error('[media-stream ffmpeg stderr]', msg.trim());
      }
    });

    const abortSignal = request.signal;
    if (abortSignal) {
      const onAbort = () => {
        try { ffmpeg.kill('SIGKILL'); } catch {}
      };
      if (abortSignal.aborted) {
        ffmpeg.kill('SIGKILL');
      } else {
        abortSignal.addEventListener('abort', onAbort, { once: true });
      }
    }

    const stream = new ReadableStream({
      start(controller) {
        ffmpeg.stdout.on('data', (chunk) => {
          try { controller.enqueue(chunk); } catch {}
        });
        ffmpeg.stdout.on('end', () => {
          try { controller.close(); } catch {}
        });
        ffmpeg.stdout.on('error', () => {
          try { controller.close(); } catch {}
        });
        ffmpeg.on('error', (err) => {
          console.error('[media-stream ffmpeg spawn error]', err);
          try { controller.error(err); } catch {}
        });
        ffmpeg.on('close', () => {
          try { controller.close(); } catch {}
        });
      },
      cancel() {
        try { ffmpeg.kill('SIGKILL'); } catch {}
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'video/mp4',
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-cache, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });

  } catch (err) {
    console.error('[media stream error]', err);
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500, headers: getMediaCorsHeaders() }
    );
  }
}

export async function HEAD(request, { params }) {
  try {
    const mediaId = params?.mediaId;
    const resolved = resolveMedia(mediaId);
    if (!resolved || !fs.existsSync(resolved.filePath)) {
      return new Response(null, { status: 404, headers: getMediaCorsHeaders() });
    }
    const stat = fs.statSync(resolved.filePath);
    return new Response(null, {
      status: 200,
      headers: {
        ...getMediaCorsHeaders(),
        'Content-Length': String(stat.size),
        'Accept-Ranges': 'bytes',
        'Content-Type': 'video/mp4',
      },
    });
  } catch {
    return new Response(null, { status: 500, headers: getMediaCorsHeaders() });
  }
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: getMediaCorsHeaders(),
  });
}
