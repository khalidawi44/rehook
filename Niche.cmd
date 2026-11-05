@echo off
rem Lanceur Niche : double-clic. Tourne en arriere-plan (aucune fenetre), ouvre le navigateur une fois pret.
rem Journal : data\niche.log. Pour arreter : Arreter-Niche.cmd.
start "" /min powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0launch.ps1"
