export declare function deleteSrtwsServer(): void;
export declare function handleSrtwsConnection(server: any, tsxPath: string, config: any, reqUrl?: string, reqDAT?: string, rmvFileHandler?: (p: string) => void, fileHandler?: (f: string, p: string) => void): boolean;
export type CompilerType = 'esbuild';
export type RenderMode = 'ssr' | 'csr' | 'ssg' | 'srtws';
export declare function findFileUpwards(startDir: string, relativePath: string): string | null;
export declare function renderPage(tsxPath: string, reqUrl?: string, showPanel?: boolean, compiler?: CompilerType, hotReload?: boolean, autoPaging?: boolean, autoPageDir?: string, appDir?: string, fileHandler?: (f: string, p: string) => void, rmvFileHandler?: (p: string) => void, reqDAT?: string | undefined, configDAT?: string | string[] | undefined, renderMode?: RenderMode, patchForServer?: boolean): Promise<string>;
