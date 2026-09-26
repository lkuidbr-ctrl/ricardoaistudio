@echo off
rem Abre o editor (Remotion Studio) no navegador.
cd /d "%~dp0"
echo Abrindo o editor... (deixe esta janela aberta enquanto estiver editando)
call npm run studio
pause
