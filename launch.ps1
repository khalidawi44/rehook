# Lanceur Niche (Windows), lance par Niche.cmd sans fenetre.
# 1. met a jour le code depuis GitHub, 2. installe ce qui manque, 3. construit l'interface,
# 4. demarre le serveur en arriere-plan, 5. ouvre le navigateur des que l'API repond.
# Tout est journalise dans data\niche.log. Arreter-Niche.cmd arrete le serveur.
$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $here
$port = 3001
$url = "http://localhost:$port"
New-Item -ItemType Directory -Force -Path "data" | Out-Null
$log = Join-Path $here "data\niche.log"
$launcherLog = Join-Path $here "data\lanceur.log"
"==== $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') lancement" | Out-File -Append -Encoding utf8 $launcherLog

function Say($m) { ("[{0}] {1}" -f (Get-Date -Format 'HH:mm:ss'), $m) | Out-File -Append -Encoding utf8 $launcherLog }
function Fail($m) {
  Say ("ERREUR : " + $m)
  Add-Type -AssemblyName System.Windows.Forms
  [System.Windows.Forms.MessageBox]::Show("$m`n`nDetails dans :`n$launcherLog", "Niche", "OK", "Error") | Out-Null
  exit 1
}

function Listening() {
  try { return (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1) } catch { return $null }
}
function ApiUp() {
  try { $r = Invoke-WebRequest -UseBasicParsing "$url/api/stats" -TimeoutSec 2; return ($r.StatusCode -eq 200) } catch { return $false }
}

try {
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Fail "Node.js est introuvable. Installe-le depuis https://nodejs.org (version 22 ou plus), puis relance." }
  $nodeMajor = [int]((node -v).TrimStart("v").Split(".")[0])
  if ($nodeMajor -lt 22) { Fail "Node.js $(node -v) est trop ancien : il faut la version 22 ou plus." }

  # Mise a jour depuis GitHub
  $updated = $false
  if (Get-Command git -ErrorAction SilentlyContinue) {
    try {
      $branch = (git rev-parse --abbrev-ref HEAD 2>$null).Trim()
      if ($branch -and $branch -ne "HEAD") {
        git fetch origin $branch 2>&1 | Out-Null
        $local = (git rev-parse HEAD).Trim()
        $remote = (git rev-parse "origin/$branch").Trim()
        if ($local -ne $remote) {
          Say "Mise a jour : $local -> $remote"
          git reset --hard "origin/$branch" 2>&1 | Out-File -Append -Encoding utf8 $launcherLog
          $updated = $true
        } else { Say "A jour ($branch)." }
      }
    } catch { Say "Mise a jour impossible (hors ligne ?) : $($_.Exception.Message)" }
  } else { Say "git introuvable : pas de mise a jour automatique." }

  # Deja en route et a jour : on ouvre juste le navigateur.
  $running = Listening
  if ($running -and -not $updated -and (ApiUp)) {
    Say "Niche tourne deja : ouverture du navigateur."
    Start-Process $url
    exit 0
  }
  if ($running) {
    Say "Arret de l'instance precedente (PID $($running.OwningProcess))."
    Stop-Process -Id $running.OwningProcess -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 1
  }

  if ($updated -or -not (Test-Path "node_modules")) {
    Say "npm install..."
    cmd /c "npm install --no-audit --no-fund" 2>&1 | Out-File -Append -Encoding utf8 $launcherLog
    if ($LASTEXITCODE -ne 0) { Fail "npm install a echoue." }
  }
  if ($updated -or -not (Test-Path "dist\index.html")) {
    Say "npm run build..."
    cmd /c "npm run build" 2>&1 | Out-File -Append -Encoding utf8 $launcherLog
    if ($LASTEXITCODE -ne 0) { Fail "La construction de l'interface a echoue." }
  }
  try { cmd /c "npx playwright install chromium" 2>&1 | Out-File -Append -Encoding utf8 $launcherLog } catch { Say "Playwright : $($_.Exception.Message)" }

  if (-not (Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.MessageBox]::Show("Premier lancement : le fichier .env va s'ouvrir. Renseigne ANTHROPIC_API_KEY, enregistre, puis ferme le Bloc-notes.", "Niche", "OK", "Information") | Out-Null
    Start-Process -Wait notepad ".env"
  }

  Say "Demarrage du serveur."
  $env:PORT = "$port"
  $proc = Start-Process -FilePath "cmd.exe" -ArgumentList "/c npx tsx src/server/index.ts" -WindowStyle Hidden -PassThru -RedirectStandardOutput $log -RedirectStandardError (Join-Path $here "data\niche.err.log")
  $ok = $false
  for ($i = 0; $i -lt 120; $i++) {
    Start-Sleep -Milliseconds 500
    if (ApiUp) { $ok = $true; break }
    if ($proc.HasExited) { break }
  }
  if ($ok) { Say "Pret : ouverture de $url"; Start-Process $url } else { Fail "Le serveur n'a pas demarre. Regarde data\niche.err.log." }
  Wait-Process -Id $proc.Id
  Say "Serveur arrete."
} catch {
  Fail $_.Exception.Message
}
