@echo off
rem Lance Niche avec une fenetre visible qui reste ouverte : pour voir ce qui se passe quand le lancement silencieux ne marche pas.
cd /d "%~dp0"
echo === Diagnostic Niche (cette fenetre reste ouverte) ===
echo Dernieres lignes du journal du lanceur :
if exist "data\lanceur.log" powershell -NoProfile -Command "Get-Content 'data\lanceur.log' -Tail 25"
echo.
echo Dernieres lignes des erreurs du serveur :
if exist "data\niche.err.log" powershell -NoProfile -Command "Get-Content 'data\niche.err.log' -Tail 15"
echo.
echo === Lancement visible (chaque etape s'affiche ici et dans data\lanceur.log) ===
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0launch.ps1"
echo.
echo === Le lanceur a rendu la main (code %ERRORLEVEL%). Dernieres lignes du journal : ===
if exist "data\lanceur.log" powershell -NoProfile -Command "Get-Content 'data\lanceur.log' -Tail 15"
echo.
echo Cette fenetre reste ouverte : fais une capture et envoie-la.
pause
