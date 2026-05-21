param(
  [string]$AdminEmail = "admin@example.com",
  [string]$AdminPassword = "ChangeMe123!",
  [int]$ApiPort = 4321,
  [switch]$ResetDatabase
)

$ErrorActionPreference = "Stop"

function New-Secret {
  param([int]$Bytes = 48)
  $buffer = New-Object byte[] $Bytes
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $rng.GetBytes($buffer)
  } finally {
    $rng.Dispose()
  }
  return [Convert]::ToBase64String($buffer)
}

$projectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $projectRoot

Write-Host ""
Write-Host "B2B Business local Windows setup" -ForegroundColor Cyan
Write-Host "Project: $projectRoot"
Write-Host ""

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "Node.js is not installed. Install Node.js LTS first, then run this script again."
}

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  throw "npm is not available. Reinstall Node.js LTS and make sure npm is selected."
}

$jwtSecret = New-Secret
$appOrigin = "http://127.0.0.1:$ApiPort"
$envProductionPath = Join-Path $projectRoot ".env.production"

$envContent = @"
NODE_ENV="production"
DATABASE_URL="file:./dev.db"
JWT_SECRET="$jwtSecret"
ADMIN_EMAIL="$AdminEmail"
ADMIN_PASSWORD="$AdminPassword"
API_PORT="$ApiPort"
VITE_API_URL="$appOrigin"
APP_ORIGIN="$appOrigin"
TRUST_PROXY="false"
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""
GOOGLE_REDIRECT_URI="$appOrigin/api/email-integrations/oauth/callback"
GMAIL_TOKEN_ENCRYPTION_KEY="$(New-Secret)"
"@

Set-Content -LiteralPath $envProductionPath -Value $envContent -Encoding UTF8
Write-Host "Created .env.production with a fresh JWT secret." -ForegroundColor Green

Write-Host "Installing packages..."
npm install

Write-Host "Generating Prisma client..."
npm run prisma:generate

Write-Host "Preparing SQLite database..."
if ($ResetDatabase) {
  npm run db:init -- --reset
} else {
  npm run db:init
}

Write-Host "Seeding admin user, companies, products, stock, and settings..."
$env:NODE_ENV = "production"
$env:ADMIN_EMAIL = $AdminEmail
$env:ADMIN_PASSWORD = $AdminPassword
npm run seed

Write-Host "Building frontend..."
npm run build

Write-Host ""
Write-Host "Setup complete." -ForegroundColor Green
Write-Host "Start command: npm run start:prod" -ForegroundColor Cyan
Write-Host "URL: $appOrigin" -ForegroundColor Cyan
Write-Host "Login user: $AdminEmail" -ForegroundColor Cyan
Write-Host "Login password: $AdminPassword" -ForegroundColor Cyan
Write-Host ""
Write-Host "Keep .env.production private. It contains the JWT secret and admin password." -ForegroundColor Yellow
