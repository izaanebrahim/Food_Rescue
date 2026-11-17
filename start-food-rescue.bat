@echo off
title Food Rescue
cd /d "%~dp0"

echo.
echo  ===== Food Rescue =====
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo  Node.js was not found. Install it from https://nodejs.org and run this again.
  pause
  exit /b 1
)

rem --- 1. Database password (asked once, saved in server\.env) ---
if not exist "server\.env" (
  echo  First run: Food Rescue needs your MySQL root password.
  powershell -NoProfile -Command "$p = Read-Host '  MySQL root password'; $t = (Get-Content 'server\.env.example' -Raw).Replace('your_mysql_password', $p).Replace('replace-with-any-long-random-text', [guid]::NewGuid().ToString('N')); Set-Content -Path 'server\.env' -Value $t -NoNewline"
  echo.
)

rem --- 2. Packages (first run only) ---
if not exist "node_modules" goto install
if not exist "server\node_modules" goto install
if not exist "client\node_modules" goto install
goto database

:install
echo  Installing packages. This takes a minute or two the first time...
call npm run setup
if errorlevel 1 (
  echo.
  echo  Installing packages failed. Check your internet connection and run this again.
  pause
  exit /b 1
)

rem --- 3. Database with demo data (first run only) ---
:database
if exist "server\.db-ready" goto run
echo.
echo  Creating the food_rescue database with demo data...
call npm run db:setup
if errorlevel 1 (
  echo.
  echo  The database could not be created. If the password was wrong, run this again
  echo  and enter it again. Also check that the MySQL80 service is running.
  del "server\.env" >nul 2>nul
  pause
  exit /b 1
)
type nul > "server\.db-ready"

rem --- 4. Start the API and the web app, then open the browser ---
:run
echo.
echo  Starting Food Rescue. The browser opens at http://localhost:5173
echo  Keep this window open while you use the app. Close it to stop.
echo.
start "" cmd /c "timeout /t 8 /nobreak >nul & start http://localhost:5173"
call npm run dev
pause
