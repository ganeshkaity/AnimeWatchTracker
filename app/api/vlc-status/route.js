import { NextResponse } from 'next/server';
import http from 'http';

export const dynamic = 'force-dynamic';

function fetchVlcStatus(port, password) {
  return new Promise((resolve, reject) => {
    const auth = Buffer.from(':' + password).toString('base64');
    const options = {
      hostname: '127.0.0.1',
      port: port,
      path: '/requests/status.json',
      method: 'GET',
      headers: {
        'Authorization': 'Basic ' + auth
      },
      timeout: 800
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error("Failed to parse status response: " + e.message));
          }
        } else {
          reject(new Error(`VLC HTTP server returned status ${res.statusCode}`));
        }
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('VLC status poll timeout'));
    });

    req.end();
  });
}

export async function GET() {
  const port = 8080;
  const password = 'watchanime';

  try {
    const status = await fetchVlcStatus(port, password);
    return NextResponse.json({ 
      success: true, 
      filePath: global.vlcCurrentFile || null,
      time: status.time, // Current position in seconds
      length: status.length, // Total duration in seconds
      state: status.state // "playing", "paused", "stopped"
    });
  } catch (err) {
    // If the HTTP poll fails, check if the child process has ended
    const isProcessRunning = !!(global.vlcProcess && !global.vlcProcess.killed);
    
    return NextResponse.json({ 
      success: false, 
      filePath: global.vlcCurrentFile || null,
      error: err.message,
      state: isProcessRunning ? 'running_inactive_api' : 'stopped'
    });
  }
}
