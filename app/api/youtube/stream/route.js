import { spawn, execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import { NextResponse } from 'next/server';
import {
  getOrCreateSession,
  appendChunk,
  markSessionFinished,
  getCachedSize
} from '../../../lib/youtubeCacheManager';

const execFileAsync = promisify(execFile);

export const dynamic = 'force-dynamic';

function getFormatSpec(quality) {
  switch (quality) {
    case '1080p':
      return 'bestvideo[height<=1080]+bestaudio/best[height<=1080]/best';
    case '720p':
      return 'bestvideo[height<=720]+bestaudio/best[height<=720]/best';
    case '480p':
      return 'bestvideo[height<=480]+bestaudio/best[height<=480]/best';
    case '360p':
      return 'bestvideo[height<=360]+bestaudio/best[height<=360]/best';
    case '240p':
      return 'bestvideo[height<=240]+bestaudio/best[height<=240]/best';
    case '144p':
      return 'bestvideo[height<=144]+bestaudio/best[height<=144]/best';
    case 'audio-only':
      return 'bestaudio/best';
    case 'best':
    default:
      return 'bestvideo+bestaudio/best';
  }
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const videoId = searchParams.get('videoId') || searchParams.get('v');
    const quality = searchParams.get('quality') || 'best';
    const sessionId = searchParams.get('sessionId') || searchParams.get('sid') || `yt_${videoId}_${quality}`;
    const range = request.headers.get('range');

    if (!videoId) {
      return NextResponse.json({ success: false, error: 'videoId is required' }, { status: 400 });
    }

    const session = getOrCreateSession(sessionId);
    const cachedSize = getCachedSize(sessionId);

    // ── Check if Range request can be fulfilled directly from Packet Cache ──
    if (range && cachedSize > 0) {
      const [startStr, endStr] = range.replace(/bytes=/, '').split('-');
      const start = parseInt(startStr, 10);
      const end = endStr ? parseInt(endStr, 10) : (session.isFinished ? cachedSize - 1 : cachedSize - 1);

      // If user seeks backward within already cached portion:
      if (start < cachedSize && start >= 0) {
        const actualEnd = Math.min(end, cachedSize - 1);
        const chunkSize = actualEnd - start + 1;
        const fileStream = fs.createReadStream(session.cacheFilePath, { start, end: actualEnd });

        return new Response(fileStream, {
          status: 206,
          headers: {
            'Content-Range': `bytes ${start}-${actualEnd}/${session.isFinished ? cachedSize : '*'}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': String(chunkSize),
            'Content-Type': quality === 'audio-only' ? 'audio/webm' : 'video/mp4',
            'X-Packet-Cache': 'HIT',
          },
        });
      }
    }

    // ── Start Fresh yt-dlp + FFmpeg Streaming Session ──
    const targetUrl = videoId.startsWith('http') ? videoId : `https://www.youtube.com/watch?v=${videoId}`;
    const formatSpec = getFormatSpec(quality);

    // Extract direct media stream URL(s) using yt-dlp -g
    const { stdout: urlStdout } = await execFileAsync('yt-dlp', [
      '-g',
      '-f', formatSpec,
      '--no-warnings',
      targetUrl
    ]);

    const urls = urlStdout.trim().split(/\r?\n/).filter(Boolean);
    if (urls.length === 0) {
      return NextResponse.json({ success: false, error: 'Failed to extract YouTube stream URL' }, { status: 500 });
    }

    // Build FFmpeg command args
    const ffmpegArgs = ['-v', 'error'];

    if (urls.length === 1) {
      // Single combined stream
      ffmpegArgs.push('-i', urls[0]);
      if (quality === 'audio-only') {
        ffmpegArgs.push('-c:a', 'aac', '-b:a', '192k', '-f', 'mp4', '-movflags', 'frag_keyframe+empty_moov+default_base_moof', 'pipe:1');
      } else {
        ffmpegArgs.push('-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ac', '2', '-f', 'mp4', '-movflags', 'frag_keyframe+empty_moov+default_base_moof', 'pipe:1');
      }
    } else {
      // Video + Audio separate streams (DASH)
      ffmpegArgs.push('-i', urls[0], '-i', urls[1]);
      ffmpegArgs.push('-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ac', '2', '-f', 'mp4', '-movflags', 'frag_keyframe+empty_moov+default_base_moof', 'pipe:1');
    }

    const ffmpeg = spawn('ffmpeg', ffmpegArgs);
    session.ffmpegProcess = ffmpeg;

    ffmpeg.stderr.on('data', (data) => {
      const msg = data.toString();
      if (msg.includes('Error') || msg.includes('Invalid')) {
        console.error('[yt ffmpeg]', msg.trim());
      }
    });

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
          // Write chunk into Packet Cache file
          appendChunk(sessionId, chunk);
          try { controller.enqueue(chunk); } catch {}
        });
        ffmpeg.stdout.on('end', () => {
          markSessionFinished(sessionId);
          try { controller.close(); } catch {}
        });
        ffmpeg.stdout.on('error', () => {
          try { controller.close(); } catch {}
        });
        ffmpeg.on('error', (err) => {
          console.error('[yt ffmpeg error]', err);
          try { controller.error(err); } catch {}
        });
        ffmpeg.on('close', () => {
          markSessionFinished(sessionId);
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
        'Accept-Ranges': 'bytes',
        'X-Packet-Cache': 'MISS-RECORDING',
        'X-Session-ID': sessionId
      },
    });

  } catch (err) {
    console.error('[youtube/stream API error]', err);
    return NextResponse.json({ success: false, error: err.message || 'Streaming failed' }, { status: 500 });
  }
}
