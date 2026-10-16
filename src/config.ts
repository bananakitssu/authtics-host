export type BuildStyle = 'default' | 'super';
export type BuildTrigger = 'default' | 'prebuilt';

export interface AuthticsConfig {
  port?: number;
  /**
   * Selects the build output layout.
   * - default: preserve the existing .authtics_host cache layout.
   * - super: use the Next.js-inspired .hostjs output layout.
   */
  buildStyle?: BuildStyle;
  /**
   * Selects when page bundles are built.
   * - default: build on the first client request that needs the page.
   * - prebuilt: build discoverable TSX pages before the server starts listening.
   */
  buildTrigger?: BuildTrigger;
  /**
   * @deprecated Use `renderType` instead.
   * Setting this to `true` is equivalent to `renderType: 'ssr'`.
   */
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
  /**
   * @deprecated Use `patchForServer` instead.
   * This option is now an alias for `patchForServer`.
   */
  patchForSsr?: boolean;
  patchForServer?: boolean;
}

export function defineConfig(config: AuthticsConfig): AuthticsConfig {
  if (config.buildStyle == undefined) config.buildStyle = 'default';
  if (config.buildStyle !== 'default' && config.buildStyle !== 'super') {
    throw new Error('[HostJS] Invalid buildStyle. Expected "default" or "super".');
  }
  if (config.buildTrigger == undefined) config.buildTrigger = 'default';
  if (config.buildTrigger !== 'default' && config.buildTrigger !== 'prebuilt') {
    throw new Error('[HostJS] Invalid buildTrigger. Expected "default" or "prebuilt".');
  }

  if (config.autoPage == undefined) config.autoPage = true;
  if (config.autoFile == undefined) config.autoFile = true;
  if (config.showError == undefined)
    config.showError = true
  if (config.compilerType == undefined)
    config.compilerType = 'esbuild'
  if (config.patchForSsr === undefined)
    config.patchForSsr = false;
  else
    console.warn("[HostJS] Using \"patchForSsr\" in Authtics Host Config is deprecated. Use \"patchForServer\" instead.");
  if (config.patchForServer === undefined)
    config.patchForServer = config.patchForSsr || false;
  if (config.ssr == undefined)
    config.ssr = true
  else
    console.warn("[HostJS] Using \"ssr\" in Authtics Host Config is deprecated. Use \"renderType\" instead.");
  if (config.renderType == undefined)
    config.renderType = config.ssr ? 'ssr' : 'csr';
  if (config.port == undefined || config.port == 0)
    config.port = 3000
  if (config.devMode == undefined)
    config.devMode = true
  if (config.hasPausedRoute == undefined)
    config.hasPausedRoute = false

  return config;
}