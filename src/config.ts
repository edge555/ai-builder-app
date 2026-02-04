export interface FrontendConfig {
  api: {
    baseUrl: string;
    timeout: number;
  };
}

export const config: FrontendConfig = {
  api: {
    // Default to same-origin in previews/production; override in local dev via VITE_API_BASE_URL.
    baseUrl: import.meta.env.VITE_API_BASE_URL || '',
    timeout: 65000,
  },
};
