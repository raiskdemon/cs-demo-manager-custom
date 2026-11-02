@echo off
title Restaurar CS Demo Manager - Versao Estavel
echo ========================================================
echo   RESTAURANDO CS DEMO MANAGER (VERSAO ESTAVEL)
echo ========================================================
echo.
echo 1. Encerrando CS Demo Manager se estiver em execucao...
taskkill /F /IM "cs-demo-manager.exe" >nul 2>&1
timeout /t 2 /nobreak >nul

set "TARGET_DIR=%LOCALAPPDATA%\Programs\cs-demo-manager\resources"
set "ASAR_PATH=%~dp0app.asar"

if not exist "%ASAR_PATH%" (
    echo [ERRO] O arquivo app.asar nao foi encontrado nesta pasta!
    echo %ASAR_PATH%
    pause
    exit /b 1
)

if not exist "%TARGET_DIR%" (
    echo [ERRO] A pasta de instalacao do CS Demo Manager nao foi encontrada!
    echo %TARGET_DIR%
    pause
    exit /b 1
)

echo 2. Restaurando app.asar estavel...
copy /Y "%ASAR_PATH%" "%TARGET_DIR%\app.asar" >nul
if %errorlevel% neq 0 (
    echo [ERRO] Falha ao copiar o arquivo app.asar! Verifique se ha permissoes.
    pause
    exit /b 1
)

echo.
echo [SUCESSO] Versao estavel restaurada com sucesso!
echo 3. Reabrindo o CS Demo Manager...
start "" "%LOCALAPPDATA%\Programs\cs-demo-manager\cs-demo-manager.exe"
echo.
echo Pronto! Pode fechar esta janela.
timeout /t 3 >nul
