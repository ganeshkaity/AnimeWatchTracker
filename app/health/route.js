import { NextResponse } from 'next/server';
import { getMediaCorsHeaders } from '../lib/mediaRegistry';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(
    {
      status: 'ok',
      service: 'WatchAnime Windows Media Server',
      timestamp: Date.now(),
      uptimeSeconds: Math.floor(process.uptime()),
      rangeSupport: true,
      features: ['http-range-requests', 'mkv-streaming', 'subtitles-vtt', 'metadata-ffprobe']
    },
    {
      status: 200,
      headers: getMediaCorsHeaders(),
    }
  );
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: getMediaCorsHeaders(),
  });
}
