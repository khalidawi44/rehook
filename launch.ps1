# Lanceur Niche (Windows). Lance par Niche.cmd.
# 1. met a jour le code depuis GitHub, 2. installe ce qui manque, 3. construit l'interface,
# 4. demarre le serveur, 5. ouvre le navigateur. Fermer cette fenetre arrete Niche.
$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $here
$host.UI.RawUI.WindowTitle = "Niche"
$port = 3001

function Say($m) { Write-Host ("[niche] " + $m) -ForegroundColor Green }
function Warn($m) { Write-Host ("[niche] " + $m) -ForegroundColor Yellow }

# Prerequis
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "Node.js est introuvable. Installe-le depuis https://nodejs.org (version 22 ou plus), puis relance." -ForegroundColor Red
  exit 1
}
$nodeMajor = [int]((node -v).TrimStart("v").Split(".")[0])
if ($nodeMajor -lt 22) { Write-Host "Node.js $(node -v) est trop ancien : il faut la version 22 ou plus." -ForegroundColor Red; exit 1 }

# Arrete une instance precedente qui garderait le port
try {
  $conn = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($conn) { Warn "Une instance tourne deja (PID $($conn.OwningProcess)) : arret."; Stop-Process -Id $conn.OwningProcess -Force -ErrorAction SilentlyContinue; Start-Sleep -Seconds 1 }
} catch {}

# Mise a jour depuis GitHub (le dossier niche/ est dans un depot git)
$updated = $false
if (Get-Command git -ErrorAction SilentlyContinue) {
  try {
    $branch = (git rev-parse --abbrev-ref HEAD 2>$null).Trim()
    if ($branch -and $branch -ne "HEAD") {
      Say "Verification des mises a jour ($branch)..."
      git fetch origin $branch 2>$null | Out-Null
      $local = (git rev-parse HEAD).Trim()
      $remote = (git rev-parse "origin/$branch").Trim()
      if ($local -ne $remote) {
        Say "Nouvelle version disponible : mise a jour."
        git reset --hard "origin/$branch" | Out-Null
        $updated = $true
      } else { Say "Niche est a jour." }
    }
  } catch { Warn "Mise a jour impossible (hors ligne ?) : on continue avec la version actuelle." }
} else { Warn "git introuvable : pas de mise a jour automatique." }

# Dependances et interface
if ($updated -or -not (Test-Path "node_modules")) { Say "Installation des dependances..."; npm install --no-audit --no-fund; if ($LASTEXITCODE -ne 0) { throw "npm install a echoue" } }
if ($updated -or -not (Test-Path "dist\index.html")) { Say "Construction de l'interface..."; npm run build; if ($LASTEXITCODE -ne 0) { throw "npm run build a echoue" } }

# Navigateur pour la decouverte TikTok (rapide si deja installe)
try { Say "Verification du navigateur de decouverte..."; npx playwright install chromium 2>&1 | Select-String -Pattern "Downloading|downloaded" | ForEach-Object { Say $_ } } catch { Warn "Playwright : $($_.Exception.Message)" }

# Fichier .env
if (-not (Test-Path ".env")) {
  Copy-Item ".env.example" ".env"
  Warn "Premier lancement : renseigne ANTHROPIC_API_KEY dans le fichier .env qui s'ouvre, enregistre, puis ferme le Bloc-notes."
  Start-Process -Wait notepad ".env"
}

# Demarrage
Say "Demarrage de Niche sur http://localhost:$port (ferme cette fenetre pour arreter)."
$env:PORT = "$port"
$proc = Start-Process -FilePath "cmd.exe" -ArgumentList "/c npx tsx src/server/index.ts" -NoNewWindow -PassThru
$ok = $false
for ($i = 0; $i -lt 60; $i++) {
  Start-Sleep -Milliseconds 500
  try { $r = Invoke-WebRequest -UseBasicParsing "http://localhost:$port/api/stats" -TimeoutSec 2; if ($r.StatusCode -eq 200) { $ok = $true; break } } catch {}
  if ($proc.HasExited) { break }
}
if ($ok) { Start-Process "http://localhost:$port" } else { Warn "Le serveur met du temps a repondre : ouvre http://localhost:$port a la main." }
Wait-Process -Id $proc.Id
