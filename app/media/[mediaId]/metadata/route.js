import { execSync } from 'child_process';
import fs from 'fs';
import { NextResponse } from 'next/server';
import { resolveMedia, getMediaCorsHeaders } from '../../../lib/mediaRegistry';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  try {
    const mediaId = params?.mediaId;
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

    const safeFilePath = resolved.filePath.replace(/"/g, '\\"');
    const cmd = `ffprobe -v error -show_format -show_streams -of json "${safeFilePath}"`;

    let stdout;
    try {
      stdout = execSync(cmd, { encoding: 'utf8', timeout: 15000 });
    } catch (probeErr) {
      console.error('[media metadata ffprobe error]', probeErr.message);
      return NextResponse.json(
        { success: false, error: 'ffprobe failed: ' + probeErr.message },
        { status: 500, headers: getMediaCorsHeaders() }
      );
    }

    let info;
    try {
      info = JSON.parse(stdout);
    } catch {
      return NextResponse.json(
        { success: false, error: 'Failed to parse ffprobe output' },
        { status: 500, headers: getMediaCorsHeaders() }
      );
    }

    const streams = info.streams || [];
    const audioTracks = [];
    const subtitleTracks = [];
    let videoResolution = null;
    let videoCodec = null;

    streams.forEach((stream) => {
      const index = stream.index;
      const lang = stream.tags?.language || 'und';
      const rawTitle = stream.tags?.title || '';
      const codec = stream.codec_name || 'unknown';

      if (stream.codec_type === 'video' && !videoResolution) {
        videoResolution = {
          width: stream.width,
          height: stream.height,
        };
        videoCodec = codec;
      } else if (stream.codec_type === 'audio') {
        const title = rawTitle || `Audio Track ${audioTracks.length + 1}`;
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

    // Parse duration from all possible ffprobe containers/tags
    let duration = null;
    if (info.format?.duration && !isNaN(parseFloat(info.format.duration))) {
      duration = parseFloat(info.format.duration);
    }
    if (!duration || duration <= 0) {
      const videoStream = streams.find((s) => s.codec_type === 'video');
      if (videoStream?.duration && !isNaN(parseFloat(videoStream.duration))) {
        duration = parseFloat(videoStream.duration);
      }
    }
    if (!duration || duration <= 0) {
      const videoStream = streams.find((s) => s.codec_type === 'video');
      const tagDuration = info.format?.tags?.DURATION || videoStream?.tags?.DURATION || streams[0]?.tags?.DURATION;
      if (tagDuration && typeof tagDuration === 'string') {
        const parts = tagDuration.split(':');
        if (parts.length === 3) {
          duration = parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]);
        }
      }
    }

    const fileSize = info.format?.size ? parseInt(info.format.size, 10) : null;

    return NextResponse.json(
      {
        success: true,
        metadata: {
          mediaId,
          duration,
          fileSize,
          formatName: info.format?.format_name,
          resolution: videoResolution,
          videoCodec,
          audioTracks,
          subtitleTracks,
        }
      },
      { headers: getMediaCorsHeaders() }
    );

  } catch (err) {
    console.error('[media metadata route error]', err);
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
