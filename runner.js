import { spawn } from 'child_process';
import os from 'os';

console.log('========================================================');
console.log('🎬 Starting GeirdevVideoGen...');
console.log('========================================================\n');

// 1. 백엔드 브릿지 서버 가동 (bridge.js)
const bridge = spawn('node', ['bridge.js'], { stdio: 'inherit', shell: true });

// 2. 프론트엔드 Vite 웹 스튜디오 가동 및 브라우저 자동 오픈 (--open 플래그 연동)
const vite = spawn('npx', ['vite', '--open'], { stdio: 'inherit', shell: true });

// Clean up all spawned child processes on sudden SIGINT/SIGTERM exits
const cleanup = () => {
  console.log('\n👋 Shutting down servers and releasing active ports.');
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

// Error listeners
bridge.on('error', (err) => console.error('⚠️ Bridge server startup error:', err));
vite.on('error', (err) => console.error('⚠️ Web frontend startup error:', err));
