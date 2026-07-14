$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "ensure-local-deps.ps1") -RequiredPaths @(
  "apps\web\node_modules\vite\bin\vite.js"
)

& $LocalNodeExe $LocalCorepack pnpm --filter @lan-ting/web dev
