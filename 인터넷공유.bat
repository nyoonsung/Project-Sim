@echo off
chcp 65001 >nul
title Abyss Run 인터넷 공유
cd /d "%~dp0"
REM 다른 곳(다른 와이파이)에 있는 친구도 들어올 수 있게 임시 인터넷 주소를 만든다.
REM 서버 창(서버켜기.bat)이 켜져 있어야 한다. 이 창을 닫으면 주소도 사라진다.

where cloudflared >nul 2>nul
if errorlevel 1 (
  echo 처음 한 번만 공유 프로그램^(cloudflared^)을 설치할게요...
  winget install --id Cloudflare.cloudflared -e --accept-source-agreements --accept-package-agreements
  echo.
  echo 설치가 끝났어요. 이 창을 닫고 인터넷공유.bat 을 다시 실행해 주세요.
  pause
  exit /b
)

echo.
echo 잠시 뒤 아래에 https://....trycloudflare.com 주소가 나와요.
echo 그 주소를 친구들에게 보내 주세요. 껐다 켜면 주소가 바뀌어요.
echo.
cloudflared tunnel --no-autoupdate --url http://localhost:3000
pause
