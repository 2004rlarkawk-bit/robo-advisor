/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ENABLE_TEST_SUBMISSION?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
