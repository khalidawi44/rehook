@echo off
rem Cree (ou corrige) le raccourci "Rehook" sur le Bureau, vers CE dossier.
powershell -NoProfile -ExecutionPolicy Bypass -Command "$here = '%~dp0'.TrimEnd('\\'); $lnk = Join-Path ([Environment]::GetFolderPath('Desktop')) 'Rehook.lnk'; $s = (New-Object -ComObject WScript.Shell).CreateShortcut($lnk); $s.TargetPath = Join-Path $here 'Rehook.cmd'; $s.WorkingDirectory = $here; $s.Description = 'Rehook : veille TikTok et montage'; $ico = Join-Path $here 'public\icons\rehook.ico'; if (Test-Path $ico) { $s.IconLocation = $ico }; $s.Save(); Write-Host ('Raccourci cree : ' + $lnk + ' -> ' + $s.TargetPath)"
pause
