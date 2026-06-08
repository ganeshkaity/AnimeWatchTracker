import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const filePath = searchParams.get('path');
    const audioIndexStr = searchParams.get('audioIndex'); // stream index like "2"
    const ssStr = searchParams.get('ss');                 // seek-start in seconds

    if (!filePath) {
      return NextResponse.json({ success: false, error: 'Path is required' }, { status: 400 });
    }
    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ success: false, error: 'File not found' }, { status: 404 });
    }

    const ext = path.extname(filePath).toLowerCase();
    const isNativeFormat = (ext === '.mp4' || ext === '.mov') && !audioIndexStr;

    // ── Native streaming (MP4/MOV without custom audio track) ────────────────
    if (isNativeFormat) {
      const stat = fs.statSync(filePath);
      const fileSize = stat.size;
      const range = request.headers.get('range');
      const contentType = ext === '.mov' ? 'video/quicktime' : 'video/mp4';

      if (range) {
        const [startStr, endStr] = range.replace(/bytes=/, '').split('-');
        const start = parseInt(startStr, 10);
        const end = endStr ? parseInt(endStr, 10) : fileSize - 1;

        if (start >= fileSize) {
          return new Response('Range Not Satisfiable', {
            status: 416,
            headers: { 'Content-Range': `bytes */${fileSize}` },
          });
        }

        const chunkSize = end - start + 1;
        const fileStream = fs.createReadStream(filePath, { start, end });

        return new Response(fileStream, {
          status: 206,
          headers: {
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': String(chunkSize),
            'Content-Type': contentType,
          },
        });
      }

      // No range header — send entire file
      const fileStream = fs.createReadStream(filePath);
      return new Response(fileStream, {
        headers: {
          'Content-Length': String(fileSize),
          'Accept-Ranges': 'bytes',
          'Content-Type': contentType,
        },
      });
    }

    // ── FFmpeg remux (MKV or custom audio track) ─────────────────────────────
    const ss = ssStr ? parseFloat(ssStr) : 0;

    const args = ['-v', 'error'];

    // Seek BEFORE input for fast keyframe-level seek
    if (ss > 0) {
      args.push('-noaccurate_seek', '-ss', String(ss));
    }

    args.push('-i', filePath);

    if (audioIndexStr) {
      // Map specific video + specific audio stream by absolute stream index
      const audioIndex = parseInt(audioIndexStr, 10);
      args.push('-map', '0:v:0', '-map', `0:${audioIndex}`);
    }
    // If no audioIndex, ffmpeg auto-selects default streams

    args.push(
      '-c:v', 'copy',        // Copy video — no re-encoding
      '-c:a', 'aac',         // Transcode audio to AAC (browser-compatible)
      '-b:a', '192k',
      '-ac', '2',            // Downmix to stereo for max compatibility
      '-avoid_negative_ts', 'make_zero',
      '-f', 'mp4',
      '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
      'pipe:1'
    );

    const ffmpeg = spawn('ffmpeg', args);

    // Log stderr for debugging
    ffmpeg.stderr.on('data', (data) => {
      const msg = data.toString();
      if (msg.includes('Error') || msg.includes('error') || msg.includes('Invalid')) {
        console.error('[ffmpeg stream]', msg.trim());
      }
    });

    // Kill ffmpeg if the client disconnects (e.g. seek / switchUrl)
    const abortSignal = request.signal;
    if (abortSignal) {
      const onAbort = () => {
        try { ffmpeg.kill('SIGKILL'); } catch {}
      };
      if (abortSignal.aborted) { ffmpeg.kill('SIGKILL'); }
      else { abortSignal.addEventListener('abort', onAbort, { once: true }); }
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
          console.error('[ffmpeg spawn error]', err);
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
      headers: {
        'Content-Type': 'video/mp4',
        'Cache-Control': 'no-cache, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });

  } catch (err) {
    console.error('[stream route error]', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
