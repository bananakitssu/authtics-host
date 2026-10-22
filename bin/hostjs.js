import { parseArgs } from 'node:util';
import { logger } from './logger.js';
import { spawnSync } from 'node:child_process';

const { positionals } = parseArgs({
  allowPositionals: true
});

const [arg, arg2] = positionals;
if ( !arg ) {
  process.exit(0);
}

if ( arg != "help" && arg != "version" && arg != "start" ) {
  logger.error(`Unknown command: \x1b[33m${arg}`);
  logger.skip();
  logger.notice("You can get commands by typing \"hostjs help\".");
  process.exit(1);
} else if ( arg == "help" ) {
  logger.log("Avaliable HostJS commands:");
  logger.skip();
  logger.log("  help    => Get help with HostJS commands.");
  logger.log("  version => See the current downloaded version.");
  logger.log("  start   => Start your website.");
} else if ( arg == "start" ) {
  logger.notice("Starting...");
  let file = "index.ts";
  const command = "node";
  const commandArg = "--experimental-strip-types";
  if ( arg2 != null ) file = arg2;

  /*const child = spawn(command, [commandArg, file]);

  child.stdout.on('data', (data) => {
    console.log(`${data.toString()}`);
  });

  child.stderr.on('data', (data) => {
    console.error(`${data.toString()}`);
  });

  child.on('close', (code) => {
    if ( code != 0 ) logger.error(`Process exited with code ${code}`);
  });*/
  const result = spawnSync(command, [commandArg, file], { stdio: 'inherit' });

  if ( result.status !== 0 ) {
    logger.error(`Process exited with code ${result.status}`);
    process.exit(result.status || 1);
  }
}
process.exit(0);
