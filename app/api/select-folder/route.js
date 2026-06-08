import { execSync } from 'child_process';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // PowerShell script that opens a native Windows FolderBrowserDialog
    // Uses -STA for single-threaded apartment (required for WinForms dialogs)
    // Creates a tiny TopMost owner form to ensure the dialog appears in the foreground
    const cmd = `powershell -STA -NoProfile -Command "Add-Type -AssemblyName System.Windows.Forms; $owner = New-Object System.Windows.Forms.Form; $owner.TopMost = $true; $owner.Width = 0; $owner.Height = 0; $owner.ShowInTaskbar = $false; $owner.FormBorderStyle = 'None'; $owner.StartPosition = 'Manual'; $owner.Location = New-Object System.Drawing.Point(-9999,-9999); $owner.Show(); $owner.BringToFront(); $f = New-Object System.Windows.Forms.FolderBrowserDialog; $f.Description = 'Select Anime Folder'; $f.ShowNewFolderButton = $true; $result = $f.ShowDialog($owner); $owner.Close(); if ($result -eq 'OK') { Write-Output $f.SelectedPath }"`;
    
    const stdout = execSync(cmd, { timeout: 60000 }).toString().trim();
    
    return NextResponse.json({ 
      success: true, 
      path: stdout || null 
    });
  } catch (err) {
    console.error("PowerShell folder picker error:", err);
    // If the PowerShell script fails or times out, we return success: true but path: null, 
    // letting the client fall back to direct text input.
    return NextResponse.json({ 
      success: false, 
      error: err.message 
    });
  }
}
