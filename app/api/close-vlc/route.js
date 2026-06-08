import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    if (global.vlcProcess) {
      try {
        global.vlcProcess.kill();
      } catch (e) {
        console.error("Error killing cached VLC process:", e);
      }
      global.vlcProcess = null;
      global.vlcCurrentFile = null;
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Failed to terminate VLC:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
