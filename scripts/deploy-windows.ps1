param(
  [string]$AppDir = $env:DEPLOY_APP_DIR,
  [string]$ServiceName = $env:DEPLOY_SERVICE_NAME
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($AppDir)) {
  $AppDir = "C:\NEW\b2b-business-code"
}

if ([string]::IsNullOrWhiteSpace($ServiceName)) {
  $ServiceName = "B2BBusinessPortal"
}

$SourceDir = if ($env:GITHUB_WORKSPACE) { $env:GITHUB_WORKSPACE } else { (Resolve-Path ".").Path }
if (![System.IO.Path]::IsPathRooted($AppDir)) {
  throw "DEPLOY_APP_DIR must be a full Windows path like C:\NEW\b2b-business-code. Current value: $AppDir"
}
$AppDir = [System.IO.Path]::GetFullPath($AppDir)
$BackupDir = Join-Path $AppDir "backups"
$StorageDir = Join-Path $AppDir "storage"

Write-Host "B2B Business Portal Windows deploy"
Write-Host "Source: $SourceDir"
Write-Host "Target: $AppDir"
Write-Host "Service: $ServiceName"

New-Item -ItemType Directory -Force -Path $AppDir | Out-Null
New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null
New-Item -ItemType Directory -Force -Path $StorageDir | Out-Null

$envFile = Join-Path $AppDir ".env.production"
if (!(Test-Path $envFile)) {
  throw "Missing $envFile. Create it once on the server before first deploy."
}

$dbPath = Join-Path $AppDir "prisma\dev.db"
if (Test-Path $dbPath) {
  $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
  Copy-Item -LiteralPath $dbPath -Destination (Join-Path $BackupDir "dev-$stamp.db") -Force
  Write-Host "SQLite backup created."
}

$excludeDirs = @(".git", ".github", "node_modules", "storage", "release", "qa-output", "backups")
$excludeFiles = @(".env", ".env.production", "*.db", "*.db-journal", "*.db-wal", "*.db-shm")
$robocopyArgs = @($SourceDir, $AppDir, "/E", "/R:2", "/W:2", "/XD") + $excludeDirs + @("/XF") + $excludeFiles
robocopy @robocopyArgs
$robocopyExit = $LASTEXITCODE
if ($robocopyExit -gt 7) {
  throw "Robocopy failed with exit code $robocopyExit"
}

Push-Location $AppDir
try {
  npm install
  $env:DATABASE_URL = "file:./dev.db"
  npm run prisma:generate
  npm run db:init
  npm run build
  $env:NODE_ENV = "production"
  npm run prod:check
}
finally {
  Pop-Location
}

$service = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($service) {
  Restart-Service -Name $ServiceName -Force
  Write-Host "Service restarted: $ServiceName"
} else {
  Write-Host "Service $ServiceName not found. Start the app manually or install it as a Windows service."
}

Write-Host "Deployment completed."
