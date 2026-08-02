import { NextResponse } from 'next/server';
import {
  validatePairingToken,
  registerPairedDevice,
  getHostSession,
} from '../store';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { token, passcode, deviceId, deviceName } = body;

    if (!token && !passcode) {
      return NextResponse.json({ success: false, error: 'Pairing token or passcode is required' }, { status: 400 });
    }

    const val = validatePairingToken(token, passcode);
    if (!val.valid) {
      return NextResponse.json({ success: false, error: val.reason }, { status: 401 });
    }

    const device = registerPairedDevice({ deviceId, deviceName });
    const hostSession = getHostSession();

    return NextResponse.json({
      success: true,
      message: 'Paired successfully with host PC',
      token: hostSession.pairingToken,
      deviceId: device.deviceId,
      hostInfo: {
        sessionId: hostSession.sessionId,
        hostIp: hostSession.hostIp,
        port: hostSession.port,
        pairedAt: device.pairedAt,
      },
    });
  } catch (err) {
    console.error('[stream pair POST error]', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
