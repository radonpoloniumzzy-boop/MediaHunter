$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$runtimeDir = Join-Path $root ".local\runtime"
$pidFile = Join-Path $runtimeDir "local-services.json"

Push-Location $root
try {
  if (Test-Path $pidFile) {
    $processes = Get-Content -Path $pidFile -Raw | ConvertFrom-Json
    foreach ($process in @($processes)) {
      if (-not $process.pid) { continue }
      try {
        Stop-Process -Id ([int]$process.pid) -Force -ErrorAction Stop
        Write-Host "Stopped $($process.name) ($($process.pid))"
      } catch {
        Write-Host "Process already stopped: $($process.name) ($($process.pid))"
      }
    }

    Remove-Item -Path $pidFile -Force -ErrorAction SilentlyContinue
  } else {
    Write-Host "No saved local service processes were found."
  }

  cmd /c "docker info >nul 2>nul"
  if ($LASTEXITCODE -eq 0) {
    cmd /c "docker compose stop postgres >nul 2>nul"
    Write-Host "Stopped Postgres container."
  } else {
    Write-Host "Postgres container was not running or Docker is unavailable."
  }
} finally {
  Pop-Location
}
