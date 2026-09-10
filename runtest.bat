@echo off
cd /d "%~dp0"
del diag.txt 2>nul
echo Running full MongoDB connection diagnostic. Please wait ~30s...
node diag.js
echo.
echo Done. The result was written to diag.txt in this folder.
echo Open diag.txt and copy its contents to send back.
pause