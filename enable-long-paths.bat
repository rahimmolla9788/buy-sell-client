@echo off
echo Enabling Windows Long Path support for React Native / Android build...
reg add "HKLM\SYSTEM\CurrentControlSet\Control\FileSystem" /v LongPathsEnabled /t REG_DWORD /d 1 /f
echo.
echo ========================================================
echo SUCCESS: Windows Long Path support is now ENABLED!
echo You can now run: npx expo run:android --device
echo ========================================================
pause
