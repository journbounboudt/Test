// Runs the API server and the Vite client together for local development.
import { spawn } from 'node:child_process';

const procs = [
  spawn('npm', ['run', 'dev', '-w', '@void-rush/server'], { stdio: 'inherit', env: process.env }),
  spawn('npm', ['run', 'dev', '-w', '@void-rush/client'], { stdio: 'inherit', env: process.env }),
];
const stop = () => {
  for (const p of procs) p.kill('SIGTERM');
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
for (const p of procs) p.on('exit', (code) => code && stop());
