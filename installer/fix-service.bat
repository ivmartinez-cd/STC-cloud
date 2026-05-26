@echo off
title Reparar Servicio STC Cloud Monitor
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0fix-service.ps1"
pause
