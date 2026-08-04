import { NextResponse } from 'next/server';
import { closeSession } from '../../../lib/youtubeCacheManager';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { sessionId } = body;

    if (sessionId) {
      closeSession(sessionId);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[youtube/close-stream error]', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId');

    if (sessionId) {
      closeSession(sessionId);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[youtube/close-stream error]', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
