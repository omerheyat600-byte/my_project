@echo off
setlocal

echo ==========================================
echo   EduAdmin - Build Windows EXE
echo ==========================================
echo.

REM ---------------------------------------------------------
REM 1. Make sure Python is on PATH
REM ---------------------------------------------------------
where python >nul 2>nul
if errorlevel 1 (
    echo ERROR: Python was not found on PATH.
    echo Install Python 3.10+ from https://python.org and make sure
    echo "Add python.exe to PATH" is checked during installation.
    pause
    exit /b 1
)

REM ---------------------------------------------------------
REM 2. Create a dedicated virtual environment for the build
REM    (keeps PyInstaller/deps separate from any other Python
REM    installs on this machine)
REM ---------------------------------------------------------
if not exist build_venv (
    echo Creating virtual environment...
    python -m venv build_venv
)

call build_venv\Scripts\activate.bat

REM ---------------------------------------------------------
REM 3. Install dependencies + PyInstaller
REM ---------------------------------------------------------
echo Installing dependencies...
python -m pip install --upgrade pip >nul
pip install -r requirements.txt
pip install pyinstaller

REM ---------------------------------------------------------
REM 4. Clean any previous build output
REM ---------------------------------------------------------
if exist build rmdir /s /q build
if exist dist rmdir /s /q dist
if exist EduAdmin.spec del /q EduAdmin.spec

REM ---------------------------------------------------------
REM 5. Build EduAdmin.exe
REM    --add-data bundles the static/ folder (HTML/CSS/JS) INTO
REM    the exe itself, since that's app code, not user data.
REM ---------------------------------------------------------
echo.
echo Building EduAdmin.exe ...
pyinstaller --onefile --name EduAdmin --add-data "static;static" run.py

if not exist dist\EduAdmin.exe (
    echo.
    echo BUILD FAILED - scroll up to see the error from PyInstaller.
    pause
    exit /b 1
)

REM ---------------------------------------------------------
REM 6. Copy the files EduAdmin needs NEXT TO the exe (not bundled
REM    inside it) so your database, license, and secret key stay
REM    editable and persist across rebuilds/updates.
REM ---------------------------------------------------------
echo.
echo Copying required files next to the exe...
if exist .env         copy /y .env         dist\.env         >nul
if exist license.key  copy /y license.key  dist\license.key  >nul

REM NOTE: this app now stores its data in MySQL (see .env for
REM MYSQL_HOST / MYSQL_PORT / MYSQL_USER / MYSQL_PASSWORD / MYSQL_DB)
REM instead of a local school.db file, so there's nothing database-
REM related left to copy next to the exe — just .env and license.key.

echo.
echo ==========================================
echo   BUILD COMPLETE
echo   Your app is at:  dist\EduAdmin.exe
echo.
echo   Run EduAdmin.exe from INSIDE the "dist"
echo   folder (don't move just the .exe file by
echo   itself - it needs .env / license.key next
echo   to it, and a reachable MySQL server per the
echo   MYSQL_* settings in .env).
echo ==========================================
pause
