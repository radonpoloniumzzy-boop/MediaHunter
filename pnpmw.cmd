@echo off
setlocal
powershell -ExecutionPolicy Bypass -File "%~dp0pnpmw.ps1" %*
