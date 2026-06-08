import { execSync } from 'child_process';
import fs from 'fs';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const filePath = searchParams.get('path');

    if (!filePath) {
      return NextResponse.json({ success: false, error: 'Path parameter is required' }, { status: 400 });
    }
    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ success: false, error: 'File does not exist' }, { status: 404 });
    }

    // Use execSync with a timeout — ffprobe is fast for metadata
    const safeFilePath = filePath.replace(/"/g, '\\"');
    const cmd = `ffprobe -v error -show_format -show_streams -of json "${safeFilePath}"`;

    let stdout;
    try {
      stdout = execSync(cmd, { encoding: 'utf8', timeout: 15000 });
    } catch (probeErr) {
      console.error('[ffprobe error]', probeErr.message);
      return NextResponse.json({ success: false, error: 'ffprobe failed: ' + probeErr.message }, { status: 500 });
    }

    let info;
    try {
      info = JSON.parse(stdout);
    } catch {
      return NextResponse.json({ success: false, error: 'Failed to parse ffprobe output' }, { status: 500 });
    }

    const streams = info.streams || [];
    const audioTracks = [];
    const subtitleTracks = [];

    streams.forEach((stream) => {
      const index = stream.index;
      const lang = stream.tags?.language || 'und';
      const rawTitle = stream.tags?.title || '';
      const codec = stream.codec_name || 'unknown';

      if (stream.codec_type === 'audio') {
        const title = rawTitle || `Audio ${audioTracks.length + 1}`;
        audioTracks.push({
          index,
          language: lang,
          title: `${title} (${lang})`,
          codec,
          channels: stream.channels || 2,
          sampleRate: stream.sample_rate,
        });
      } else if (stream.codec_type === 'subtitle') {
        const title = rawTitle || `Subtitle ${subtitleTracks.length + 1}`;
        // Flag image-based subtitles so frontend can show a note
        const isImageBased = ['hdmv_pgs_subtitle', 'dvd_subtitle', 'dvbsub'].includes(codec);
        subtitleTracks.push({
          index,
          language: lang,
          title: `${title} (${lang})`,
          codec,
          isImageBased,
        });
      }
    });

    // Duration comes from format (most reliable cross-format source)
    const duration = info.format?.duration ? parseFloat(info.format.duration) : null;

    return NextResponse.json({
      success: true,
      audioTracks,
      subtitleTracks,
      duration,
      formatName: info.format?.format_name,
    });

  } catch (err) {
    console.error('[metadata route error]', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
