import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bootstrapVariableArgs } from './start-worker-config.mjs';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const wranglerCli = resolve(projectRoot, 'node_modules/wrangler/bin/wrangler.js');
const configPath = resolve(projectRoot, 'dist/server/wrangler.json');
const localEnvFiles = ['.env', '.dev.vars']
  .map((name) => resolve(projectRoot, name))
  .filter(existsSync);

if (localEnvFiles.length > 1) {
  console.error('Configure apenas um arquivo local: .env ou .dev.vars.');
  process.exit(2);
}

const args = [
  wranglerCli,
  'dev',
  '--config',
  configPath,
  '--persist-to',
  resolve(projectRoot, '.wrangler/state'),
  '--local',
];

if (localEnvFiles[0]) args.push('--env-file', localEnvFiles[0]);

try {
  const bootstrapArgs = bootstrapVariableArgs(process.env.OPUSLOG_BOOTSTRAP_GLPI_USER_ID);
  args.push(...bootstrapArgs);
  console.log(`OPUSLOG_BOOTSTRAP_GLPI_USER_ID: ${bootstrapArgs.length ? 'PRESENTE' : 'AUSENTE'}`);
} catch {
  console.error('OPUSLOG_BOOTSTRAP_GLPI_USER_ID invalido; o Worker nao foi iniciado.');
  process.exit(2);
}

const child = spawn(process.execPath, args, {
  cwd: projectRoot,
  stdio: 'inherit',
});

child.on('error', () => {
  console.error('Não foi possível iniciar o Wrangler local.');
  process.exitCode = 1;
});
child.on('exit', (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0);
});
