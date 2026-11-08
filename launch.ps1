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
"==== $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') lancement depuis $here" | Out-File -Append -Encoding utf8 $launcherLog
Write-Host "Niche : lancement depuis $here (journal : $launcherLog)"

function Say($m) {
  $line = ("[{0}] {1}" -f (Get-Date -Format 'HH:mm:ss'), $m)
  $line | Out-File -Append -Encoding utf8 $launcherLog
  Write-Host $line
}
# git ecrit sa progression sur stderr : on passe par cmd pour que PowerShell ne le prenne pas pour une erreur.
function Git([string]$arguments) {
  $out = cmd /c "git $arguments 2>&1"
  $script:gitExit = $LASTEXITCODE
  return ($out | Out-String).Trim()
}
# Idem pour npm et npx : leurs avertissements passent par stderr, ce n'est pas une erreur.
function Run([string]$commandLine) {
  $out = cmd /c "$commandLine 2>&1"
  $script:runExit = $LASTEXITCODE
  ($out | Out-String) | Out-File -Append -Encoding utf8 $launcherLog
  return $script:runExit
}
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

# Raccourci « Niche » sur le Bureau, toujours pointe vers CE dossier (un vieux raccourci vers un
# ancien emplacement lancait une autre copie).
function RefreshShortcut() {
  try {
    $desktop = [Environment]::GetFolderPath("Desktop")
    $lnk = Join-Path $desktop "Niche.lnk"
    $target = Join-Path $here "Niche.cmd"
    $shell = New-Object -ComObject WScript.Shell
    $sc = $shell.CreateShortcut($lnk)
    if ($sc.TargetPath -ne $target) {
      $sc.TargetPath = $target
      $sc.WorkingDirectory = $here
      $sc.Description = "Niche : veille TikTok et montage"
      $icon = Join-Path $here "public\icons\niche.ico"
      if (Test-Path $icon) { $sc.IconLocation = $icon }
      $sc.Save()
      Say "Raccourci du Bureau mis a jour : $lnk -> $target"
    }
  } catch {
    Say "Raccourci du Bureau : $($_.Exception.Message)"
  }
}

try {
  RefreshShortcut
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Fail "Node.js est introuvable. Installe-le depuis https://nodejs.org (version 22 ou plus), puis relance." }
  $nodeMajor = [int]((node -v).TrimStart("v").Split(".")[0])
  if ($nodeMajor -lt 22) { Fail "Node.js $(node -v) est trop ancien : il faut la version 22 ou plus." }

  # Mise a jour depuis GitHub
  $updated = $false
  if (Get-Command git -ErrorAction SilentlyContinue) {
    $branch = Git "rev-parse --abbrev-ref HEAD"
    if ($gitExit -eq 0 -and $branch -and $branch -ne "HEAD") {
      $fetch = Git "fetch origin $branch"
      if ($gitExit -ne 0) { Say "Mise a jour impossible (hors ligne ?) : $fetch" }
      else {
        $local = Git "rev-parse HEAD"
        $remote = Git "rev-parse origin/$branch"
        if ($local -ne $remote) {
          Say "Mise a jour : $local -> $remote"
          $reset = Git "reset --hard origin/$branch"
          Say $reset
          if ($gitExit -eq 0) { $updated = $true } else { Say "Echec de la mise a jour, on garde la version actuelle." }
        } else { Say "A jour ($branch, $($local.Substring(0,7)))." }
      }
    } else { Say "Branche git introuvable : pas de mise a jour automatique ($branch)." }
  } else { Say "git introuvable : pas de mise a jour automatique." }

  # Relance par la mise a jour depuis l'outil : on attend que l'ancien serveur libere le port.
  $restart = ($env:NICHE_RESTART -eq "1")
  if ($restart) {
    Say "Relance apres mise a jour depuis l'outil."
    for ($i = 0; $i -lt 60; $i++) { if (-not (Listening)) { break }; Start-Sleep -Milliseconds 500 }
  }
  # Deja en route et a jour : on ouvre juste le navigateur.
  $running = Listening
  if ($running -and -not $updated -and (ApiUp)) {
    Say "Niche tourne deja : ouverture du navigateur."
    Start-Process $url
    return
  }
  if ($running) {
    Say "Arret de l'instance precedente (PID $($running.OwningProcess))."
    Stop-Process -Id $running.OwningProcess -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 1
  }

  # Dependances : reinstallees quand package-lock.json a change (marqueur dans node_modules).
  $lockHash = (Get-FileHash package-lock.json -Algorithm SHA256).Hash
  $lockMarker = "node_modules\.niche-lock"
  $lockKnown = if (Test-Path $lockMarker) { (Get-Content $lockMarker -Raw).Trim() } else { "" }
  if ($updated -or -not (Test-Path "node_modules") -or $lockKnown -ne $lockHash) {
    Say "npm install..."
    if ((Run "npm install --no-audit --no-fund") -ne 0) { Fail "npm install a echoue (voir le journal)." }
    $lockHash | Out-File -Encoding ascii $lockMarker
  }
  # Interface : reconstruite quand elle ne correspond pas au code courant (marqueur dans dist).
  $head = Git "rev-parse HEAD"
  $buildKey = "$head"
  $buildMarker = "dist\.niche-build"
  $buildKnown = if (Test-Path $buildMarker) { (Get-Content $buildMarker -Raw).Trim() } else { "" }
  if ($updated -or -not (Test-Path "dist\index.html") -or $buildKnown -ne $buildKey) {
    Say "npm run build..."
    if ((Run "npm run build") -ne 0) { Fail "La construction de l'interface a echoue (voir le journal)." }
    $buildKey | Out-File -Encoding ascii $buildMarker
  }
  if ((Run "npx playwright install chromium") -ne 0) { Say "Playwright : installation du navigateur impossible pour l'instant (la decouverte TikTok attendra)." }

  if (-not (Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.MessageBox]::Show("Premier lancement : le fichier .env va s'ouvrir. Renseigne ANTHROPIC_API_KEY, enregistre, puis ferme le Bloc-notes.", "Niche", "OK", "Information") | Out-Null
    Start-Process -Wait notepad ".env"
  }

  Say "Demarrage du serveur (arret automatique 2 min apres la fermeture du dernier onglet)."
  $env:PORT = "$port"
  $env:NICHE_AUTO_EXIT = "1"
  $proc = Start-Process -FilePath "cmd.exe" -ArgumentList "/c npx tsx src/server/index.ts" -WindowStyle Hidden -PassThru -RedirectStandardOutput $log -RedirectStandardError (Join-Path $here "data\niche.err.log")
  $null = $proc.Handle
  $ok = $false
  for ($i = 0; $i -lt 120; $i++) {
    Start-Sleep -Milliseconds 500
    if (ApiUp) { $ok = $true; break }
    if ($proc.HasExited) { break }
  }
  if (-not $ok) { Fail "Le serveur n'a pas demarre. Regarde data\niche.err.log." }
  # Apres une mise a jour depuis l'outil, l'onglet deja ouvert se recharge tout seul : pas de nouvel onglet.
  if ($restart) { Say "Pret apres mise a jour (onglet existant)." } else { Say "Pret : ouverture de $url"; Start-Process $url }
  # Mise a jour depuis l'outil : le serveur relance ce lanceur lui-meme (NICHE_RESTART=1) puis s'arrete.
  $proc.WaitForExit()
  $code = $proc.ExitCode
  Say "Serveur arrete (code $code)."
  if ($code -ne 0 -and $code -ne 75 -and -not (Listening)) {
    $tail = ""
    $errLog = Join-Path $here "data\niche.err.log"
    if (Test-Path $errLog) { $tail = ((Get-Content $errLog -Tail 12) -join "`n") }
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.MessageBox]::Show("Niche s'est arrete tout seul (code $code).`n`nDernieres erreurs :`n$tail`n`nJournal complet : $errLog", "Niche", "OK", "Warning") | Out-Null
  }
} catch {
  Fail $_.Exception.Message
}
