import { spawn } from 'node:child_process';

const args = process.argv.slice(2);
const env = {
  ...process.env,
  npm_config_user_agent: 'npm',
};

const child = spawn('next', ['dev', ...args], {
  env,
  stdio: 'inherit',
  shell: true,
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});

