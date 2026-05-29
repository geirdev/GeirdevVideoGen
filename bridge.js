import express from 'express';
import fs from 'fs';
import path from 'path';
import os from 'os';
import readline from 'readline';
import { exec } from 'child_process';

// -------------------------------------------------------------
// 1. 유틸리티 함수: ~/.grok/auth.json에서 로그인 토큰 자동 파싱
// -------------------------------------------------------------
function getGrokToken() {
  try {
    const homeDir = os.homedir();
    const authPath = path.join(homeDir, '.grok', 'auth.json');
    if (!fs.existsSync(authPath)) {
      throw new Error(`~/.grok/auth.json 파일을 찾을 수 없습니다. 터미널에서 'grok login'을 완료했는지 확인해주세요.`);
    }
    const authContent = fs.readFileSync(authPath, 'utf8');
    const authData = JSON.parse(authContent);
    
    const keys = Object.keys(authData);
    if (keys.length === 0) {
      throw new Error(`~/.grok/auth.json에 저장된 로그인 계정이 없습니다. 'grok login'을 실행해 주세요.`);
    }
    
    // 가장 최근 또는 첫 번째 계정의 key(JWT 토큰) 로드
    const accountInfo = authData[keys[0]];
    const token = accountInfo.key;
    if (!token) {
      throw new Error(`Grok CLI 인증 세션(key)을 찾을 수 없습니다.`);
    }
    return token;
  } catch (err) {
    console.error('[Grok Auth Error]:', err.message);
    throw err;
  }
}

// 로컬 이미지 경로의 파일을 Base64 Data URI 형식으로 인코딩하는 헬퍼 함수 (I2V 지원용)
function encodeFileToBase64(filePath) {
  try {
    const absolutePath = path.resolve(filePath.replace(/^~/, os.homedir()));
    if (!fs.existsSync(absolutePath)) {
      throw new Error(`이미지 파일을 찾을 수 없습니다: ${absolutePath}`);
    }
    
    const ext = path.extname(absolutePath).toLowerCase();
    let mimeType = 'image/png';
    if (ext === '.jpg' || ext === '.jpeg') {
      mimeType = 'image/jpeg';
    } else if (ext === '.webp') {
      mimeType = 'image/webp';
    } else if (ext === '.gif') {
      mimeType = 'image/gif';
    }

    const fileBuffer = fs.readFileSync(absolutePath);
    const base64Data = fileBuffer.toString('base64');
    return `data:${mimeType};base64,${base64Data}`;
  } catch (err) {
    throw new Error(`이미지 인코딩 실패: ${err.message}`);
  }
}

// -------------------------------------------------------------
// 2. HTTP REST API Server 구성 (Express)
// -------------------------------------------------------------
function startHttpServer() {
  const app = express();
  const PORT = 3009;

  app.use(express.json({ limit: '50mb' }));

  // CORS 무력화 미들웨어
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    next();
  });

  // 비디오 생성 엔드포인트 중계 (POST /v1/videos/generations)
  app.post('/v1/videos/generations', async (req, res) => {
    console.log('[REST] Video generation requested...');
    try {
      const token = getGrokToken();
      const response = await fetch('https://api.x.ai/v1/videos/generations', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(req.body)
      });
      
      const data = await response.json();
      res.status(response.status).json(data);
    } catch (err) {
      console.error('[REST Error]:', err.message);
      res.status(500).json({ error: { message: err.message } });
    }
  });

  // 비디오 폴링 엔드포인트 중계 (GET /v1/videos/:request_id)
  app.get('/v1/videos/:request_id', async (req, res) => {
    try {
      const token = getGrokToken();
      const requestId = req.params.request_id;
      const response = await fetch(`https://api.x.ai/v1/videos/${requestId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      const data = await response.json();
      
      // 터미널 로깅: 생성 완료 또는 실패 시 알아보기 쉬운 화려한 결과 블록 출력
      if (data && data.status === 'done') {
        const videoUrl = data.video?.url;
        console.log('\n==================================================');
        console.log('🎉 [Grok Video Bridge] 비디오 생성 성공! (Completed)');
        console.log(`- 요청 ID: ${requestId}`);
        if (videoUrl) {
          console.log(`- 다운로드 URL: ${videoUrl}`);
        }
        console.log('==================================================\n');
      } else if (data && data.status === 'failed') {
        console.log('\n==================================================');
        console.log('❌ [Grok Video Bridge] 비디오 생성 실패... (Failed)');
        console.log(`- 요청 ID: ${requestId}`);
        console.log(`- 에러 메시지: ${data.error?.message || '알 수 없는 오류'}`);
        console.log('==================================================\n');
      } else {
        // 대기 중일 때는 온점(.)을 출력하여 진행 상황 점검 지원
        process.stdout.write('.');
      }
      
      res.status(response.status).json(data);
    } catch (err) {
      console.error('[REST Error]:', err.message);
      res.status(500).json({ error: { message: err.message } });
    }
  });

  // 그록 CLI 로그인 상태 점검 API
  app.get('/api/auth/status', (req, res) => {
    try {
      const homeDir = os.homedir();
      const authPath = path.join(homeDir, '.grok', 'auth.json');
      const isLoggedIn = fs.existsSync(authPath);
      res.json({ isLoggedIn });
    } catch (err) {
      res.json({ isLoggedIn: false });
    }
  });

  // 그록 CLI 로그인 유도 기동 API
  app.post('/api/auth/login', (req, res) => {
    console.log('\n[Grok Auth] Web UI에서 grok login 명령이 트리거되었습니다.');
    
    // 로컬 백그라운드 프로세스로 'grok login'을 실행하여 웹 브라우저 인증 화면 스폰 유도
    exec('grok login', (error) => {
      if (error) {
        console.error('[Grok CLI Login 스폰 실패]:', error.message);
      }
    });
    
  });

  // 그록 CLI 로그아웃 기동 API
  app.post('/api/auth/logout', (req, res) => {
    console.log('\n[Grok Auth] Web UI에서 grok logout 명령이 트리거되었습니다.');
    
    // 철벽 안전장치: 백엔드 단에서 직접 세션 인증 파일을 지워 100% 즉각적인 물리적 로그아웃 보장
    try {
      const homeDir = os.homedir();
      const authPath = path.join(homeDir, '.grok', 'auth.json');
      if (fs.existsSync(authPath)) {
        fs.unlinkSync(authPath);
        console.log('[Grok Auth] ~/.grok/auth.json 물리적 파일 삭제 성공.');
      }
    } catch (e) {
      console.error('[Grok Auth File Delete Error]:', e.message);
    }
    
    // 로컬 백그라운드 프로세스로 'grok logout'을 병행 구동하여 CLI 내부 유저 정보도 완전 클리어
    exec('grok logout', (error) => {
      if (error) {
        console.error('[Grok CLI Logout 스폰 실패]:', error.message);
      }
    });
    
    res.json({ success: true, message: 'Grok CLI 로그아웃 처리가 완료되었습니다.' });
  });

  app.listen(PORT, () => {
    console.log('==================================================');
    console.log(`🚀 Grok Video Bridge Server running on http://localhost:${PORT}`);
    console.log(`👉 Front-end proxy targets this port for CORS-free x.ai calls`);
    console.log('==================================================');
  });
}

// -------------------------------------------------------------
// 3. MCP JSON-RPC Stdio Server 구성
// -------------------------------------------------------------
function startMcpServer() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
  });

  rl.on('line', async (line) => {
    try {
      const req = JSON.parse(line);
      const res = await handleMcpRequest(req);
      if (res) {
        process.stdout.write(JSON.stringify(res) + '\n');
      }
    } catch (err) {
      // JSON 파싱 실패 등 무시
    }
  });
}

async function handleMcpRequest(req) {
  // JSON-RPC 알림(Notification)은 id가 없으며 응답을 전송하지 않아야 합니다. (grok-cli 파서 에러 차단)
  if (req.id === undefined || req.id === null) {
    return null;
  }
  const id = req.id;

  // 1. Initialize
  if (req.method === 'initialize') {
    return {
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: {
          tools: {}
        },
        serverInfo: {
          name: 'grok-video-bridge-mcp',
          version: '1.0.0'
        }
      }
    };
  }

  // 2. Tools list
  if (req.method === 'tools/list') {
    return {
      jsonrpc: '2.0',
      id,
      result: {
        tools: [
          {
            name: 'generate_video',
            description: 'x.ai API를 이용하여 텍스트 프롬프트 또는 이미지(Image-to-Video)로부터 고품질 비디오를 생성합니다. CLI 로그인 인증 세션(~/.grok/auth.json)을 자동으로 재사용하므로 별도의 API 키가 필요 없습니다.',
            inputSchema: {
              type: 'object',
              properties: {
                prompt: {
                  type: 'string',
                  description: '생성하고 싶은 비디오 묘사 프롬프트'
                },
                image_path: {
                  type: 'string',
                  description: 'Image-to-Video 생성 시 사용할 로컬 이미지 파일의 절대경로 또는 상대경로 (예: "/Users/user/photo.png") (옵션)'
                },
                duration: {
                  type: 'number',
                  description: '비디오 길이 (초 단위, 기본값: 5)'
                },
                aspect_ratio: {
                  type: 'string',
                  description: '비디오 비율 (예: "16:9", "9:16", "1:1", 기본값: "16:9")'
                }
              },
              required: ['prompt']
            }
          }
        ]
      }
    };
  }

  // 3. Tools call
  if (req.method === 'tools/call') {
    const { name, arguments: args } = req.params;
    if (name === 'generate_video') {
      try {
        const token = getGrokToken();
        const duration = args.duration || 5;
        const aspect_ratio = args.aspect_ratio || '16:9';
        
        const payload = {
          model: 'grok-imagine-video',
          prompt: args.prompt,
          duration: duration,
          aspect_ratio: aspect_ratio,
          resolution: '720p'
        };

        if (args.image_path) {
          const base64Image = encodeFileToBase64(args.image_path);
          payload.image = {
            url: base64Image
          };
        }

        // 1단계: 비디오 생성 큐잉 요청
        const queueResponse = await fetch('https://api.x.ai/v1/videos/generations', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });

        if (!queueResponse.ok) {
          const errText = await queueResponse.text();
          return mcpErrorResponse(id, `비디오 큐 등록 실패: ${queueResponse.status} - ${errText}`);
        }

        const queueData = await queueResponse.json();
        const requestId = queueData.request_id;
        if (!requestId) {
          return mcpErrorResponse(id, '요청 ID(request_id)를 발급받지 못했습니다.');
        }

        // 2단계: 완료 상태 폴링 시작
        let isCompleted = false;
        let videoUrl = null;
        let attempts = 0;
        const maxAttempts = 60; // 5분 한도

        while (!isCompleted && attempts < maxAttempts) {
          attempts++;
          await new Promise((resolve) => setTimeout(resolve, 5000)); // 5초 대기

          const retrieveResponse = await fetch(`https://api.x.ai/v1/videos/${requestId}`, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${token}`
            }
          });

          if (!retrieveResponse.ok) {
            continue; // 일시적 통신 실패는 스킵
          }

          const retrieveData = await retrieveResponse.json();
          if (retrieveData.status === 'done') {
            isCompleted = true;
            videoUrl = retrieveData.video?.url;
          } else if (retrieveData.status === 'failed') {
            return mcpErrorResponse(id, `생성 실패: ${retrieveData.error?.message || '알 수 없는 오류'}`);
          }
        }

        if (videoUrl) {
          return {
            jsonrpc: '2.0',
            id,
            result: {
              content: [
                {
                  type: 'text',
                  text: `🎉 고품질 비디오 생성이 완료되었습니다!\n\n- **프롬프트**: ${args.prompt}\n- **비율**: ${aspect_ratio}\n- **길이**: ${duration}초\n- **생성된 비디오 URL**: ${videoUrl}\n\n위 링크를 눌러 비디오를 확인 및 다운로드하실 수 있습니다.`
                }
              ]
            }
          };
        } else {
          return mcpErrorResponse(id, '비디오 생성이 타임아웃되었습니다. 잠시 후 x.ai 웹 포털에서 이력을 확인해 보세요.');
        }

      } catch (err) {
        return mcpErrorResponse(id, err.message);
      }
    }
  }

  // 지원되지 않는 일반 요청에 대해 JSON-RPC 규격에 맞는 빈 성공 응답을 내림
  return {
    jsonrpc: '2.0',
    id,
    result: {}
  };
}

function mcpErrorResponse(id, message) {
  return {
    jsonrpc: '2.0',
    id,
    result: {
      isError: true,
      content: [{ type: 'text', text: `❌ 오류 발생: ${message}` }]
    }
  };
}

// -------------------------------------------------------------
// 4. 메인 실행 제어기 (CLI 인자 분석)
// -------------------------------------------------------------
const args = process.argv.slice(2);
if (args.includes('--mcp') || args.includes('mcp')) {
  // Stdio 기반 MCP Server 가동
  startMcpServer();
} else {
  // 일반 REST API Server 가동
  startHttpServer();
}
