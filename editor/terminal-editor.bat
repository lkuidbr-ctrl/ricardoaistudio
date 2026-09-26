@echo off
rem Abre um terminal na pasta do editor com o Python dos scripts ja ativado.
cd /d "%~dp0"
start "Terminal do Editor" powershell -NoExit -ExecutionPolicy Bypass -Command "& '%~dp0.venv\Scripts\Activate.ps1'; Write-Host ''; Write-Host 'Pronto! Exemplos:' -ForegroundColor Green; Write-Host '  python scripts/transcribe.py public/video.mp4'; Write-Host '  python scripts/clips.py public/live.mp4 --marca marca.json'; Write-Host '  ant auth login   (login no Claude)'; Write-Host ''"
