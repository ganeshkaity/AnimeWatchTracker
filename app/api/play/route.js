import { spawn } from 'child_process';
import fs from 'fs';
import http from 'http';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

function findVlcPath(customPath) {
  if (customPath && fs.existsSync(customPath)) {
    return customPath;
  }
  const defaultPaths = [
    'C:\\Program Files\\VideoLAN\\VLC\\vlc.exe',
    'C:\\Program Files (x86)\\VideoLAN\\VLC\\vlc.exe'
  ];
  for (const p of defaultPaths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }
  return 'vlc'; // Fallback to system PATH
}

export async function POST(request) {
  try {
    const { filePath, customVlcPath, resumeTime, speed, volume } = await request.json();
    if (!filePath) {
      return NextResponse.json({ success: false, error: 'filePath is required' }, { status: 400 });
    }

    // Clean up any previously spawned VLC process
    if (global.vlcProcess) {
      try {
        global.vlcProcess.kill();
      } catch (e) {
        console.error("Error killing previous VLC process:", e);
      }
      global.vlcProcess = null;
      global.vlcCurrentFile = null;
    }

    const vlcPath = findVlcPath(customVlcPath);
    const port = 8080;
    const password = 'watchanime';

    // Arguments to enable HTTP control interface and load the file
    const args = [
      '--extraintf=http',
      `--http-port=${port}`,
      `--http-password=${password}`,
      '--no-sub-autodetect-file',
      '--no-volume-save'
    ];

    if (resumeTime && resumeTime > 0) {
      args.push(`--start-time=${Math.floor(resumeTime)}`);
    }

    if (speed && speed !== 1) {
      args.push(`--rate=${speed}`);
    }

    let targetVlcVol = 256;
    if (volume !== undefined && volume !== null) {
      const volNum = Number(volume);
      targetVlcVol = Math.round((volNum / 100) * 256);
      args.push(`--volume=${targetVlcVol}`);

      const mmVol = (volNum / 100).toFixed(2);
      args.push(`--mmdevice-volume=${mmVol}`);
    }

    args.push(filePath);

    console.log(`Spawning local VLC instance: "${vlcPath}" with args:`, args);

    // Spawn process as detached so it can run independently of Next.js dev server
    const child = spawn(vlcPath, args, {
      detached: true,
      stdio: 'ignore'
    });
    
    child.unref();

    // Cache process reference in global object
    global.vlcProcess = child;
    global.vlcCurrentFile = filePath;

    // Send HTTP command to forcefully set initial volume once VLC HTTP interface is ready
    const sendVlcVolumeCommand = (val) => {
      try {
        const auth = Buffer.from(':' + password).toString('base64');
        const req = http.request({
          hostname: '127.0.0.1',
          port: port,
          path: `/requests/status.json?command=volume&val=${val}`,
          method: 'GET',
          headers: { 'Authorization': 'Basic ' + auth },
          timeout: 800
        }, (res) => {
          res.resume();
        });
        req.on('error', () => {});
        req.end();
      } catch (e) {}
    };

    setTimeout(() => sendVlcVolumeCommand(targetVlcVol), 500);
    setTimeout(() => sendVlcVolumeCommand(targetVlcVol), 1200);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Failed to launch VLC:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
