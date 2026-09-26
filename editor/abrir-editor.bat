@echo off
rem Abre o Ricardo AI Studio (interface visual) no navegador.
cd /d "%~dp0"
title Ricardo AI Studio
echo Abrindo o Ricardo AI Studio... (deixe esta janela aberta enquanto estiver usando)
call npm run app
pause
