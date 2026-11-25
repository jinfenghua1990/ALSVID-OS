@echo off
cd /d "%~dp0"
node scripts\start-v2-local.mjs %*
if errorlevel 1 exit /b 1
