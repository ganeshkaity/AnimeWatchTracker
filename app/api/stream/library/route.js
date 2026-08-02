import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { validatePairingToken } from '../store';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');

    if (!token) {
      return NextResponse.json({ success: false, error: 'Pairing token required' }, { status: 400 });
    }

    const val = validatePairingToken(token);
    if (!val.valid) {
      return NextResponse.json({ success: false, error: val.reason }, { status: 401 });
    }

    // Return library overview with list of anime folders and episodes
    // In Next.js client-side localStore is in localStorage, but for PC host backend,
    // we can also scan tracked directories or read requests.
    // If the request passes an optional anime folder or path, we can scan it directly.
    const folderPath = searchParams.get('folderPath');

    if (folderPath && fs.existsSync(folderPath)) {
      const files = fs.readdirSync(folderPath);
      const videoExtensions = ['.mp4', '.mkv', '.avi', '.mov', '.webm', '.m4v', '.ts'];
      const videoFiles = files
        .filter(f => videoExtensions.includes(path.extname(f).toLowerCase()))
        .map(f => ({
          fileName: f,
          filePath: path.join(folderPath, f),
          sizeBytes: fs.statSync(path.join(folderPath, f)).size,
        }));

      return NextResponse.json({
        success: true,
        folderPath,
        videos: videoFiles,
      });
    }

    return NextResponse.json({
      success: true,
      message: 'Stream library endpoint active',
    });
  } catch (err) {
    console.error('[stream library error]', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
