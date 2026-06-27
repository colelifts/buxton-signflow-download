@echo off
cd /d "%~dp0"
start "Riftbound Dev Server" cmd /c "npm.cmd run dev -- --port 5173"
timeout /t 2 /nobreak >nul
start "" "http://127.0.0.1:5173/"
