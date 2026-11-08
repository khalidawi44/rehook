@echo off
rem Cree (ou corrige) le raccourci "Niche" sur le Bureau, vers CE dossier.
powershell -NoProfile -ExecutionPolicy Bypass -Command "$here = '%~dp0'.TrimEnd('\\'); $lnk = Join-Path ([Environment]::GetFolderPath('Desktop')) 'Niche.lnk'; $s = (New-Object -ComObject WScript.Shell).CreateShortcut($lnk); $s.TargetPath = Join-Path $here 'Niche.cmd'; $s.WorkingDirectory = $here; $s.Description = 'Niche : veille TikTok et montage'; $ico = Join-Path $here 'public\icons\niche.ico'; if (Test-Path $ico) { $s.IconLocation = $ico }; $s.Save(); Write-Host ('Raccourci cree : ' + $lnk + ' -> ' + $s.TargetPath)"
pause
