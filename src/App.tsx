import React from 'react';
import { VideoGenerator } from './components/VideoGenerator';
import './index.css';

function App() {
  return (
    <>
      {/* Fixed background to prevent scrolling issues */}
      <div className="bg-container">
        <div className="bg-glow-1"></div>
        <div className="bg-glow-2"></div>
      </div>
      
      <div className="app-container">
        <h1>Grok Builder Video Generator</h1>
        <p className="subtitle">Grok CLI 에이전트와 연동하여 고품질 AI 비디오를 생성해 보세요</p>
        
        <VideoGenerator />
      </div>
    </>
  );
}

export default App;
