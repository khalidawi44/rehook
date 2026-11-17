@echo off
rem Lanceur Rehook : double-clic. Tourne en arriere-plan (aucune fenetre), ouvre le navigateur une fois pret.
rem Journal : data\rehook.log. Pour arreter : Arreter-Rehook.cmd.
start "" /min powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0launch.ps1"
