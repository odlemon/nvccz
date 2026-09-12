@echo off
set MYSQL_BIN=C:\Program Files\MySQL\MySQL Server 8.4\bin
set INI=C:\mysql-local-data\my.ini
netstat -ano | findstr ":3306" | findstr LISTENING >nul
if %ERRORLEVEL%==0 (
  echo MySQL already listening on 3306
  exit /b 0
)
echo Starting local MySQL...
start "mysqld-local" /MIN "%MYSQL_BIN%\mysqld.exe" --defaults-file=%INI% --console
timeout /t 3 >nul
echo Done. Check port 3306.
