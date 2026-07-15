@echo off
cd /d "%~dp0"

echo === Etat du depot ===
git status
echo.

set /p MSG="Message de commit : "
if "%MSG%"=="" (
    echo Annule -- message vide.
    pause
    exit /b 1
)

git add -A
git commit -m "%MSG%"
if errorlevel 1 (
    echo Rien a committer, ou erreur de commit.
    pause
    exit /b 1
)

git push
if errorlevel 1 (
    echo Le push a echoue.
    pause
    exit /b 1
)

echo.
echo === Push termine, deploiement auto en cours ===
pause
