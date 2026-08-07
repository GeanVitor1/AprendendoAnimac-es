@echo off
rem AMOUDO site - starts the local server and opens the browser
start /min "" node "%~dp0serve.js"
timeout /t 2 /nobreak >nul
start "" http://localhost:8787
