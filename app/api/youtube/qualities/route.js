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

    const { stdout } = await execFileAsync('yt-dlp', [
      '-J',
      '--no-warnings',
      targetUrl
    ], { maxBuffer: 15 * 1024 * 1024 });

    const info = JSON.parse(stdout);
    const formats = Array.isArray(info.formats) ? info.formats : [];

    const heights = new Set();
    let hasAudioOnly = false;

    formats.forEach(f => {
      if (f.height) {
        heights.add(f.height);
      }
      if (f.acodec !== 'none' && (f.vcodec === 'none' || f.resolution === 'audio only')) {
        hasAudioOnly = true;
      }
    });

    const standardHeights = [1080, 720, 480, 360, 240, 144];
    const availableQualities = [];

    // Always include Best as default option
    availableQualities.push({ id: 'best', label: 'Best Available (Auto)', formatSpec: 'bestvideo+bestaudio/best' });

    standardHeights.forEach(h => {
      // Check if video has height close or equal
      const match = Array.from(heights).some(availableH => Math.abs(availableH - h) <= 20);
      if (match || heights.size === 0) {
        availableQualities.push({
          id: `${h}p`,
          label: `${h}p HD/SD`,
          formatSpec: `bestvideo[height<=${h}]+bestaudio/best[height<=${h}]/best`
        });
      }
    });

    if (hasAudioOnly || formats.length > 0) {
      availableQualities.push({
        id: 'audio-only',
        label: 'Audio Only',
        formatSpec: 'bestaudio/best'
      });
    }

    return NextResponse.json({
      success: true,
      qualities: availableQualities,
      rawHeights: Array.from(heights).sort((a, b) => b - a),
      duration: info.duration || 0
    });

  } catch (err) {
    console.error('[youtube/qualities API error]', err);
    // Fallback standard options if yt-dlp fails on format extraction
    return NextResponse.json({
      success: true,
      qualities: [
        { id: 'best', label: 'Best Available (Auto)', formatSpec: 'bestvideo+bestaudio/best' },
        { id: '1080p', label: '1080p HD', formatSpec: 'bestvideo[height<=1080]+bestaudio/best' },
        { id: '720p', label: '720p HD', formatSpec: 'bestvideo[height<=720]+bestaudio/best' },
        { id: '480p', label: '480p SD', formatSpec: 'bestvideo[height<=480]+bestaudio/best' },
        { id: '360p', label: '360p SD', formatSpec: 'bestvideo[height<=360]+bestaudio/best' },
        { id: 'audio-only', label: 'Audio Only', formatSpec: 'bestaudio/best' },
      ],
      warning: err.message
    });
  }
}
