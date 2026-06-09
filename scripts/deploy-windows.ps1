param(
  [string]$AppDir = $env:DEPLOY_APP_DIR,
  [string]$ServiceName = $env:DEPLOY_SERVICE_NAME,
  [string]$Pm2ProcessName = $env:DEPLOY_PM2_PROCESS_NAME
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($AppDir)) {
  $AppDir = "C:\NEW\b2b-business-code"
}

if ([string]::IsNullOrWhiteSpace($ServiceName)) {
  $ServiceName = "B2BBusinessPortal"
}

if ([string]::IsNullOrWhiteSpace($Pm2ProcessName)) {
  $Pm2ProcessName = $ServiceName
}

$SourceDir = if ($env:GITHUB_WORKSPACE) { $env:GITHUB_WORKSPACE } else { (Resolve-Path ".").Path }
if (![System.IO.Path]::IsPathRooted($AppDir)) {
  Write-Warning "DEPLOY_APP_DIR must be a full Windows path like C:\NEW\b2b-business-code. Current value: $AppDir. Using C:\NEW\b2b-business-code."
  $AppDir = "C:\NEW\b2b-business-code"
}
$AppDir = [System.IO.Path]::GetFullPath($AppDir)
$BackupDir = Join-Path $AppDir "backups"
$StorageDir = Join-Path $AppDir "storage"

Write-Host "B2B Business Portal Windows deploy"
Write-Host "Source: $SourceDir"
Write-Host "Target: $AppDir"
Write-Host "Service: $ServiceName"
Write-Host "PM2 process: $Pm2ProcessName"

New-Item -ItemType Directory -Force -Path $AppDir | Out-Null
New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null
New-Item -ItemType Directory -Force -Path $StorageDir | Out-Null

$envFile = Join-Path $AppDir ".env.production"
if (!(Test-Path $envFile)) {
  throw "Missing $envFile. Create it once on the server before first deploy."
}

$envContent = Get-Content -LiteralPath $envFile -Raw
$databaseUrlMatch = [regex]::Match($envContent, '(?m)^\s*DATABASE_URL\s*=\s*"?([^"`r`n]+)"?\s*$')
$databaseUrl = if ($databaseUrlMatch.Success) { $databaseUrlMatch.Groups[1].Value.Trim() } else { "file:./dev.db" }
$portMatch = [regex]::Match($envContent, '(?m)^\s*PORT\s*=\s*"?(\d+)"?\s*$')
$appPort = if ($portMatch.Success) { [int]$portMatch.Groups[1].Value } else { 4321 }
$dbRelativePath = if ($databaseUrl.StartsWith("file:")) { $databaseUrl.Substring(5) } else { "" }
$dbPath = if ($dbRelativePath) {
  if ([System.IO.Path]::IsPathRooted($dbRelativePath)) {
    $dbRelativePath
  } else {
    Join-Path (Join-Path $AppDir "prisma") $dbRelativePath
  }
} else {
  Join-Path $AppDir "prisma\dev.db"
}

if (Test-Path $dbPath) {
  $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
  Copy-Item -LiteralPath $dbPath -Destination (Join-Path $BackupDir "dev-$stamp.db") -Force
  Write-Host "SQLite backup created before database-safe migration."
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
  Copy-Item -LiteralPath ".env.production" -Destination ".env" -Force
  npm ci
  npm run prisma:generate
  Write-Host "Running migration-safe SQLite initialization using .env.production DATABASE_URL."
  npm run db:init
  Write-Host "Skipping prisma db push for production SQLite. db:init handles safe schema setup without dropping unique indexes."
  npm run build
  $env:NODE_ENV = "production"
  if ($env:RUN_PRODUCTION_CHECK -eq "true") {
    npm run prod:check
  } else {
    Write-Host "Skipping strict production readiness check. Set RUN_PRODUCTION_CHECK=true to enable it."
  }
}
finally {
  Pop-Location
}

$pm2 = Get-Command "pm2.cmd" -ErrorAction SilentlyContinue
if (!$pm2) {
  Write-Host "PM2 not found. Installing PM2 globally with npm."
  npm install -g pm2
  $pm2 = Get-Command "pm2.cmd" -ErrorAction SilentlyContinue
}

if ($pm2) {
  Push-Location $AppDir
  try {
    $env:NODE_ENV = "production"
    $existingPm2 = & $pm2.Source jlist | ConvertFrom-Json | Where-Object { $_.name -eq $Pm2ProcessName } | Select-Object -First 1
    if ($existingPm2) {
      & $pm2.Source restart $Pm2ProcessName --update-env
      Write-Host "PM2 process restarted: $Pm2ProcessName"
    } else {
      $listener = Get-NetTCPConnection -LocalPort $appPort -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
      if ($listener) {
        $listenerProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $($listener.OwningProcess)" -ErrorAction SilentlyContinue
        if ($listenerProcess -and $listenerProcess.Name -eq "node.exe") {
          Write-Host "Stopping existing Node listener on port $appPort before first PM2 start."
          Stop-Process -Id $listener.OwningProcess -Force
          Start-Sleep -Seconds 2
        } else {
          throw "Port $appPort is already in use by process $($listener.OwningProcess). Stop it before PM2 start."
        }
      }
      & $pm2.Source start npm --name $Pm2ProcessName -- run start:prod
      Write-Host "PM2 process started: $Pm2ProcessName"
    }
    & $pm2.Source save
    Write-Host "PM2 process list saved."
  }
  finally {
    Pop-Location
  }
} else {
  $service = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
  if ($service) {
    Restart-Service -Name $ServiceName -Force
    Write-Host "Service restarted: $ServiceName"
  } else {
    Write-Host "PM2 and service $ServiceName are not available. Start the app manually or install PM2/Windows service."
  }
}

Write-Host "Deployment completed."
