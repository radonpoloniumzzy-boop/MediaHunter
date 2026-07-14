$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$runtimeDir = Join-Path $root ".local\runtime"
$pidFile = Join-Path $runtimeDir "local-services.json"

function Test-ApiReady {
  try {
    $response = Invoke-WebRequest -Uri "http://localhost:3001/api/health" -UseBasicParsing -TimeoutSec 3
    return $response.StatusCode -eq 200
  } catch {
    return $false
  }
}

function Test-CollectorReady {
  $collector = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object {
      $_.Name -eq "node.exe" -and $_.CommandLine -like "*collector-worker.ts*"
    } |
    Select-Object -First 1

  return $null -ne $collector
}

Push-Location $root
try {
  New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null
  & powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "start-local-postgres.ps1")

  $services = @(
    @{ Name = "LAN.Ting API"; Script = "start-local-api.ps1" },
    @{ Name = "LAN.Ting Collector"; Script = "start-local-collector.ps1" },
    @{ Name = "LAN.Ting Web"; Script = "start-local-web.ps1" }
  )

  $startedProcesses = @()
  foreach ($service in $services) {
    $process = Start-Process powershell `
      -WorkingDirectory $root `
      -ArgumentList @(
        "-NoExit",
        "-ExecutionPolicy", "Bypass",
        "-Command",
        "Set-Location '$root'; & '$PSScriptRoot\$($service.Script)'"
      ) `
      -WindowStyle Normal `
      -PassThru
    $startedProcesses += [pscustomobject]@{
      name = $service.Name
      pid = $process.Id
    }
  }

  $startedProcesses | ConvertTo-Json | Set-Content -Path $pidFile -Encoding UTF8

  $deadline = (Get-Date).AddSeconds(45)
  while ((Get-Date) -lt $deadline) {
    if (Test-ApiReady) {
      break
    }
    Start-Sleep -Seconds 2
  }

  Start-Process "http://localhost:5173" | Out-Null

  Write-Host "Started Postgres, API, collector, and web in separate PowerShell windows."
  Write-Host "You can stop everything with: .\停止系统.cmd"
  Write-Host "Web: http://localhost:5173"
  Write-Host "API: http://localhost:3001/api"
  if (-not (Test-ApiReady)) {
    Write-Warning "API did not become ready in time. Please confirm Docker Desktop is running, then run 启动系统.cmd again."
  }
} finally {
  Pop-Location
}
