import { spawn } from 'child_process';
import os from 'os';

console.log('========================================================');
console.log('🎬 Grok Builder Video Generator를 시작합니다...');
console.log('========================================================\n');

// 1. 백엔드 브릿지 서버 가동 (bridge.js)
const bridge = spawn('node', ['bridge.js'], { stdio: 'inherit', shell: true });

// 2. 프론트엔드 Vite 웹 스튜디오 가동 및 브라우저 자동 오픈 (--open 플래그 연동)
const vite = spawn('npx', ['vite', '--open'], { stdio: 'inherit', shell: true });

// 사용자가 Ctrl + C 등으로 종료 시 켜두었던 자식 프로세스들을 동시 클린업 수거
const cleanup = () => {
  console.log('\n👋 서버 가동을 안전하게 종료하고 하위 포트를 회수합니다.');
  try {
    if (os.platform() === 'win32') {
      // Windows의 경우 태스크 트리 전체 강제 종료
      spawn('taskkill', ['/pid', bridge.pid, '/f', '/t'], { shell: true });
      spawn('taskkill', ['/pid', vite.pid, '/f', '/t'], { shell: true });
    } else {
      bridge.kill('SIGINT');
      vite.kill('SIGINT');
    }
  } catch (e) {
    // 이미 종료된 프로세스에 대한 예외 방지
  }
  process.exit();
};

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

// 자식 프로세스 오류 감지 시 로깅 후 조치
bridge.on('error', (err) => console.error('⚠️ 브릿지 서버 구동 중 오류:', err));
vite.on('error', (err) => console.error('⚠️ 웹 프론트엔드 서버 구동 중 오류:', err));
