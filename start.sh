#!/bin/bash

# 🎬 Grok Builder Video Generator - Mac / Linux용 원터치 실행기

# 아티스틱한 터미널 인트로 출력
echo "=========================================================="
echo " 🎬 Grok Builder Video Generator - Mac/Linux 원터치 실행기"
echo "=========================================================="
echo ""

# 1. Node.js & npm 설치 여부 검사 및 무인 자동 설치
if ! command -v node &> /dev/null || ! command -v npm &> /dev/null
then
    echo "⚠️  [시스템 안내] 컴퓨터에 Node.js 또는 npm이 설치되어 있지 않습니다."
    echo "⚙️  [자동 설치 시작] 원클릭 가동을 위해 Node.js 자동 설치를 진행합니다."
    echo ""
    
    if [[ "$OSTYPE" == "darwin"* ]]; then
        echo "🍏 Mac(macOS)용 Node.js LTS 통합 설치 패키지를 다운로드하는 중입니다..."
        # Node.js 최신 LTS 다운로드 (Universal PKG - Apple Silicon 및 Intel Mac 겸용)
        NODE_PKG_URL="https://nodejs.org/dist/v20.12.2/node-v20.12.2.pkg"
        TEMP_PKG="/tmp/node-install.pkg"
        
        curl -L -o "$TEMP_PKG" "$NODE_PKG_URL"
        
        if [ $? -ne 0 ]; then
            echo "❌ 에러: Node.js 다운로드에 실패했습니다. 인터넷 연결 상태를 확인해 주세요."
            read -p "엔터 키를 누르면 종료됩니다..."
            exit 1
        fi
        
        echo ""
        echo "🔒 보안 승인 요망: Mac 시스템에 Node.js를 정식 등록 및 설치하기 위해"
        echo "    맥북/Mac 컴퓨터의 로그인 암호(비밀번호)를 한 번 입력해 주세요."
        echo "    (보안상 키보드를 입력해도 화면에 글자가 나타나지 않지만 정상 작동 중입니다)"
        echo ""
        
        sudo installer -pkg "$TEMP_PKG" -target /
        
        # 설치 임시 파일 잔해 정리
        rm -f "$TEMP_PKG"
        
        # 현재 터미널 세션의 PATH 동기화 (설치 직후 터미널에 설치 경로 즉시 바인딩 인식)
        export PATH="/usr/local/bin:$PATH"
        
        if ! command -v node &> /dev/null; then
            echo "❌ 에러: 설치 권한 미승인 또는 예기치 못한 원인으로 설치에 실패했습니다."
            echo "💡 수동 설치 안내: https://nodejs.org 에 직접 방문하여 설치를 마쳐주세요."
            read -p "엔터 키를 누르면 종료됩니다..."
            exit 1
        fi
        
        echo "✅ [설치 완료] Node.js가 Mac에 완벽히 자동 설치되었습니다!"
        echo ""
    else
        # Linux용 패키지 관리 기동
        echo "🐧 Linux 환경이 감지되었습니다. 패키지 관리자를 사용하여 설치를 시도합니다..."
        if command -v apt-get &> /dev/null; then
            sudo apt-get update && sudo apt-get install -y nodejs npm
        elif command -v yum &> /dev/null; then
            sudo yum install -y nodejs npm
        else
            echo "❌ 에러: 지원되지 않는 Linux 배포판입니다. Node.js를 직접 설치해 주세요."
            read -p "엔터 키를 누르면 종료됩니다..."
            exit 1
        fi
        
        if ! command -v node &> /dev/null; then
            echo "❌ 에러: 패키지 설치 실패. 수동으로 Node.js를 설치해 주세요."
            read -p "엔터 키를 누르면 종료됩니다..."
            exit 1
        fi
        echo "✅ [설치 완료] Node.js가 Linux에 설치되었습니다!"
        echo ""
    fi
else
    echo "✅ [검사 완료] Node.js 및 npm 상태 양호!"
    echo ""
fi

# 2. 프로젝트 의존성 라이브러리 자동 설치 (npm install)
echo "📦 [1/3] 필수 부속품(라이브러리)을 다운로드 및 설치하는 중입니다..."
echo "       (네트워크 상황에 따라 15초~1분 정도 소요될 수 있습니다.)"
echo ""
npm install

if [ $? -ne 0 ]; then
    echo ""
    echo "❌ 에러: 필수 부속품 설치 중에 오류가 발생했습니다."
    echo "       인터넷 연결 상태를 점검해 보세요."
    read -p "엔터 키를 누르면 종료됩니다..."
    exit 1
fi
echo "✅ [설치 완료] 부속품 세팅 완료!"
echo ""

# 3. 백엔드 및 프론트엔드 동시 기동 및 브라우저 자동 오픈 (npm run start)
echo "🚀 [2/2] 중계 서버 및 웹 스튜디오 화면을 정식 기동합니다..."
echo "       (잠시 후 인터넷 브라우저 창이 마법처럼 자동으로 켜집니다!)"
echo ""
npm run start
