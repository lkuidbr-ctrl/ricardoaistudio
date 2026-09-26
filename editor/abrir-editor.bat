@echo off
rem Abre o Ricardo AI Studio (interface visual) no navegador.
rem A logica fica no iniciar.ps1 (este arquivo nao muda nas atualizacoes).
cd /d "%~dp0"
title Ricardo AI Studio
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0iniciar.ps1"
pause
