import { buildApp } from './app.ts';
import { loadEnv } from './env.ts';

const env = loadEnv();
const { app } = buildApp(env);

app.listen({ port: env.port, host: env.host }).then(
  (addr) => console.log(`[void-rush] server listening on ${addr} (telegram auth: ${env.botToken ? 'on' : 'off'}, dev auth: ${env.devAuth ? 'on' : 'off'}, sandbox payments: ${env.paymentsSandbox ? 'on' : 'off'})`),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    app.close().finally(() => process.exit(0));
  });
}
