import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // PowerShell script that opens a native Windows OpenFileDialog for video files
    // Uses -STA and a TopMost owner form to ensure dialog appears in foreground
    const cmd = `powershell -STA -NoProfile -Command "Add-Type -AssemblyName System.Windows.Forms; $owner = New-Object System.Windows.Forms.Form; $owner.TopMost = $true; $owner.Width = 0; $owner.Height = 0; $owner.ShowInTaskbar = $false; $owner.FormBorderStyle = 'None'; $owner.StartPosition = 'Manual'; $owner.Location = New-Object System.Drawing.Point(-9999,-9999); $owner.Show(); $owner.BringToFront(); $f = New-Object System.Windows.Forms.OpenFileDialog; $f.Filter = 'Video Files (*.mp4, *.mkv, *.webm, *.mov, *.avi)|*.mp4;*.mkv;*.webm;*.mov;*.avi;*.m4v|All Files (*.*)|*.*'; $f.Title = 'Select Local Movie File'; $result = $f.ShowDialog($owner); $owner.Close(); if ($result -eq 'OK') { Write-Output $f.FileName }"`;

    const stdout = execSync(cmd, { timeout: 60000 }).toString().trim();

    if (stdout && fs.existsSync(stdout)) {
      const fileName = path.basename(stdout);
      const ext = path.extname(stdout).toLowerCase();
      const stats = fs.statSync(stdout);

      return NextResponse.json({
        success: true,
        path: stdout,
        fileName,
        extension: ext,
        fileSize: stats.size,
      });
    }

    return NextResponse.json({
      success: true,
      path: stdout || null,
      fileName: stdout ? path.basename(stdout) : null,
    });
  } catch (err) {
    console.error('PowerShell movie file picker error:', err);
    return NextResponse.json({
      success: false,
      error: err.message,
    });
  }
}
