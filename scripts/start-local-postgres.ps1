$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$dockerDesktop = "C:\Program Files\Docker\Docker\Docker Desktop.exe"

function Test-DockerReady {
  try {
    docker version | Out-Null
    return $true
  } catch {
    return $false
  }
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw "Docker CLI not found. Please install Docker Desktop first."
}

if (-not (Test-DockerReady)) {
  if (Test-Path $dockerDesktop) {
    Write-Host "Starting Docker Desktop..."
    Start-Process $dockerDesktop | Out-Null
  }

  $deadline = (Get-Date).AddMinutes(2)
  while ((Get-Date) -lt $deadline) {
    Start-Sleep -Seconds 3
    if (Test-DockerReady) {
      break
    }
  }
}

if (-not (Test-DockerReady)) {
  throw "Docker Desktop is not ready yet. Please wait a moment and run the command again."
}

Push-Location $root
try {
  docker compose up -d postgres
} finally {
  Pop-Location
}
