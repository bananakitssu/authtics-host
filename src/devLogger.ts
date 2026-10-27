function error (msg: string) {
  console.debug(`\[\x1b[35mHostJS\x1b[0m \x1b[31mError\x1b[0m]: ${msg}`);
}

function log (msg: string) {
  console.debug(`\[\x1b[35mHostJS\x1b[0m \x1b[34mInfo\x1b[0m]: ${msg}`);
}

const devLoggerVerbose = {
  error, log
};

export { devLoggerVerbose };