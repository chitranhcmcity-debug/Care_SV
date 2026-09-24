@echo off
chcp 65001 >nul
title ITC CARE
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Khong tim thay Node.js. Hay cai Node.js 24 va mo lai.
  pause
  exit /b 1
)
node scripts/start-dev.cjs
if errorlevel 1 (
  echo.
  echo Khoi dong that bai. Xem thong bao loi o tren.
  pause
  exit /b 1
)
