@echo off
cd /d "%~dp0"
node "%~dp0planwharf.cjs" %*
if errorlevel 1 pause
