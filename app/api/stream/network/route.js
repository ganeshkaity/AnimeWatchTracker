import os from 'os';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const interfaces = os.networkInterfaces();
    const addresses = [];

    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]) {
        // Filter for IPv4 non-loopback addresses
        if (iface.family === 'IPv4' && !iface.internal) {
          addresses.push({
            interface: name,
            address: iface.address,
          });
        }
      }
    }

    // Determine host header / port if available
    const hostHeader = request.headers.get('host') || 'localhost:3000';
    const portMatch = hostHeader.match(/:(\d+)$/);
    const port = portMatch ? parseInt(portMatch[1], 10) : 3000;

    // Prioritize Wi-Fi or hotspot adapters (e.g. 192.168.x.x, 172.20.x.x, 10.x.x.x)
    const primaryIp = addresses.length > 0 ? addresses[0].address : '127.0.0.1';

    return NextResponse.json({
      success: true,
      addresses,
      primaryIp,
      port,
      baseUrl: `http://${primaryIp}:${port}`,
    });
  } catch (err) {
    console.error('[network route error]', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
