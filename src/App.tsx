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
        <h1>GeirdevVideoGen</h1>
        <p className="subtitle">Generate high-quality AI videos seamlessly with CLI integration</p>
        
        <VideoGenerator />
      </div>
    </>
  );
}

export default App;
