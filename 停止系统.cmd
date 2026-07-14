@echo off
setlocal
cd /d "%~dp0"
call ".\pnpmw.cmd" local:stop
endlocal
