@echo off
rem Instalador de um clique do editor de videos (Windows 10/11).
rem De dois cliques neste arquivo. Se o Windows avisar "O Windows protegeu o computador",
rem clique em "Mais informacoes" e depois em "Executar assim mesmo".
cd /d "%~dp0editor"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0editor\instalar.ps1"
pause
