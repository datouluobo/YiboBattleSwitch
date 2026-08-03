@echo off
setlocal
set "PROJECT_ROOT=%~dp0"
powershell -NoProfile -WindowStyle Hidden -Command "Start-Process -FilePath 'cmd.exe' -ArgumentList '/c','npm run start' -WorkingDirectory $env:PROJECT_ROOT -WindowStyle Hidden"
endlocal
