export interface AuthticsConfig {
    port?: number;
    ssr?: boolean;
    renderType?: 'ssr' | 'csr' | 'ssg' | 'srtws';
    dir?: string;
    devMode?: boolean;
    compilerType?: 'esbuild';
    hotReload?: boolean;
    dat?: string | string[];
    showError?: boolean;
    autoPage?: boolean;
    autoPageDir?: string;
    autoFile?: boolean;
    autoFileDir?: string;
    hasPausedRoute?: boolean;
    patchForSsr?: boolean;
    patchForServer?: boolean;
}
export declare function defineConfig(config: AuthticsConfig): AuthticsConfig;
