param(
  [string[]]$RequiredPaths = @()
)

$ErrorActionPreference = "Stop"

$LocalRoot = Split-Path -Parent $PSScriptRoot
$LocalNodeDir = Join-Path $LocalRoot ".tools\node-v22.22.1-win-x64"
$LocalNodeExe = Join-Path $LocalNodeDir "node.exe"
$LocalCorepack = Join-Path $LocalNodeDir "node_modules\corepack\dist\corepack.js"

$env:COREPACK_HOME = Join-Path $LocalRoot ".tools\corepack"
if ((Test-Path $LocalNodeExe) -and (Test-Path $LocalCorepack)) {
  $env:PATH = "$LocalNodeDir;$env:PATH"
  $PnpmExecutable = $LocalNodeExe
  $PnpmPrefix = @($LocalCorepack, "pnpm")
} else {
  $systemCorepack = Get-Command corepack.cmd -ErrorAction SilentlyContinue
  if (-not $systemCorepack) {
    throw "Neither the bundled Node runtime nor system Corepack is available. Install Node.js with Corepack first."
  }
  $PnpmExecutable = $systemCorepack.Source
  $PnpmPrefix = @("pnpm")
}

$missingPaths = @()
foreach ($relativePath in $RequiredPaths) {
  $absolutePath = Join-Path $LocalRoot $relativePath
  if (-not (Test-Path $absolutePath)) {
    $missingPaths += $relativePath
  }
}

$workspaceStore = Join-Path $LocalRoot "node_modules\.pnpm"
$needsInstall = (-not (Test-Path $workspaceStore)) -or ($missingPaths.Count -gt 0)

if ($needsInstall) {
  Write-Host "Installing workspace dependencies for this checkout..."
  & $PnpmExecutable @PnpmPrefix install --no-frozen-lockfile

  if ($LASTEXITCODE -ne 0) {
    throw "pnpm install failed with exit code $LASTEXITCODE"
  }
}
