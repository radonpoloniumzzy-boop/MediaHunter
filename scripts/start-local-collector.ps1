$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "ensure-local-deps.ps1") -RequiredPaths @(
  "apps\api\node_modules\tsx\dist\cli.mjs"
)

& $LocalNodeExe $LocalCorepack pnpm --filter @lan-ting/api worker
