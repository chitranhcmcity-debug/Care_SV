@echo off
chcp 65001 >nul
title HE THONG QUAN LY DIEM DANH ITC CARE

echo ===================================================================
echo   ITC CARE - HE THONG QUAN LY DIEM DANH SINH VIEN
echo ===================================================================
echo.

echo [1/3] Dang xac dinh dia chi IP noi bo (LAN/Wi-Fi)...
set "LOCAL_IP=192.168.35.70"
for /f "tokens=*" %%i in ('powershell -NoProfile -Command "(Get-NetIPAddress -AddressFamily IPv4 -InterfaceAlias 'Wi-Fi*').IPAddress"') do set "LOCAL_IP=%%i"

echo [2/3] Khoi dong Backend API ^& Frontend UI...
start "ITC Backend API" /min /D "%~dp0backend" cmd /k "npm run dev"
start "ITC Frontend UI" /min /D "%~dp0frontend" cmd /k "npm start"

echo [3/3] Dang cho he thong bien dich xong va mo trinh duyet...
powershell -NoProfile -Command "1..30 | ForEach-Object { if (Test-NetConnection -ComputerName 127.0.0.1 -Port 4201 -InformationLevel Quiet -WarningAction SilentlyContinue) { break }; Start-Sleep -Seconds 1 }"

powershell -NoProfile -Command "Start-Process 'http://localhost:4201'"

echo.
echo ===================================================================
echo                    HE THONG DA SAN SANG!
echo ===================================================================
echo.
echo  [PC] DANG TRUY CAP TREN MAY TINH (PC):
echo     - http://localhost:4201
echo     - http://%LOCAL_IP%:4201
echo.
echo  [MOBILE] DUONG LINK TRUY CAP BANG DIEN THOAI (MOBILE):
echo     - http://%LOCAL_IP%:4201
echo.
echo ===================================================================
echo  HUONG DAN KET NOI DIEN THOAI:
echo  1. Ket noi Dien thoai va May tinh vao CUNG MANG WI-FI (hoac LAN).
echo  2. Mo trinh duyet tren dien thoai (Chrome / Safari / Zalo).
echo  3. Nhap chinh xac dia chi: http://%LOCAL_IP%:4201
echo.
echo  Luu y: Vui long giu cua so nay va 2 cua so phu chay ngam.
echo ===================================================================
echo.

echo Nhan pham bat ky de thoat bang dieu khien (he thong van tiep tuc chay ngam)...
pause >nul
