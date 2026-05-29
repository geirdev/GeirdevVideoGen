@echo off
:: 한글 깨짐 방지를 위한 UTF-8 인코딩 설정
chcp 65001 >nul
title Grok Builder Video Generator - Windows 원터치 실행기

:: 🎬 Grok Builder Video Generator - Windows용 원터치 실행기

echo ==========================================================
echo  🎬 Grok Builder Video Generator - Windows 원터치 실행기
echo ==========================================================
echo.

:: 1. Node.js & npm 설치 여부 검사 및 무인 자동 설치
where node >nul 2>nul
set NODE_CHECK=%errorlevel%
where npm >nul 2>nul
set NPM_CHECK=%errorlevel%

if %NODE_CHECK% neq 0 (
    echo ⚠️  [시스템 안내] 컴퓨터에 Node.js가 설치되어 있지 않습니다.
    echo ⚙️  [자동 설치 시작] 원클릭 가동을 위해 Node.js 자동 설치를 진행합니다...
    echo.
    
    :: Windows 10/11의 공식 패키지 관리자 winget 검진 및 설치 구동
    where winget >nul 2>nul
    if %errorlevel% equ 0 (
        echo 💾 Windows Package Manager(winget)를 사용해 Node.js LTS 버전을 무인 설치합니다.
        echo.
        winget install OpenJS.NodeJS.LTS --silent --accept-source-agreements --accept-package-agreements
    ) else (
        echo 💾 공식 Node.js 웹서버로부터 Windows용 설치 관리자(MSI)를 다운로드하는 중입니다...
        :: PowerShell을 활용한 Failsafe 다운로드 및 Silent 무인 설치
        powershell -Command "Invoke-WebRequest -Uri 'https://nodejs.org/dist/v20.12.2/node-v20.12.2-x64.msi' -OutFile 'node_install.msi'"
        if not exist node_install.msi (
            echo ❌ 에러: 설치 파일 다운로드 실패. 인터넷 연결을 확인해 주세요.
            pause
            exit /b 1
        )
        echo.
        echo ⚙️  Node.js를 조용히 자동 설치하고 있습니다. 잠시만 대기해 주세요...
        msiexec /i node_install.msi /qn /norestart
        del node_install.msi
    )
    
    :: 환경 변수 즉시 적용을 위해 시스템 PATH 동기화 임시 매핑
    set "PATH=%SystemDrive%\Program Files\nodejs\;%PATH%"
    set "PATH=%APPDATA%\npm;%PATH%"
    
    :: 정상 설치 확인
    where node >nul 2>nul
    if %errorlevel% neq 0 (
        echo.
        echo ❌ 에러: 무인 설치가 완료되지 않았거나 차단되었습니다.
        echo 💡 해결 방법: https://nodejs.org 에 직접 접속하셔서 설치를 마쳐주시기 바랍니다.
        echo.
        pause
        exit /b 1
    )
    echo ✅ [설치 완료] Node.js가 컴퓨터에 완벽히 자동 설치되었습니다!
    echo.
) else (
    echo ✅ [검사 완료] Node.js 및 npm 상태 양호!
    echo.
)

:: 2. 필수 부속품 설치 (npm install)
echo 📦 [1/3] 필수 부속품(라이브러리)을 다운로드 및 설치하는 중입니다...
echo        (네트워크 상황에 따라 15초~1분 정도 소요될 수 있습니다.)
echo.
call npm install
if %errorlevel% neq 0 (
    echo.
    echo ❌ 에러: 필수 부속품 설치 과정에서 오류가 발생했습니다.
    echo        인터넷 연결 상태를 점검해 보세요.
    echo.
    pause
    exit /b 1
)
echo ✅ [설치 완료] 부속품 세팅 완료!
echo.

:: 3. 백엔드 및 프론트엔드 동시 기동 및 브라우저 자동 오픈 (npm run start)
echo 🚀 [2/2] 중계 서버 및 웹 스튜디오 화면을 정식 기동합니다...
echo        (잠시 후 인터넷 브라우저 창이 마법처럼 자동으로 켜집니다!)
echo.
call npm run start
