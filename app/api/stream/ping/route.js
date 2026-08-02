import { NextResponse } from 'next/server';
import {
  getHostSession,
  validatePairingToken,
  touchDevice,
} from '../store';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');
    const deviceId = searchParams.get('deviceId');

    const session = getHostSession();

    if (!session || !session.online) {
      return NextResponse.json({
        success: false,
        online: false,
        reason: 'Host server is offline',
      }, { status: 503 });
    }

    if (token) {
      const val = validatePairingToken(token);
      if (!val.valid) {
        return NextResponse.json({
          success: false,
          online: true,
          valid: false,
          reason: val.reason,
        }, { status: 401 });
      }
      if (deviceId) {
        touchDevice(deviceId);
      }
    }

    return NextResponse.json({
      success: true,
      online: true,
      valid: true,
      hostInfo: {
        sessionId: session.sessionId,
        hostIp: session.hostIp,
        port: session.port,
        createdAt: session.createdAt,
      },
    });
  } catch (err) {
    console.error('[stream ping GET error]', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
