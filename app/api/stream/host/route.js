import { NextResponse } from 'next/server';
import {
  getHostSession,
  startHostSession,
  stopHostSession,
  revokeDevice,
} from '../store';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = getHostSession();
    return NextResponse.json({
      success: true,
      online: Boolean(session && session.online),
      session,
    });
  } catch (err) {
    console.error('[stream host GET error]', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { action, hostIp, port, deviceId } = body;

    if (action === 'start') {
      const session = startHostSession({ hostIp, port });
      return NextResponse.json({
        success: true,
        message: 'Stream Host started successfully',
        session,
      });
    }

    if (action === 'stop' || action === 'disconnect') {
      stopHostSession();
      return NextResponse.json({
        success: true,
        message: 'Stream Host stopped and all paired devices disconnected',
      });
    }

    if (action === 'revoke' && deviceId) {
      const revoked = revokeDevice(deviceId);
      return NextResponse.json({
        success: true,
        revoked,
        session: getHostSession(),
      });
    }

    return NextResponse.json({ success: false, error: 'Invalid action' }, { status: 400 });
  } catch (err) {
    console.error('[stream host POST error]', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
