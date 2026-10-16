export function defineConfig(config) {
    if (config.autoPage == undefined)
        config.autoPage = true;
    if (config.autoFile == undefined)
        config.autoFile = true;
    if (config.showError == undefined)
        config.showError = true;
    if (config.compilerType == undefined)
        config.compilerType = 'esbuild';
    if (config.patchForSsr === undefined)
        config.patchForSsr = false;
    else
        console.warn("[HostJS] Using \"patchForSsr\" in Authtics Host Config is deprecated. Use \"patchForServer\" instead.");
    if (config.patchForServer === undefined)
        config.patchForServer = config.patchForSsr || false;
    if (config.ssr == undefined)
        config.ssr = true;
    else
        console.warn("[HostJS] Using \"ssr\" in Authtics Host Config is deprecated. Use \"renderType\" instead.");
    if (config.renderType == undefined)
        config.renderType = config.ssr ? 'ssr' : 'csr';
    if (config.port == undefined || config.port == 0)
        config.port = 3000;
    if (config.devMode == undefined)
        config.devMode = true;
    if (config.hasPausedRoute == undefined)
        config.hasPausedRoute = false;
    return config;
}
