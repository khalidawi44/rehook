@echo off
rem Arrete Niche (le serveur qui ecoute sur le port 3001).
powershell -NoProfile -ExecutionPolicy Bypass -Command "$c = Get-NetTCPConnection -LocalPort 3001 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1; if ($c) { Stop-Process -Id $c.OwningProcess -Force; Write-Host 'Niche arrete.' } else { Write-Host 'Niche ne tournait pas.' }"
timeout /t 2 >nul
