#!/usr/bin/env node
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const apiDir = path.join(rootDir, 'src', 'Ground-grid & coordinates grabber');

const isWindows = process.platform === 'win32';
const installDeps = process.argv.includes('--install-deps');

const command = isWindows ? 'cmd.exe' : 'bash';
const args = isWindows
  ? ['/d', '/s', '/c', 'start_api_server.bat']
  : [path.join(rootDir, 'scripts', 'start-coordinates-backend.sh'), ...(installDeps ? ['--install-deps'] : [])];

const child = spawn(command, args, {
  cwd: apiDir,
  stdio: 'inherit',
  shell: false,
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});

child.on('error', (err) => {
  console.error(`[ERROR] Failed to start backend: ${err.message}`);
  process.exit(1);
});
