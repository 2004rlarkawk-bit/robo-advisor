/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ENABLE_TEST_SUBMISSION?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// docx 템플릿을 런타임 fetch용 URL 자산으로 임포트 (Vite ?url)
declare module '*.docx?url' {
  const src: string;
  export default src;
}

// xlsx 템플릿(패킹리스트)을 런타임 fetch용 URL 자산으로 임포트 (Vite ?url)
declare module '*.xlsx?url' {
  const src: string;
  export default src;
}
