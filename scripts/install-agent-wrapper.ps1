param(
  [string]$Remote = "hscc@140.115.52.84",
  [string]$RemoteCommand = "/usr/local/bin/codimd-helper",
  [string]$InstallDir = "$env:USERPROFILE\bin",
  [string]$CommandName = "codimd-helper.cmd"
)

$ErrorActionPreference = "Stop"

if (-not (Get-Command ssh -ErrorAction SilentlyContinue)) {
  throw "ssh was not found in PATH. Install OpenSSH Client first."
}

New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null

$wrapperPath = Join-Path $InstallDir $CommandName
$content = @"
@echo off
ssh $Remote -- $RemoteCommand %*
"@

Set-Content -LiteralPath $wrapperPath -Value $content -Encoding ASCII

$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
if (($userPath -split ";") -notcontains $InstallDir) {
  [Environment]::SetEnvironmentVariable("Path", "$userPath;$InstallDir", "User")
  Write-Host "Added $InstallDir to the user PATH. Open a new terminal before using codimd-helper."
}

Write-Host "Installed $wrapperPath"
Write-Host "Test with: codimd-helper search `"3GPP`" --json"
