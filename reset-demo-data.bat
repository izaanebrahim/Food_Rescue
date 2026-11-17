@echo off
title Food Rescue - reset demo data
cd /d "%~dp0"
echo.
echo  This deletes everything in the food_rescue database and loads fresh demo data.
echo  Use it before a review or demo.
echo.
pause
call npm run db:setup
pause
