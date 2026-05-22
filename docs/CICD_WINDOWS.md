# Windows Server CI/CD

This repo can deploy from GitHub Actions to a Windows Server using a GitHub self-hosted runner.

## 1. Prepare The Server

Install on the Windows Server:

```powershell
winget install OpenJS.NodeJS.LTS Git.Git
```

Create the app folder:

```powershell
New-Item -ItemType Directory -Force C:\NEW\b2b-business-code
```

Copy `.env.production.example` to:

```text
C:\NEW\b2b-business-code\.env.production
```

Set production values inside `.env.production`, especially:

```text
NODE_ENV=production
APP_ORIGIN=http://192.168.1.34:4321
JWT_SECRET=<strong secret>
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=<strong password>
```

Keep email app passwords only in this server file or in the app database settings. Do not commit them to GitHub.

## 2. Install GitHub Self-Hosted Runner

In GitHub open:

```text
Settings > Actions > Runners > New self-hosted runner > Windows
```

Run the GitHub commands on the server. When labels are requested, add:

```text
b2b-production
```

Install it as a service:

```powershell
.\svc.cmd install
.\svc.cmd start
```

If PowerShell says `svc.cmd` is not found, use the exact service commands shown by GitHub for the downloaded runner version.

## 3. Add Repository Variables

In GitHub open:

```text
Settings > Secrets and variables > Actions > Variables
```

Add:

```text
DEPLOY_APP_DIR=C:\NEW\b2b-business-code
DEPLOY_SERVICE_NAME=B2BBusinessPortal
```

## 4. First Deployment

Push to `main`, or run manually:

```text
Actions > Deploy Windows Server > Run workflow
```

The workflow will:

- run tests on GitHub-hosted Windows
- build the app
- run deployment on your Windows Server runner
- backup SQLite before deployment
- copy latest code to `C:\NEW\b2b-business-code`
- install dependencies
- generate Prisma client
- initialize database columns
- build frontend
- restart `B2BBusinessPortal` service if it exists

## 5. Run As Windows Service

The deploy script restarts an existing service named `B2BBusinessPortal`. If you have not created it yet, install a service runner such as NSSM and create a service that runs:

```text
Program: C:\Program Files\nodejs\npm.cmd
Arguments: run start:prod
Startup directory: C:\NEW\b2b-business-code
```

Then start:

```powershell
Start-Service B2BBusinessPortal
```

After this, every push to `main` will deploy and restart the service.

## 6. Server URL

Open from LAN:

```text
http://192.168.1.34:4321
```

If another machine cannot open it, allow port `4321` in Windows Firewall.
