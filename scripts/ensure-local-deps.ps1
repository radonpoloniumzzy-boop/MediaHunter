param(
  [string[]]$RequiredPaths = @()
)

$ErrorActionPreference = "Stop"

$LocalRoot = Split-Path -Parent $PSScriptRoot
$LocalNodeDir = Join-Path $LocalRoot ".tools\node-v22.22.1-win-x64"
$LocalNodeExe = Join-Path $LocalNodeDir "node.exe"
$LocalCorepack = Join-Path $LocalNodeDir "node_modules\corepack\dist\corepack.js"

if (-not (Test-Path $LocalNodeExe)) {
  throw "Local Node runtime not found at $LocalNodeExe"
}

if (-not (Test-Path $LocalCorepack)) {
  throw "Local Corepack runtime not found at $LocalCorepack"
}

$env:COREPACK_HOME = Join-Path $LocalRoot ".tools\corepack"
$env:PATH = "$LocalNodeDir;$env:PATH"

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
  & $LocalNodeExe $LocalCorepack pnpm install --no-frozen-lockfile

  if ($LASTEXITCODE -ne 0) {
    throw "pnpm install failed with exit code $LASTEXITCODE"
  }
}
