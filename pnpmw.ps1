$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$nodeDir = Join-Path $root ".tools\node-v22.22.1-win-x64"
$nodeExe = Join-Path $nodeDir "node.exe"
$corepack = Join-Path $nodeDir "node_modules\corepack\dist\corepack.js"

if (-not (Test-Path $nodeExe)) {
  throw "Local Node runtime not found at $nodeExe"
}

if (-not (Test-Path $corepack)) {
  throw "Local Corepack runtime not found at $corepack"
}

$env:COREPACK_HOME = Join-Path $root ".tools\corepack"
$env:PATH = "$nodeDir;$env:PATH"

Push-Location $root
try {
  & $nodeExe $corepack pnpm @args
} finally {
  Pop-Location
}
