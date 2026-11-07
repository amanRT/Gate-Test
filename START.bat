@echo off
rem Divya's GATE Prep - opens the practice app through a small local web server.
rem (You can also just double-click index.html; this is only a fallback.)
cd /d "%~dp0"
where python >nul 2>nul
if errorlevel 1 (
  echo Python was not found - opening index.html directly instead.
  start "" "%~dp0index.html"
  exit /b 0
)
echo Starting Divya's GATE Prep on http://127.0.0.1:8765/  (close this window to stop)
start "" "http://127.0.0.1:8765/index.html"
python -m http.server 8765 --bind 127.0.0.1
