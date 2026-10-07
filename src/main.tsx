import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { installPlaceholderTabFill } from './utils/placeholderTabFill';
import { installStaleChunkReload } from './utils/staleChunkReload';

// 빈 입력칸에서 Tab 을 누르면 회색 예시 값을 채운다(예: 통관고유부호, 회사 주소).
installPlaceholderTabFill();
// 배포 전에 연 탭이 지워진 조각 파일을 찾다 실패하면 한 번 새로고침한다(미리보기 '가끔 실패' 방지).
installStaleChunkReload();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
