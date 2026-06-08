import { execSync } from 'child_process';
import fs from 'fs';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const filePath = searchParams.get('path');
    const timeStr = searchParams.get('time');

    if (!filePath || !timeStr) {
      return NextResponse.json({ success: false, error: 'Path and time parameters are required' }, { status: 400 });
    }
    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ success: false, error: 'File does not exist' }, { status: 404 });
    }

    const time = parseFloat(timeStr);
    const startRange = Math.max(0, time - 15);
    const endRange = time + 5;

    const safeFilePath = filePath.replace(/"/g, '\\"');
    const cmd = `ffprobe -v error -skip_frame nokey -select_streams v:0 -show_entries frame=pts_time -read_intervals ${startRange}%${endRange} -of json "${safeFilePath}"`;

    let stdout;
    try {
      stdout = execSync(cmd, { encoding: 'utf8', timeout: 5000 });
    } catch (probeErr) {
      console.error('[ffprobe keyframe error]', probeErr.message);
      // Fallback to time if probe fails
      return NextResponse.json({ success: true, keyframeTime: time });
    }

    let info;
    try {
      info = JSON.parse(stdout);
    } catch {
      return NextResponse.json({ success: true, keyframeTime: time });
    }

    const frames = info.frames || [];
    let keyframeTime = 0;
    
    // Find the closest keyframe before or equal to target time
    for (const f of frames) {
      const pts = parseFloat(f.pts_time);
      if (pts <= time) {
        keyframeTime = pts;
      } else {
        break;
      }
    }

    // If no keyframes found at all, fallback to 0 or target time
    if (frames.length === 0) {
      keyframeTime = time;
    }

    return NextResponse.json({
      success: true,
      keyframeTime,
    });

  } catch (err) {
    console.error('[keyframe route error]', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
