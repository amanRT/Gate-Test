@echo off
rem Serves the exact offline copy of the original DVRUO portal (mirror\) on port 8766.
cd /d "%~dp0mirror"
where python >nul 2>nul
if errorlevel 1 (
  echo Python was not found - opening mirror\index.html directly instead.
  start "" "%~dp0mirror\index.html"
  exit /b 0
)
echo Serving the original-site mirror on http://127.0.0.1:8766/  (close this window to stop)
start "" "http://127.0.0.1:8766/index.html"
python -m http.server 8766 --bind 127.0.0.1
