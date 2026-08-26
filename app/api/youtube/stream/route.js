import { spawn } from 'child_process';
import fs from 'fs';
import { NextResponse } from 'next/server';
import {
  getOrCreateSession,
  appendChunk,
  markSessionFinished,
  getCachedSize
} from '../../../lib/youtubeCacheManager';

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
            'Content-Type': quality === 'audio-only' ? 'audio/mp4' : 'video/mp4',
            'X-Packet-Cache': 'HIT',
          },
        });
      }
    }

    // ── Start Fresh yt-dlp + FFmpeg Streaming Session ──
    const targetUrl = videoId.startsWith('http') ? videoId : `https://www.youtube.com/watch?v=${videoId}`;
    const formatSpec = getFormatSpec(quality);

    // Spawn yt-dlp with android,web client to completely prevent 403 Forbidden errors
    const ytProcess = spawn('yt-dlp', [
      '--extractor-args', 'youtube:player_client=android,web',
      '-f', formatSpec,
      '-o', '-',
      '--no-warnings',
      targetUrl
    ]);

    // Spawn FFmpeg to remux on-the-fly into fragmented MP4
    const ffmpegArgs = [
      '-v', 'error',
      '-i', 'pipe:0'
    ];

    if (quality === 'audio-only') {
      ffmpegArgs.push(
        '-c:a', 'aac',
        '-b:a', '192k',
        '-f', 'mp4',
        '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
        'pipe:1'
      );
    } else {
      ffmpegArgs.push(
        '-c:v', 'copy',
        '-c:a', 'aac',
        '-b:a', '192k',
        '-ac', '2',
        '-f', 'mp4',
        '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
        'pipe:1'
      );
    }

    const ffmpegProcess = spawn('ffmpeg', ffmpegArgs);
    session.ffmpegProcess = ffmpegProcess;
    session.ytProcess = ytProcess;

    // Pipe yt-dlp stdout directly into FFmpeg stdin
    ytProcess.stdout.pipe(ffmpegProcess.stdin);

    const killAll = () => {
      try { ytProcess.kill('SIGKILL'); } catch {}
      try { ffmpegProcess.kill('SIGKILL'); } catch {}
    };

    ytProcess.stderr.on('data', (d) => {
      const msg = d.toString();
      if (msg.includes('ERROR') || msg.includes('403')) {
        console.error('[yt-dlp err]', msg.trim());
      }
    });

    ffmpegProcess.stderr.on('data', (d) => {
      const msg = d.toString();
      if (msg.includes('Error') || msg.includes('Invalid')) {
        console.error('[yt ffmpeg err]', msg.trim());
      }
    });

    ytProcess.on('error', (err) => {
      console.error('[yt-dlp spawn error]', err);
      killAll();
    });

    ffmpegProcess.on('error', (err) => {
      console.error('[ffmpeg spawn error]', err);
      killAll();
    });

    const abortSignal = request.signal;
    if (abortSignal) {
      const onAbort = () => killAll();
      if (abortSignal.aborted) { killAll(); }
      else { abortSignal.addEventListener('abort', onAbort, { once: true }); }
    }

    const stream = new ReadableStream({
      start(controller) {
        ffmpegProcess.stdout.on('data', (chunk) => {
          appendChunk(sessionId, chunk);
          try { controller.enqueue(chunk); } catch {}
        });
        ffmpegProcess.stdout.on('end', () => {
          markSessionFinished(sessionId);
          try { controller.close(); } catch {}
        });
        ffmpegProcess.stdout.on('error', () => {
          try { controller.close(); } catch {}
        });
        ffmpegProcess.on('close', () => {
          markSessionFinished(sessionId);
          try { controller.close(); } catch {}
        });
      },
      cancel() {
        killAll();
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': quality === 'audio-only' ? 'audio/mp4' : 'video/mp4',
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'X-Session-ID': sessionId,
      },
    });

  } catch (err) {
    console.error('[youtube/stream API error]', err);
    return NextResponse.json({ success: false, error: err.message || 'Streaming failed' }, { status: 500 });
  }
}
