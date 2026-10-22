import { parseArgs } from 'node:util';
import { logger } from './logger.js';
import { spawnSync } from 'node:child_process';
import path from "node:path";
import fs from "node:fs/promises";
import url from "node:url";

const { positionals } = parseArgs({
  allowPositionals: true
});

const [arg, arg2] = positionals;
if ( !arg ) {
  process.exit(0);
}

if ( arg != "help" && arg != "version" && arg != "--version" && arg != "start" && arg != "-v" ) {
  logger.error(`Unknown command: \x1b[33m${arg}`);
  logger.skip();
  logger.notice("You can get commands by typing \"hostjs help\".");
  process.exit(1);
} else if ( arg == "help" ) {
  logger.log("Avaliable HostJS commands:");
  logger.skip();
  logger.log("  help    => Get help with HostJS commands.");
  logger.log("  version => See the current downloaded version.");
  logger.log("    [-v|--version] => Other ways to get version.");
  logger.log("  start   => Start your website.");
} else if ( arg == "start" ) {
  logger.notice("Starting...");
  let file = "index.ts";
  const command = "node";
  const commandArg = "--experimental-strip-types";
  if ( arg2 != null ) file = arg2;

  const result = spawnSync(command, [commandArg, file], { stdio: 'inherit' });

  if ( result.status !== 0 ) {
    logger.error(`Process exited with code ${result.status}`);
    process.exit(result.status || 1);
  }
} else if ( arg == "-v" || arg == "version" || arg == "--version" ) {
  const __filename = url.fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const packageJsonPath = path.join(__dirname, '..', 'package.json');
  async function loadPackageConfig() {
    try {
      const rawData = await fs.readFile(packageJsonPath, 'utf-8');

      const packageJson = JSON.parse(rawData);

      return packageJson
    } catch (error) {
      logger.error('Failed to read package.json:', error);
      process.exit(1);
    }
  }

  const package_ = await loadPackageConfig();
  logger.notice(`Authtics Host version: ${package_.version}`);
}
process.exit(0);
