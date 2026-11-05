@echo off
rem Lanceur Niche : double-clic, mise a jour automatique, demarrage, ouverture du navigateur.
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0launch.ps1"
if errorlevel 1 pause
