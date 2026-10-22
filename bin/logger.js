function skip () {
  return console.log('');
}

function error (msg) {
  return console.error(`[HostJS \x1b[31mError\x1b[0m]: \x1b[31m${msg}\x1b[0m`);
}

function notice (msg) {
  return console.log(`[HostJS \x1b[32mNotice\x1b[0m]: \x1b[32m${msg}\x1b[0m`)
}

function log (msg) {
  return console.log(msg);
}

function warn (msg) {
  return console.log(`[HostJS \x1b[33mWarn\x1b[0m]: \x1b[33m${msg}\x1b[0m`)
}

const logger = {
  skip,
  error,
  notice,
  log,
  warn
}

export { logger };