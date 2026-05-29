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

  // CLI Login Trigger
  const handleAuthLogin = useCallback(async () => {
    setStatusText('Launching CLI Authentication. Please check your local terminal or browser window...');
    try {
      const response = await fetch('/api-xai/api/auth/login', {
        method: 'POST'
      });
      if (response.ok) {
        // Wait briefly for the session to refresh
        setTimeout(checkAuthStatus, 4000);
      } else {
        setError('Failed to launch authentication process. Please run "grok login" directly in your terminal.');
      }
    } catch (e) {
      setError('Communication with the bridge authentication server failed.');
    } finally {
      setStatusText(null);
    }
  }, [checkAuthStatus]);

  // CLI Logout Trigger
  const handleAuthLogout = useCallback(async () => {
    setStatusText('Logging out from CLI...');
    try {
      const response = await fetch('/api-xai/api/auth/logout', {
        method: 'POST'
      });
      if (response.ok) {
        // Instantly reset frontend states without needing a page refresh
        setIsLoggedIn(false);
        setVideoUrl(null);
        setImageBase64(null);
        setPrompt('');
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
        checkAuthStatus();
      } else {
        setError('Failed to execute the logout process.');
      }
    } catch (e) {
      setError('Communication with the bridge logout server failed.');
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
      setError('Only image files are allowed for upload.');
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
      setError('An error occurred while reading the file.');
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
      setError('Please enter a prompt.');
      return;
    }

    setIsLoading(true);
    setError(null);
    setVideoUrl(null);
    setStatusText('Requesting video generation...');

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
          throw new Error("Video generation denied due to Grok's Safety Filter (Content Moderation). Please try removing sensitive keywords or using a different source image.");
        }
        throw new Error(`Failed to queue video generation: ${finalErrMsg}`);
      }

      const queueData = await queueResponse.json();
      const requestId = queueData.request_id;

      if (!requestId) {
        throw new Error('Failed to acquire Request ID (request_id) from the API.');
      }

      // 2. Poll for completion
      let isCompleted = false;
      setStatusText('Generating video... Please wait (this can take up to a few minutes)');
      
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
          throw new Error(`Status polling failed: ${parsedMessage || errText}`);
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
             throw new Error('Video generation completed, but failed to retrieve the download URL.');
           }
        } else if (retrieveData.status === 'failed') {
           const rawErrMsg = retrieveData.error?.message || retrieveData.error_message || retrieveData.message || 'Unknown error';
           if (
             rawErrMsg.toLowerCase().includes('safety') || 
             rawErrMsg.toLowerCase().includes('moderation') || 
             rawErrMsg.toLowerCase().includes('censor') ||
             rawErrMsg.toLowerCase().includes('violation')
           ) {
             throw new Error("Generation Failed: Video generation aborted by Grok's Safety Filter. Please refine your prompt or source image and try again.");
           }
           throw new Error(`Generation Failed: ${rawErrMsg}`);
        }
        // Continue waiting if status is 'processing'
      }
      
    } catch (err: any) {
      console.error('Generation error:', err);
      setError(err.message || 'An unexpected error occurred during video generation.');
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
            🔒 CLI Logout
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
            ⚠️ CLI Authentication Session Not Detected
          </div>
          <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
            To generate videos, you must be logged into the CLI.<br />
            Click the button below to easily authenticate your account.
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
            Authenticate CLI (Browser OAuth)
          </button>
        </div>
      )}
      <div className="controls-row">
        <div className="input-group" style={{ flex: 1.5 }}>
          <label htmlFor="model-select">Select Video Model</label>
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
          <label htmlFor="resolution-select">Resolution / Quality</label>
          <select 
            id="resolution-select" 
            className="model-select"
            value={resolution}
            onChange={(e) => setResolution(e.target.value)}
            disabled={isLoading}
          >
            <option value="720p">High Definition (720p)</option>
            <option value="480p">Standard Definition (480p)</option>
          </select>
        </div>

        <div className="input-group" style={{ flex: 1 }}>
          <label htmlFor="duration-select">Duration</label>
          <select 
            id="duration-select" 
            className="model-select"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            disabled={isLoading}
          >
            <option value="5s">5 Seconds</option>
            <option value="10s">10 Seconds</option>
            <option value="15s">15 Seconds</option>
          </select>
        </div>

        <div className="input-group" style={{ flex: 1.5 }}>
          <label>Source Image (Optional)</label>
          <div className="file-upload-wrapper">
            <button className="file-input-btn" type="button" onClick={() => fileInputRef.current?.click()}>
              📸 {imageBase64 ? 'Change Image' : 'Upload Image'}
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
        💡 Aspect ratio auto-adjusts to match your source image.
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
        <label htmlFor="prompt">What kind of video would you like to create?</label>
        <textarea
          id="prompt"
          className="prompt-input"
          placeholder="e.g., A neon-lit cyberpunk cat walking down a cinematic street, 4k..."
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
            Generating...
          </>
        ) : (
          'Generate Video'
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
          <span style={{ fontSize: '1.05rem', color: '#ff4d6d' }}>⚠️ CRITICAL: DO NOT CLOSE OR REFRESH BROWSER</span>
          <span style={{ fontWeight: 500, color: 'rgba(255, 255, 255, 0.9)' }}>
            Video generation is in progress. <strong>Do not close, refresh, or leave this page until the generation is fully complete!</strong>
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
            <p>{isLoading ? 'AI is crafting a stunning video. This process may take a few minutes.' : 'Provide a prompt and optional image, then click Generate.'}</p>
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
                  ⚠️ CRITICAL: KEEP BROWSER ACTIVE
                </div>
                <div style={{ fontWeight: 500, fontSize: '0.85rem', color: 'rgba(255, 107, 107, 0.9)' }}>
                  Generation in progress. Closing this page or refreshing will abort your video generation.
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {history.length > 0 && (
        <div className="history-section" style={{ marginTop: '2rem', width: '100%', maxWidth: '800px' }}>
          <h3 style={{ marginBottom: '1rem', borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.5rem' }}>Generation History</h3>
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
                  Play
                </button>
                <a 
                  href={item.url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="btn-primary" 
                  style={{ padding: '0.5rem 1rem', fontSize: '0.9rem', textDecoration: 'none', background: 'transparent', border: '1px solid var(--primary-color)' }}
                >
                  Link
                </a>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

