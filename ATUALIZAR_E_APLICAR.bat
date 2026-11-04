@echo off
chcp 65001 >nul
title Atualizador Automatico - CS Demo Manager
echo ========================================================
echo    ATUALIZADOR AUTOMATICO - CS DEMO MANAGER
echo ========================================================
echo.

cd /d "C:\Users\FernandoPC\.gemini\antigravity\scratch\cs-demo-manager-custom"

echo [1/4] Baixando alteracoes mais recentes do GitHub...
git pull origin main
if %errorlevel% neq 0 (
    echo [AVISO] Nao foi possivel sincronizar com o GitHub ou sem conexao. Continuando com os arquivos locais...
)

echo.
echo [2/4] Aplicando patches nas funcionalidades...
node scripts/apply-patches.mjs
if %errorlevel% neq 0 (
    echo.
    echo [ERRO] Falha ao aplicar patches. Verifique a sintaxe do codigo modificado.
    pause
    exit /b 1
)

echo.
echo [3/4] Empacotando novo app.asar...
node scripts/repack-asar.mjs
if %errorlevel% neq 0 (
    echo.
    echo [ERRO] Falha ao empacotar app.asar.
    pause
    exit /b 1
)

echo.
echo [4/4] Instalando nova versao no CS Demo Manager...
taskkill /F /IM "cs-demo-manager.exe" >nul 2>&1
ping 127.0.0.1 -n 2 >nul
copy /Y "build\app.asar" "%LOCALAPPDATA%\Programs\cs-demo-manager\resources\app.asar" >nul

if %errorlevel% neq 0 (
    echo.
    echo [ERRO] Nao foi possivel copiar para a pasta do programa. Certifique-se de que o CS Demo Manager esteja fechado.
    pause
    exit /b 1
)

echo.
echo ========================================================
echo   [SUCESSO] CS Demo Manager atualizado com sucesso!
echo ========================================================
echo As mudancas do GitHub ja estao ativas no seu CS Demo Manager.
echo.
pause
