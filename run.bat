@echo off
setlocal EnableExtensions EnableDelayedExpansion
title MIX Engine - Tauri Desktop Launcher (HMR)
cd /d "%~dp0"

echo.
echo   =================================================
echo    MIX ENGINE  -  Tauri Desktop Launcher (HMR)
echo   =================================================
echo.

REM Make a freshly-installed Rust toolchain visible to THIS session up-front,
REM so a "where cargo" after install (or on a prior install) succeeds.
set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"

REM === 1. Node.js =======================================================
where node >nul 2>nul
if errorlevel 1 goto :no_node
for /f "tokens=*" %%v in ('node -v') do set "NODE_VER=%%v"
echo   [OK]   Node.js !NODE_VER!
goto :check_rust

:no_node
echo   [FAIL] Node.js not found.
echo          Install the LTS from https://nodejs.org  then re-run this file.
echo.
pause
exit /b 1

REM === 2. Rust toolchain (Tauri compiles a native binary) ===============
:check_rust
where cargo >nul 2>nul
if not errorlevel 1 goto :rust_ok
if exist "%USERPROFILE%\.cargo\bin\cargo.exe" goto :rust_ok
echo   [SETUP] Rust not found - installing the MSVC toolchain via rustup...
echo           one-time download, a few hundred MB
call :install_rust
set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"
where cargo >nul 2>nul
if not errorlevel 1 goto :rust_ok
if exist "%USERPROFILE%\.cargo\bin\cargo.exe" goto :rust_ok
echo   [FAIL] Rust install did not complete.
echo          Install manually from https://rustup.rs  then re-run this file.
echo.
pause
exit /b 1

:rust_ok
for /f "tokens=*" %%v in ('cargo -V') do set "CARGO_VER=%%v"
echo   [OK]   !CARGO_VER!

REM === 3. MSVC C++ build tools (the linker Tauri links against) =========
call :have_msvc
if not errorlevel 1 goto :msvc_ok
echo   [SETUP] Visual Studio C++ Build Tools not found.
echo           Installing the Desktop C++ workload - a LARGE one-time
echo           download, several GB. Click Yes if asked for admin rights.
call :install_msvc
call :have_msvc
if not errorlevel 1 goto :msvc_ok
echo   [FAIL] C++ Build Tools still not detected.
echo          Install "Visual Studio Build Tools 2022" with the Desktop
echo          development with C++ workload, then re-run this file.
echo.
pause
exit /b 1

:msvc_ok
echo   [OK]   MSVC C++ build tools present.

REM === 4. npm dependencies (includes the Tauri CLI) ====================
if exist "node_modules\@tauri-apps\cli" goto :deps_ok
echo   [SETUP] Installing npm dependencies...
call npm install
if errorlevel 1 goto :npm_fail
:deps_ok
echo   [OK]   Dependencies ready.
goto :icons

:npm_fail
echo   [FAIL] npm install failed.
echo.
pause
exit /b 1

REM === 5. App icons (first run only) ===================================
:icons
if exist "src-tauri\icons\icon.ico" goto :launch
echo   [SETUP] Generating app icons...
if exist "scripts\gen-tauri-icon.cjs" node scripts\gen-tauri-icon.cjs
if exist "src-tauri\icons\icon.png" call npx tauri icon src-tauri\icons\icon.png

REM === 6. Launch Tauri dev (Vite HMR + native window) ==================
:launch
echo.
echo   =================================================
echo    Starting MIX Engine desktop app...
echo.
echo    LIVE RELOAD IS ACTIVE - edit any .ts / .css / .html
echo    file and the running window updates instantly.
echo.
echo    First launch compiles Rust. Later launches are fast.
echo    Close this window or press Ctrl+C to stop.
echo   =================================================
echo.

call npx tauri dev
if errorlevel 1 goto :tauri_err
endlocal
exit /b 0

:tauri_err
echo.
echo   [ERROR] Tauri exited with an error - see the output above.
echo           Common fixes: free port 5173, or run "cargo update".
echo.
pause
endlocal
exit /b 1

REM ====================================================================
REM  Subroutines
REM ====================================================================

:install_rust
    where winget >nul 2>nul
    if errorlevel 1 goto :install_rust_fallback
    winget install --id Rustlang.Rustup -e --silent --accept-source-agreements --accept-package-agreements
    if exist "%USERPROFILE%\.cargo\bin\rustup.exe" "%USERPROFILE%\.cargo\bin\rustup.exe" default stable-msvc
    goto :eof
:install_rust_fallback
    REM Download rustup-init.exe (a BINARY) to disk, THEN run it. The original
    REM script tried to execute the binary as a PowerShell script - which can
    REM never work.
    set "RUSTUP_INIT=%TEMP%\rustup-init.exe"
    powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri 'https://win.rustup.rs/x86_64' -OutFile '%RUSTUP_INIT%'"
    if exist "%RUSTUP_INIT%" "%RUSTUP_INIT%" -y --default-host x86_64-pc-windows-msvc --default-toolchain stable --profile minimal
    goto :eof

:have_msvc
    REM Exit 0 if a usable MSVC C++ toolchain (the linker) is installed. rustc
    REM auto-discovers link.exe via the registry, so detection is all we need.
    set "VSWHERE=%ProgramFiles(x86)%\Microsoft Visual Studio\Installer\vswhere.exe"
    if not exist "!VSWHERE!" goto :have_msvc_link
    for /f "usebackq tokens=*" %%i in (`"!VSWHERE!" -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath 2^>nul`) do if not "%%i"=="" exit /b 0
:have_msvc_link
    where link.exe >nul 2>nul
    if not errorlevel 1 exit /b 0
    exit /b 1

:install_msvc
    where winget >nul 2>nul
    if errorlevel 1 goto :install_msvc_manual
    winget install --id Microsoft.VisualStudio.2022.BuildTools -e --silent --accept-source-agreements --accept-package-agreements --override "--quiet --wait --norestart --nocache --add Microsoft.VisualStudio.Workload.VCTools --add Microsoft.VisualStudio.Component.VC.Tools.x86.x64 --add Microsoft.VisualStudio.Component.Windows11SDK.22621"
    goto :eof
:install_msvc_manual
    echo   [WARN] winget unavailable - opening the Build Tools download page.
    start "" "https://visualstudio.microsoft.com/visual-cpp-build-tools/"
    goto :eof
