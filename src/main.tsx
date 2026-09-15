import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { installPlaceholderTabFill } from './utils/placeholderTabFill';

// 빈 입력칸에서 Tab 을 누르면 회색 예시 값을 채운다(예: 통관고유부호, 회사 주소).
installPlaceholderTabFill();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
