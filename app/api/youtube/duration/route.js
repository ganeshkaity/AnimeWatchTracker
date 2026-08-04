import { execFile } from 'child_process';
import { promisify } from 'util';
import { NextResponse } from 'next/server';

const execFileAsync = promisify(execFile);

export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { videoId, url } = body;

    const targetUrl = url || (videoId ? `https://www.youtube.com/watch?v=${videoId}` : null);

    if (!targetUrl) {
      return NextResponse.json({ success: false, error: 'Video ID or URL is required' }, { status: 400 });
    }

    // Use --print duration to get just the duration — much faster than -J
    const { stdout } = await execFileAsync('yt-dlp', [
      '--print', 'duration',
      '--no-warnings',
      '--no-download',
      targetUrl
    ], { timeout: 30000, maxBuffer: 1024 * 1024 });

    const durationStr = stdout.trim();
    const duration = parseFloat(durationStr);

    if (isNaN(duration) || duration <= 0) {
      return NextResponse.json({ success: false, error: 'Could not determine duration' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      duration: Math.floor(duration)
    });

  } catch (err) {
    console.error('[youtube/duration API error]', err);
    return NextResponse.json({ success: false, error: err.message || 'Failed to fetch duration' }, { status: 500 });
  }
}
