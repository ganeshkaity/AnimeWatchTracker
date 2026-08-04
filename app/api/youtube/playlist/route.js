import { execFile } from 'child_process';
import { promisify } from 'util';
import { NextResponse } from 'next/server';

const execFileAsync = promisify(execFile);

export const dynamic = 'force-dynamic';

function formatDuration(seconds) {
  if (!seconds || isNaN(seconds)) return '0:00';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  if (hrs > 0) {
    return `${hrs}:${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
  }
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { url } = body;

    if (!url || typeof url !== 'string' || !url.trim()) {
      return NextResponse.json({ success: false, error: 'YouTube Playlist URL is required' }, { status: 400 });
    }

    const cleanUrl = url.trim();

    // Execute yt-dlp to extract flat playlist json metadata only
    const { stdout } = await execFileAsync('yt-dlp', [
      '--dump-single-json',
      '--flat-playlist',
      '--no-warnings',
      cleanUrl
    ], { maxBuffer: 10 * 1024 * 1024 });

    const rawData = JSON.parse(stdout);

    const playlistTitle = rawData.title || rawData.playlist_title || 'YouTube Playlist';
    const playlistId = rawData.id || 'playlist';
    const playlistThumbnail = rawData.thumbnails?.[rawData.thumbnails?.length - 1]?.url ||
      rawData.thumbnail ||
      (rawData.entries?.[0]?.id ? `https://i.ytimg.com/vi/${rawData.entries[0].id}/hqdefault.jpg` : '');

    const rawEntries = Array.isArray(rawData.entries) ? rawData.entries : [rawData];

    const videos = rawEntries.map((entry, index) => {
      const vId = entry.id || entry.url || `vid_${index}`;
      const vTitle = entry.title || `Video ${index + 1}`;
      const durationSec = entry.duration || 0;
      const thumb = entry.thumbnails?.[entry.thumbnails?.length - 1]?.url ||
        (entry.id ? `https://i.ytimg.com/vi/${entry.id}/hqdefault.jpg` : '');

      return {
        id: vId,
        title: vTitle,
        durationSeconds: durationSec,
        durationFormatted: formatDuration(durationSec),
        thumbnail: thumb,
        url: `https://www.youtube.com/watch?v=${vId}`,
        index: index + 1
      };
    });

    return NextResponse.json({
      success: true,
      playlist: {
        id: playlistId,
        title: playlistTitle,
        thumbnail: playlistThumbnail,
        totalVideos: videos.length,
        videos
      }
    });

  } catch (err) {
    console.error('[youtube/playlist API error]', err);
    return NextResponse.json({
      success: false,
      error: err.message || 'Failed to fetch YouTube playlist metadata'
    }, { status: 500 });
  }
}
