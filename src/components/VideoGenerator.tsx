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

interface SlotState {
  prompt: string;
  selectedModel: string;
  imageBase64: string | null;
  aspectRatio: string;
  duration: string;
  resolution: string;
  isLoading: boolean;
  statusText: string | null;
  videoUrl: string | null;
  error: string | null;
}

export const VideoGenerator: React.FC = () => {
  const createEmptySlot = (): SlotState => ({
    prompt: '',
    selectedModel: MODELS[0].id,
    imageBase64: null,
    aspectRatio: '16:9',
    duration: '5s',
    resolution: '720p',
    isLoading: false,
    statusText: null,
    videoUrl: null,
    error: null,
  });

  const [slots, setSlots] = useState<SlotState[]>([
    createEmptySlot(),
    createEmptySlot(),
    createEmptySlot()
  ]);
  const [activeSlotIdx, setActiveSlotIdx] = useState(0);
  
  const [history, setHistory] = useState<VideoHistory[]>(() => {
    try {
      const saved = localStorage.getItem('grok_video_history');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });
  
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null);
  const [globalStatusText, setGlobalStatusText] = useState<string | null>(null);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // slots의 최신 참조를 유지하기 위한 useRef (의존성 최소화 및 성능 극대화)
  const slotsRef = useRef(slots);
  useEffect(() => {
    slotsRef.current = slots;
  }, [slots]);

  // 특정 슬롯의 상태를 갱신하는 헬퍼 함수 (의존성 무영향)
  const updateSlot = useCallback((idx: number, updater: Partial<SlotState> | ((prev: SlotState) => SlotState)) => {
    setSlots(prev => prev.map((slot, sIdx) => {
      if (sIdx !== idx) return slot;
      if (typeof updater === 'function') {
        return updater(slot);
      }
      return { ...slot, ...updater };
    }));
  }, []);

  const activeSlot = slots[activeSlotIdx];

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
    setGlobalStatusText('Launching CLI Authentication. Please check your local terminal or browser window...');
    try {
      const response = await fetch('/api-xai/api/auth/login', {
        method: 'POST'
      });
      if (response.ok) {
        // Wait briefly for the session to refresh
        setTimeout(checkAuthStatus, 4000);
      } else {
        updateSlot(activeSlotIdx, { error: 'Failed to launch authentication process. Please run "grok login" directly in your terminal.' });
      }
    } catch (e) {
      updateSlot(activeSlotIdx, { error: 'Communication with the bridge authentication server failed.' });
    } finally {
      setGlobalStatusText(null);
    }
  }, [activeSlotIdx, updateSlot, checkAuthStatus]);

  // CLI Logout Trigger
  const handleAuthLogout = useCallback(async () => {
    const isAnyLoading = slotsRef.current.some(s => s.isLoading);
    if (isAnyLoading) {
      updateSlot(activeSlotIdx, { error: 'Cannot logout while video generation is in progress.' });
      return;
    }

    setGlobalStatusText('Logging out from CLI...');
    try {
      const response = await fetch('/api-xai/api/auth/logout', {
        method: 'POST'
      });
      if (response.ok) {
        setIsLoggedIn(false);
        setSlots([
          createEmptySlot(),
          createEmptySlot(),
          createEmptySlot()
        ]);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
        checkAuthStatus();
      } else {
        updateSlot(activeSlotIdx, { error: 'Failed to execute the logout process.' });
      }
    } catch (e) {
      updateSlot(activeSlotIdx, { error: 'Communication with the bridge logout server failed.' });
    } finally {
      setGlobalStatusText(null);
    }
  }, [activeSlotIdx, updateSlot, checkAuthStatus]);

  // 마운트 시 인증 체크 및 주기적 실시간 세션 감시 기동
  useEffect(() => {
    checkAuthStatus();
    const interval = setInterval(checkAuthStatus, 3000);
    return () => clearInterval(interval);
  }, [checkAuthStatus]);

  // 비디오 생성 중 브라우저 종료/새로고침 방지 안전장치
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      const isAnyLoading = slotsRef.current.some(s => s.isLoading);
      if (isAnyLoading) {
        e.preventDefault();
        e.returnValue = '비디오 생성 중에 페이지를 벗어나면 생성이 중단될 수 있습니다. 절대 브라우저 창이나 탭을 닫지 마세요!';
        return e.returnValue;
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      updateSlot(activeSlotIdx, { error: 'Only image files are allowed for upload.' });
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;

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

        updateSlot(activeSlotIdx, {
          imageBase64: base64,
          aspectRatio: bestMatch.name,
          error: null
        });
        console.log(`[Auto Aspect Ratio] Slot ${activeSlotIdx + 1} Image Size: ${w}x${h} (Ratio: ${r.toFixed(3)}). Auto-set to: ${bestMatch.name}`);
      };
      img.src = base64;
    };
    reader.onerror = () => {
      updateSlot(activeSlotIdx, { error: 'An error occurred while reading the file.' });
    };
    reader.readAsDataURL(file);
  }, [activeSlotIdx, updateSlot]);

  const clearImage = useCallback(() => {
    updateSlot(activeSlotIdx, {
      imageBase64: null,
      aspectRatio: '16:9'
    });
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [activeSlotIdx, updateSlot]);

  const handleGenerate = useCallback(async () => {
    const targetIdx = activeSlotIdx;
    const currentSlot = slotsRef.current[targetIdx];
    const promptVal = currentSlot.prompt;
    const modelVal = currentSlot.selectedModel;
    const imageVal = currentSlot.imageBase64;
    const durationVal = currentSlot.duration;
    const aspectVal = currentSlot.aspectRatio;
    const resolutionVal = currentSlot.resolution;

    if (!promptVal.trim()) {
      updateSlot(targetIdx, { error: 'Please enter a prompt.' });
      return;
    }

    updateSlot(targetIdx, {
      isLoading: true,
      error: null,
      videoUrl: null,
      statusText: 'Requesting video generation...'
    });

    try {
      const durationSeconds = parseInt(durationVal) || 5;
      const requestBody: any = {
        model: modelVal,
        prompt: promptVal,
        duration: durationSeconds,
        aspect_ratio: aspectVal,
        resolution: resolutionVal
      };

      if (imageVal) {
        requestBody.image = {
          url: imageVal
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

      let isCompleted = false;
      updateSlot(targetIdx, { statusText: 'Generating video... Please wait (this can take up to a few minutes)' });
      
      while (!isCompleted) {
        await new Promise(resolve => setTimeout(resolve, 5000));

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
             updateSlot(targetIdx, { videoUrl: finalUrl, isLoading: false, statusText: null });
             
             const newHistoryItem = { id: requestId, prompt: promptVal, url: finalUrl, timestamp: Date.now() };
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
      }
      
    } catch (err: any) {
      console.error(`[Slot ${targetIdx + 1}] Generation error:`, err);
      updateSlot(targetIdx, {
        error: err.message || 'An unexpected error occurred during video generation.',
        isLoading: false,
        statusText: null
      });
    }
  }, [activeSlotIdx, updateSlot]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const currentSlot = slotsRef.current[activeSlotIdx];
      if (!currentSlot.isLoading) handleGenerate();
    }
  }, [activeSlotIdx, handleGenerate]);

  return (
    <div className="glass-panel" style={{ position: 'relative' }}>
      {/* 2. CLI Authentication Warning banner */}
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
          boxShadow: '0 8px 32px 0 rgba(239, 71, 111, 0.08)'
        }}>
          <div style={{ fontSize: '1.1rem', fontWeight: 600, color: '#ef476f', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            ⚠️ CLI Authentication Session Not Detected
          </div>
          <div style={{ fontSize: '0.88rem', color: 'var(--text-muted)', lineHeight: 1.45 }}>
            To generate videos, you must be logged into the CLI.<br />
            Click the button below to easily authenticate your account.
          </div>
          <button 
            type="button"
            onClick={handleAuthLogin}
            disabled={globalStatusText !== null}
            style={{
              background: 'linear-gradient(135deg, #ef476f 0%, #ff6b6b 100%)',
              color: 'white',
              border: 'none',
              borderRadius: '10px',
              padding: '0.6rem 1.4rem',
              fontSize: '0.92rem',
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: '0 4px 15px rgba(239, 71, 111, 0.25)',
              transition: 'all 0.2s ease',
              marginTop: '0.2rem'
            }}
            onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-1px)'}
            onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
          >
            Authenticate CLI (Browser OAuth)
          </button>
        </div>
      )}

      {/* globalStatusText indicator for CLI processes */}
      {globalStatusText && (
        <div className="status-text" style={{ textAlign: 'center', fontWeight: 500, marginBottom: '1rem' }}>
          {globalStatusText}
        </div>
      )}

      {/* 2.5 Multi-Slot 3 Tabs Bar & Integrated CLI Logout Button */}
      {isLoggedIn === true && (
        <div className="slot-tabs-container">
          <div style={{ display: 'flex', gap: '0.6rem', flex: 1 }}>
            {slots.map((slot, idx) => {
              const isGenerating = slot.isLoading;
              const isReady = !!slot.videoUrl;
              
              let badgeEmoji = '🟢';
              let badgeClass = 'slot-badge';
              if (isGenerating) {
                badgeEmoji = '⏳';
                badgeClass += ' generating';
              } else if (isReady) {
                badgeEmoji = '🎬';
              }

              return (
                <button
                  key={idx}
                  type="button"
                  className={`slot-tab-btn ${activeSlotIdx === idx ? 'active' : ''}`}
                  onClick={() => setActiveSlotIdx(idx)}
                  style={{ flex: 1 }}
                >
                  <span>Slot {idx + 1}</span>
                  <span className={badgeClass}>{badgeEmoji}</span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={handleAuthLogout}
            disabled={slots.some(s => s.isLoading) || globalStatusText !== null}
            className="slot-logout-btn"
          >
            🔒 CLI Logout
          </button>
        </div>
      )}

      {/* 3. Dropdown Options Row (Settings bar with 3 columns) */}
      <div className="settings-option-grid">
        <div className="input-group">
          <label htmlFor="model-select">Select Video Model</label>
          <select 
            id="model-select" 
            className="model-select"
            value={activeSlot.selectedModel}
            onChange={(e) => updateSlot(activeSlotIdx, { selectedModel: e.target.value })}
            disabled={activeSlot.isLoading}
          >
            {MODELS.map(model => (
              <option key={model.id} value={model.id}>{model.label}</option>
            ))}
          </select>
        </div>

        <div className="input-group">
          <label htmlFor="resolution-select">Resolution / Quality</label>
          <select 
            id="resolution-select" 
            className="model-select"
            value={activeSlot.resolution}
            onChange={(e) => updateSlot(activeSlotIdx, { resolution: e.target.value })}
            disabled={activeSlot.isLoading}
          >
            <option value="720p">High Definition (720p)</option>
            <option value="480p">Standard Definition (480p)</option>
          </select>
        </div>

        <div className="input-group">
          <label htmlFor="duration-select">Duration</label>
          <select 
            id="duration-select" 
            className="model-select"
            value={activeSlot.duration}
            onChange={(e) => updateSlot(activeSlotIdx, { duration: e.target.value })}
            disabled={activeSlot.isLoading}
          >
            <option value="5s">5 Seconds</option>
            <option value="10s">10 Seconds</option>
            <option value="15s">15 Seconds</option>
          </select>
        </div>
      </div>

      {/* 4. Core Workspace layout (2-Column Grid: Prompt & Source Image Upload well) */}
      <div className="studio-workspace-grid">
        {/* Left column: Text Prompt area */}
        <div className="input-group" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
          <label htmlFor="prompt">What kind of video would you like to create?</label>
          <textarea
            id="prompt"
            className="prompt-input"
            placeholder="e.g., A neon-lit cyberpunk cat walking down a cinematic street, 4k..."
            value={activeSlot.prompt}
            onChange={(e) => updateSlot(activeSlotIdx, { prompt: e.target.value })}
            onKeyDown={handleKeyDown}
            disabled={activeSlot.isLoading}
            style={{ flex: 1, minHeight: '180px' }}
          />
        </div>

        {/* Right column: Source Image Uploader Well */}
        <div className="input-group" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
          <label>Source Image (Optional)</label>
          <input 
            type="file" 
            ref={fileInputRef}
            className="file-input" 
            accept="image/*" 
            onChange={handleFileChange}
            disabled={activeSlot.isLoading}
            style={{ display: 'none' }}
          />
          
          {!activeSlot.imageBase64 ? (
            <div className="upload-card-well" onClick={() => fileInputRef.current?.click()}>
              <span className="upload-icon">📸</span>
              <span className="upload-title">Upload Image</span>
              <span className="upload-subtitle">Click here to browse<br/>local files to animate</span>
            </div>
          ) : (
            <div className="preview-studio-card">
              <img src={activeSlot.imageBase64} alt="Source Preview" className="preview-studio-img" />
              <div className="preview-studio-overlay">
                <button type="button" className="overlay-change-btn" onClick={() => fileInputRef.current?.click()} disabled={activeSlot.isLoading}>
                  Change
                </button>
                <button type="button" className="overlay-remove-btn" onClick={clearImage} disabled={activeSlot.isLoading}>
                  Remove
                </button>
              </div>
              <div className="preview-studio-badge">
                <span>🖼️</span> Aspect: {activeSlot.aspectRatio}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 5. Informative Banner */}
      <div className="tip-studio-banner">
        <span className="emoji">💡</span>
        <span>Aspect ratio auto-adjusts to match your source image.</span>
      </div>

      {/* 6. Premium Generate Button */}
      <button 
        className="generate-studio-btn" 
        onClick={handleGenerate}
        disabled={activeSlot.isLoading || !activeSlot.prompt.trim()}
      >
        {activeSlot.isLoading ? (
          <>
            <span className="spinner"></span>
            Generating...
          </>
        ) : (
          <>🎬 Generate Video</>
        )}
      </button>

      {/* 7. Loading progress status message */}
      {activeSlot.statusText && <div className="status-text" style={{ textAlign: 'center', fontWeight: 500 }}>{activeSlot.statusText}</div>}

      {/* 8. Safety/Interruption Warning Box */}
      {activeSlot.isLoading && (
        <div style={{
          background: 'rgba(239, 71, 111, 0.12)',
          border: '1px solid rgba(239, 71, 111, 0.35)',
          borderRadius: '14px',
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

      {/* 9. Error display Modal */}
      <ErrorModal 
        isOpen={!!activeSlot.error} 
        message={activeSlot.error || ''} 
        onClose={() => updateSlot(activeSlotIdx, { error: null })} 
      />

      {/* 10. Main Output Video / Placeholder Canvas */}
      <div className="video-container">
        {activeSlot.videoUrl ? (
          <video 
            ref={videoRef}
            className="video-player" 
            src={activeSlot.videoUrl} 
            controls 
            autoPlay 
            loop 
          />
        ) : (
          <div className="video-placeholder">
            <div className="placeholder-icon">🎬</div>
            <p style={{ fontSize: '0.95rem' }}>{activeSlot.isLoading ? 'AI is crafting a stunning video. This process may take a few minutes.' : 'Provide a prompt and optional image, then click Generate.'}</p>
            {activeSlot.isLoading && (
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
                <div style={{ fontWeight: 500, fontSize: '0.85rem', color: 'rgba(255, 107, 107, 0.9)', lineHeight: 1.4 }}>
                  Generation in progress. Closing this page or refreshing will abort your video generation.
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 11. Generation History Section */}
      {history.length > 0 && (
        <div className="history-section" style={{ marginTop: '2rem', width: '100%' }}>
          <h3 style={{ marginBottom: '1rem', borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.5rem', fontSize: '1.15rem' }}>Generation History</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxHeight: '300px', overflowY: 'auto', paddingRight: '0.5rem' }}>
            {history.map(item => (
              <div key={item.id} style={{ background: 'rgba(0,0,0,0.3)', padding: '1rem', borderRadius: '12px', border: '1px solid var(--glass-border)', display: 'flex', gap: '1rem', alignItems: 'center' }}>
                <video src={item.url} style={{ width: '120px', height: '67px', borderRadius: '8px', objectFit: 'cover', background: '#000' }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '0.2rem' }}>
                    {new Date(item.timestamp).toLocaleString()}
                  </div>
                  <div style={{ fontSize: '0.92rem', wordBreak: 'break-all', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', color: '#f0f0f5' }}>
                    {item.prompt}
                  </div>
                </div>
                <button 
                  onClick={() => updateSlot(activeSlotIdx, { videoUrl: item.url })} 
                  className="btn-primary" 
                  style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', background: 'var(--primary-color)', border: 'none', borderRadius: '8px' }}
                >
                  Play in Slot {activeSlotIdx + 1}
                </button>
                <a 
                  href={item.url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="btn-primary" 
                  style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', textDecoration: 'none', background: 'transparent', border: '1px solid var(--primary-color)', borderRadius: '8px', color: '#fff', textAlign: 'center' }}
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

