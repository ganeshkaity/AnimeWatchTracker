const { app, BrowserWindow } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const net = require('net');

let mainWindow;
let nextProcess;

// Utility to find an open port
function findFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, () => {
      const port = srv.address().port;
      srv.close((err) => {
        if (err) reject(err);
        else resolve(port);
      });
    });
    srv.on('error', reject);
  });
}

// Utility to wait for port to be ready
function waitForServer(port, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const interval = setInterval(() => {
      const socket = new net.Socket();
      socket.connect(port, '127.0.0.1', () => {
        socket.destroy();
        clearInterval(interval);
        resolve();
      });
      socket.on('error', () => {
        socket.destroy();
        if (Date.now() - start > timeout) {
          clearInterval(interval);
          reject(new Error('Server start timeout'));
        }
      });
    }, 500);
  });
}

async function createWindow() {
  const port = await findFreePort();
  const isDev = !app.isPackaged;

  console.log(`Starting Next.js on port ${port} (isDev: ${isDev})`);

  if (isDev) {
    // In development, spawn the Next.js dev server
    nextProcess = spawn(/^win/.test(process.platform) ? 'npm.cmd' : 'npm', ['run', 'dev', '--', '-p', port], {
      cwd: __dirname,
      stdio: 'inherit'
    });
  } else {
    // In production, run the standalone server
    const serverPath = path.join(__dirname, '.next', 'standalone', 'server.js');
    nextProcess = spawn(process.execPath, [serverPath], {
      env: {
        ...process.env,
        PORT: port,
        HOSTNAME: '127.0.0.1',
        NODE_ENV: 'production'
      },
      stdio: 'inherit'
    });
  }

  nextProcess.on('error', (err) => {
    console.error('Failed to start Next.js process:', err);
  });

  await waitForServer(port);

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    },
    title: "WatchAnime",
    autoHideMenuBar: true,
    backgroundColor: '#03030d'
  });

  mainWindow.loadURL(`http://localhost:${port}`);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  // Ensure Next.js is terminated
  if (nextProcess) {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', nextProcess.pid, '/f', '/t']);
    } else {
      nextProcess.kill('SIGTERM');
    }
  }
});
