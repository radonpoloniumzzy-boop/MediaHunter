$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "ensure-local-deps.ps1") -RequiredPaths @(
  "apps\api\node_modules\tsx\dist\cli.mjs"
)

& $PnpmExecutable @PnpmPrefix --filter @lan-ting/api dev
