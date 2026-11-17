@echo off
chcp 65001 >nul
title Abyss Run 서버
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 goto nonode
node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>22||(a===22&&b>=13)?0:1)"
if errorlevel 1 goto oldnode

if not exist node_modules\ws (
  echo 처음 실행이라 필요한 파일을 받는 중이에요...
  call npm install --omit=dev --no-audit --no-fund
  if errorlevel 1 goto npmfail
)

echo.
echo 서버를 켜는 중... Windows 방화벽 창이 뜨면 "허용"을 눌러 주세요.
node --disable-warning=ExperimentalWarning server/main.js
echo.
echo 서버가 꺼졌어요.
pause
exit /b

:nonode
echo Node.js가 없어요. https://nodejs.org 에서 LTS 버전을 설치한 뒤 다시 실행해 주세요.
start https://nodejs.org
pause
exit /b

:oldnode
echo Node.js 버전이 낮아요. https://nodejs.org 에서 LTS(22.13 이상)로 다시 설치해 주세요.
start https://nodejs.org
pause
exit /b

:npmfail
echo 파일 받기에 실패했어요. 인터넷 연결을 확인하고 다시 실행해 주세요.
pause
