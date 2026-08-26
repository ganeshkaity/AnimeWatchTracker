import { NextResponse } from 'next/server';
import { registerMediaFile, getMediaCorsHeaders } from '../../../lib/mediaRegistry';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const body = await request.json();
    const { animeId, episodeId, filePath, fileName } = body || {};

    if (!filePath) {
      return NextResponse.json(
        { success: false, error: 'filePath is required to register media file' },
        { status: 400, headers: getMediaCorsHeaders() }
      );
    }

    const reg = registerMediaFile({ animeId, episodeId, filePath, fileName });
    if (!reg) {
      return NextResponse.json(
        { success: false, error: 'Could not register media file' },
        { status: 500, headers: getMediaCorsHeaders() }
      );
    }

    const mediaId = reg.mediaId;
    const baseUrl = process.env.NEXT_PUBLIC_MEDIA_SERVER_URL || '';

    return NextResponse.json(
      {
        success: true,
        mediaId,
        streamUrl: `${baseUrl}/media/${encodeURIComponent(mediaId)}/stream`,
        metadataUrl: `${baseUrl}/media/${encodeURIComponent(mediaId)}/metadata`,
        subtitlesUrl: `${baseUrl}/media/${encodeURIComponent(mediaId)}/subtitles`,
        fileName: fileName || '',
      },
      { headers: getMediaCorsHeaders() }
    );
  } catch (err) {
    console.error('[media resolve error]', err);
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
