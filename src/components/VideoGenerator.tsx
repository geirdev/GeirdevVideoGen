import React, { useState, useCallback, useRef, useEffect } from 'react';
import { ErrorModal } from './ErrorModal';

const API_KEY = import.meta.env.VITE_XAI_API_KEY;

const MODELS = [
  { id: 'grok-imagine-video', label: 'Grok Imagine Video' }
];

interface VideoHistory {
  id: string;
  prompt: string;
  url: string;
  timestamp: number;
}

export const VideoGenerator: React.FC = () => {
  const [prompt, setPrompt] = useState('');
  const [selectedModel, setSelectedModel] = useState(MODELS[0].id);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [aspectRatio, setAspectRatio] = useState('16:9');
  const [duration, setDuration] = useState('5s');
  const [history, setHistory] = useState<VideoHistory[]>(() => {
    try {
      const saved = localStorage.getItem('grok_video_history');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });
  
  const [isLoading, setIsLoading] = useState(false);
  const [statusText, setStatusText] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resolution, setResolution] = useState('720p');
  
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 실시간 그록 CLI 로그인 상태 판독 함수
  const checkAuthStatus = useCallback(async () => {
    try {
      const response = await fetch('/api-xai/api/auth/status');
      if (response.ok) {
        const data = await response.json();
        setIsLoggedIn(data.isLoggedIn);
      }
    } catch (e) {
      setIsLoggedIn(false);
    }
  }, []);

  // 그록 CLI 로그인 브라우저 인증 구동 실행기
  const handleAuthLogin = useCallback(async () => {
    setStatusText('Grok CLI 인증을 구동하고 있습니다. 로컬 터미널 및 브라우저 창을 확인해 주세요...');
    try {
      const response = await fetch('/api-xai/api/auth/login', {
        method: 'POST'
      });
      if (response.ok) {
        // 잠시 대기 후 계정 세션 갱신 체크
        setTimeout(checkAuthStatus, 4000);
      } else {
        setError('인증 프로세스 구동 실패. 터미널에서 직접 grok login을 실행해 주세요.');
      }
    } catch (e) {
      setError('인증 중계 서버와의 통신에 실패했습니다.');
    } finally {
      setStatusText(null);
    }
  }, [checkAuthStatus]);

  // 그록 CLI 로그아웃 실행기
  const handleAuthLogout = useCallback(async () => {
    setStatusText('Grok CLI 로그아웃을 진행하고 있습니다...');
    try {
      const response = await fetch('/api-xai/api/auth/logout', {
        method: 'POST'
      });
      if (response.ok) {
        // 즉각적인 프론트엔드 상태 리셋 및 로그아웃 반영 (새로고침 불필요)
        setIsLoggedIn(false);
        setVideoUrl(null);
        setImageBase64(null);
        setPrompt('');
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
        checkAuthStatus();
      } else {
        setError('로그아웃 프로세스 실행에 실패했습니다.');
      }
    } catch (e) {
      setError('로그아웃 중계 서버와의 통신에 실패했습니다.');
    } finally {
      setStatusText(null);
    }
  }, [checkAuthStatus]);

  // 마운트 시 인증 체크 및 주기적 실시간 세션 감시 기동
  useEffect(() => {
    checkAuthStatus();
    const interval = setInterval(checkAuthStatus, 3000); // 3초 주기로 단축하여 빠른 로그인 감지 지원
    return () => clearInterval(interval);
  }, [checkAuthStatus]);

  // 비디오 생성 중 브라우저 종료/새로고침 방지 안전장치
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isLoading) {
        e.preventDefault();
        e.returnValue = '비디오 생성 중에 페이지를 벗어나면 생성이 중단될 수 있습니다. 절대 브라우저 창이나 탭을 닫지 마세요!';
        return e.returnValue;
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [isLoading]);


  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('이미지 파일만 업로드 가능합니다.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      setImageBase64(base64);

      // 이미지 객체를 로드하여 가로세로 치수 측정 및 최적 비디오 비율 자동 매핑
      const img = new Image();
      img.onload = () => {
        const w = img.width;
        const h = img.height;
        const r = w / h;

        // x.ai 지원하는 표준 종횡비 리스트
        const candidates = [
          { name: '16:9', val: 16 / 9 },
          { name: '3:2', val: 3 / 2 },
          { name: '4:3', val: 4 / 3 },
          { name: '1:1', val: 1 },
          { name: '3:4', val: 3 / 4 },
          { name: '2:3', val: 2 / 3 },
          { name: '9:16', val: 9 / 16 }
        ];

        let bestMatch = candidates[0];
        let minDiff = Math.abs(r - bestMatch.val);

        for (let i = 1; i < candidates.length; i++) {
          const diff = Math.abs(r - candidates[i].val);
          if (diff < minDiff) {
            minDiff = diff;
            bestMatch = candidates[i];
          }
        }

        setAspectRatio(bestMatch.name);
        console.log(`[Auto Aspect Ratio] Image Size: ${w}x${h} (Ratio: ${r.toFixed(3)}). Auto-set to: ${bestMatch.name}`);
      };
      img.src = base64;
    };
    reader.onerror = () => {
      setError('파일을 읽는 중 오류가 발생했습니다.');
    };
    reader.readAsDataURL(file);
  }, []);

  const clearImage = useCallback(() => {
    setImageBase64(null);
    setAspectRatio('16:9'); // 이미지 제거 시 기본 비율로 리셋
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);


  const handleGenerate = useCallback(async () => {
    if (!prompt.trim()) {
      setError('프롬프트를 입력해주세요.');
      return;
    }

    setIsLoading(true);
    setError(null);
    setVideoUrl(null);
    setStatusText('비디오 생성 요청 중...');

    try {
      // 1. Queue the video job
      const durationSeconds = parseInt(duration) || 5;
      const requestBody: any = {
        model: selectedModel,
        prompt: prompt,
        duration: durationSeconds,
        aspect_ratio: aspectRatio,
        resolution: resolution
      };

      if (imageBase64) {
        requestBody.image = {
          url: imageBase64
        };
      }

      const queueResponse = await fetch('/api-xai/v1/videos/generations', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
      });

      if (!queueResponse.ok) {
        const errText = await queueResponse.text();
        let parsedMessage = '';
        try {
          const errObj = JSON.parse(errText);
          parsedMessage = errObj.error?.message || errObj.message || errObj.error_message || '';
        } catch (e) {}

        const finalErrMsg = parsedMessage || errText;
        if (
          finalErrMsg.toLowerCase().includes('safety') || 
          finalErrMsg.toLowerCase().includes('moderation') || 
          finalErrMsg.toLowerCase().includes('censor') ||
          finalErrMsg.toLowerCase().includes('violation')
        ) {
          throw new Error('그록(Grok)의 영상 검열(Safety Filter) 기준에 어긋나 비디오 생성 요청이 거부되었습니다. 프롬프트 내 자극적인 키워드를 제거하거나 다른 시작 이미지를 사용해 보세요.');
        }
        throw new Error(`비디오 생성 큐 등록 실패: ${finalErrMsg}`);
      }

      const queueData = await queueResponse.json();
      const requestId = queueData.request_id;

      if (!requestId) {
        throw new Error('요청 ID(request_id)를 발급받지 못했습니다.');
      }

      // 2. Poll for completion
      let isCompleted = false;
      setStatusText('비디오 생성 중... 잠시만 기다려주세요 (최대 몇 분 소요 가능)');
      
      while (!isCompleted) {
        await new Promise(resolve => setTimeout(resolve, 5000)); // 5초 간격으로 폴링

        const retrieveResponse = await fetch(`/api-xai/v1/videos/${requestId}`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${API_KEY}`,
          }
        });

        if (!retrieveResponse.ok) {
          const errText = await retrieveResponse.text();
          let parsedMessage = '';
          try {
            const errObj = JSON.parse(errText);
            parsedMessage = errObj.error?.message || errObj.message || errObj.error_message || '';
          } catch (e) {}
          throw new Error(`상태 폴링 실패: ${parsedMessage || errText}`);
        }

        const retrieveData = await retrieveResponse.json();
        
        if (retrieveData.status === 'done') {
           isCompleted = true;
           const finalUrl = retrieveData.video?.url;
           
           if (finalUrl) {
             setVideoUrl(finalUrl);
             const newHistoryItem = { id: requestId, prompt, url: finalUrl, timestamp: Date.now() };
             setHistory(prev => {
               if (prev.find(h => h.id === requestId)) return prev;
               const updated = [newHistoryItem, ...prev];
               localStorage.setItem('grok_video_history', JSON.stringify(updated));
               return updated;
             });
           } else {
             throw new Error('비디오 생성이 완료되었으나 다운로드 URL을 획득하지 못했습니다.');
           }
        } else if (retrieveData.status === 'failed') {
           const rawErrMsg = retrieveData.error?.message || retrieveData.error_message || retrieveData.message || '알 수 없는 요인';
           if (
             rawErrMsg.toLowerCase().includes('safety') || 
             rawErrMsg.toLowerCase().includes('moderation') || 
             rawErrMsg.toLowerCase().includes('censor') ||
             rawErrMsg.toLowerCase().includes('violation')
           ) {
             throw new Error('생성 실패: 그록(Grok)의 영상 안전 검열(Safety Filter)에 의해 비디오 생성이 중단되었습니다. 프롬프트나 첨부된 소스 이미지를 좀 더 순화하여 다시 시도해 주세요.');
           }
           throw new Error(`생성 실패: ${rawErrMsg}`);
        }
        // 'processing' 상태인 경우 계속 대기
      }
      
    } catch (err: any) {
      console.error('Generation error:', err);
      setError(err.message || '비디오 생성 중 예측하지 못한 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
      setStatusText(null);
    }
  }, [prompt, selectedModel, imageBase64, duration, aspectRatio, resolution]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!isLoading) handleGenerate();
    }
  }, [isLoading, handleGenerate]);

  return (
    <div className="glass-panel">
      {isLoggedIn === true && (
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          width: '100%',
          marginBottom: '0.2rem'
        }}>
          <button
            type="button"
            onClick={handleAuthLogout}
            disabled={isLoading}
            style={{
              background: 'transparent',
              color: 'var(--text-muted)',
              border: '1px solid var(--glass-border)',
              borderRadius: '8px',
              padding: '0.4rem 0.9rem',
              fontSize: '0.83rem',
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = '#ef476f';
              e.currentTarget.style.borderColor = 'rgba(239, 71, 111, 0.4)';
              e.currentTarget.style.background = 'rgba(239, 71, 111, 0.05)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--text-muted)';
              e.currentTarget.style.borderColor = 'var(--glass-border)';
              e.currentTarget.style.background = 'transparent';
            }}
          >
            🔒 Grok CLI 로그아웃
          </button>
        </div>
      )}
      {isLoggedIn === false && (
        <div style={{
          background: 'rgba(239, 71, 111, 0.08)',
          border: '1px solid rgba(239, 71, 111, 0.3)',
          borderRadius: '16px',
          padding: '1.5rem',
          textAlign: 'center',
          marginBottom: '1rem',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '0.8rem',
          boxShadow: '0 8px 32px 0 rgba(239, 71, 111, 0.1)'
        }}>
          <div style={{ fontSize: '1.15rem', fontWeight: 600, color: '#ef476f', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            ⚠️ Grok CLI 인증 세션이 감지되지 않습니다
          </div>
          <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
            비디오 생성을 위해서는 로컬 PC에 Grok CLI 로그인이 완료되어 있어야 합니다.<br />
            아래 인증 버튼을 클릭해 그록(Grok) 계정 인증을 손쉽게 완료하세요.
          </div>
          <button 
            type="button"
            onClick={handleAuthLogin}
            disabled={isLoading}
            style={{
              background: 'linear-gradient(135deg, #ef476f 0%, #ff6b6b 100%)',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              padding: '0.6rem 1.2rem',
              fontSize: '0.95rem',
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: '0 4px 15px rgba(239, 71, 111, 0.3)',
              transition: 'all 0.2s ease',
              marginTop: '0.3rem'
            }}
            onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-1px)'}
            onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
          >
            Grok CLI 인증 연동하기 (Browser OAuth)
          </button>
        </div>
      )}
      <div className="controls-row">
        <div className="input-group" style={{ flex: 1.5 }}>
          <label htmlFor="model-select">비디오 모델 선택</label>
          <select 
            id="model-select" 
            className="model-select"
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            disabled={isLoading}
          >
            {MODELS.map(model => (
              <option key={model.id} value={model.id}>{model.label}</option>
            ))}
          </select>
        </div>

        <div className="input-group" style={{ flex: 1 }}>
          <label htmlFor="resolution-select">화질 해상도</label>
          <select 
            id="resolution-select" 
            className="model-select"
            value={resolution}
            onChange={(e) => setResolution(e.target.value)}
            disabled={isLoading}
          >
            <option value="720p">고화질 (720p)</option>
            <option value="480p">일반화질 (480p)</option>
          </select>
        </div>

        <div className="input-group" style={{ flex: 1 }}>
          <label htmlFor="duration-select">길이</label>
          <select 
            id="duration-select" 
            className="model-select"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            disabled={isLoading}
          >
            <option value="5s">5초</option>
            <option value="10s">10초</option>
            <option value="15s">15초</option>
          </select>
        </div>

        <div className="input-group" style={{ flex: 1.5 }}>
          <label>시작 이미지 첨부 (옵션)</label>
          <div className="file-upload-wrapper">
            <button className="file-input-btn" type="button" onClick={() => fileInputRef.current?.click()}>
              📸 {imageBase64 ? '이미지 변경' : '이미지 업로드'}
            </button>
            <input 
              type="file" 
              ref={fileInputRef}
              className="file-input" 
              accept="image/*" 
              onChange={handleFileChange}
              disabled={isLoading}
              style={{ display: 'none' }}
            />
          </div>
        </div>
      </div>
      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '-0.4rem', marginBottom: '0.2rem', display: 'flex', alignItems: 'center', gap: '0.3rem', justifyContent: 'center' }}>
        💡 화면 비율은 첨부된 이미지에 맞춰 자동으로 최적 조정됩니다.
      </div>

      {imageBase64 && (
        <div className="image-preview-container">
          <img src={imageBase64} alt="Preview" className="image-preview" />
          <button className="remove-image-btn" onClick={clearImage} disabled={isLoading} title="이미지 제거">
            &times;
          </button>
        </div>
      )}

      <div className="input-group">
        <label htmlFor="prompt">어떤 비디오를 만들고 싶으신가요?</label>
        <textarea
          id="prompt"
          className="prompt-input"
          placeholder="예: 사이버펑크 도시를 걷는 고양이, 네온 사인, 시네마틱 4K..."
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isLoading}
        />
      </div>

      <button 
        className="generate-btn" 
        onClick={handleGenerate}
        disabled={isLoading || !prompt.trim()}
      >
        {isLoading ? (
          <>
            <span className="spinner"></span>
            생성 중...
          </>
        ) : (
          '비디오 생성하기'
        )}
      </button>

      {statusText && <div className="status-text">{statusText}</div>}

      {isLoading && (
        <div style={{
          background: 'rgba(239, 71, 111, 0.12)',
          border: '1px solid rgba(239, 71, 111, 0.35)',
          borderRadius: '12px',
          padding: '0.9rem 1.2rem',
          textAlign: 'center',
          color: '#ff6b6b',
          fontSize: '0.9rem',
          fontWeight: 600,
          animation: 'pulse 2s infinite',
          marginTop: '0.5rem',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '0.2rem',
          boxShadow: '0 4px 15px rgba(239, 71, 111, 0.15)'
        }}>
          <span style={{ fontSize: '1.05rem', color: '#ff4d6d' }}>⚠️ 중요: 브라우저 종료/이탈 금지</span>
          <span style={{ fontWeight: 500, color: 'rgba(255, 255, 255, 0.9)' }}>
            비디오 생성이 백엔드에서 원활하게 완결될 때까지 <strong>절대 브라우저 창이나 탭을 닫거나 새로고침하지 마세요!</strong>
          </span>
        </div>
      )}


      <ErrorModal 
        isOpen={!!error} 
        message={error || ''} 
        onClose={() => setError(null)} 
      />

      <div className="video-container">
        {videoUrl ? (
          <video 
            ref={videoRef}
            className="video-player" 
            src={videoUrl} 
            controls 
            autoPlay 
            loop 
          />
        ) : (
          <div className="video-placeholder">
            <div className="placeholder-icon">🎬</div>
            <p>{isLoading ? 'AI가 멋진 비디오를 만들고 있습니다. 이 작업은 다소 시간이 걸릴 수 있습니다.' : '프롬프트와 이미지를 입력하고 생성 버튼을 눌러주세요.'}</p>
            {isLoading && (
              <div style={{
                marginTop: '1.2rem',
                padding: '0.8rem 1.5rem',
                borderRadius: '12px',
                background: 'rgba(239, 71, 111, 0.15)',
                border: '1px solid rgba(239, 71, 111, 0.4)',
                color: '#ff6b6b',
                fontSize: '0.9rem',
                fontWeight: 600,
                maxWidth: '500px',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.3rem',
                boxShadow: '0 4px 15px rgba(239, 71, 111, 0.15)'
              }}>
                <div style={{ fontSize: '1.05rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem' }}>
                  ⚠️ 절대 브라우저 창/탭 종료 금지!
                </div>
                <div style={{ fontWeight: 500, fontSize: '0.85rem', color: 'rgba(255, 107, 107, 0.9)' }}>
                  비디오 생성이 진행 중입니다. 페이지를 새로고침하거나 브라우저를 닫을 경우 작업이 중단될 수 있습니다.
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {history.length > 0 && (
        <div className="history-section" style={{ marginTop: '2rem', width: '100%', maxWidth: '800px' }}>
          <h3 style={{ marginBottom: '1rem', borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.5rem' }}>생성 기록</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxHeight: '300px', overflowY: 'auto', paddingRight: '0.5rem' }}>
            {history.map(item => (
              <div key={item.id} style={{ background: 'rgba(0,0,0,0.3)', padding: '1rem', borderRadius: '12px', border: '1px solid var(--glass-border)', display: 'flex', gap: '1rem', alignItems: 'center' }}>
                <video src={item.url} style={{ width: '120px', height: '67px', borderRadius: '8px', objectFit: 'cover', background: '#000' }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.2rem' }}>
                    {new Date(item.timestamp).toLocaleString()}
                  </div>
                  <div style={{ fontSize: '0.95rem', wordBreak: 'break-all', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {item.prompt}
                  </div>
                </div>
                <button 
                  onClick={() => setVideoUrl(item.url)} 
                  className="btn-primary" 
                  style={{ padding: '0.5rem 1rem', fontSize: '0.9rem' }}
                >
                  재생
                </button>
                <a 
                  href={item.url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="btn-primary" 
                  style={{ padding: '0.5rem 1rem', fontSize: '0.9rem', textDecoration: 'none', background: 'transparent', border: '1px solid var(--primary-color)' }}
                >
                  링크
                </a>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

