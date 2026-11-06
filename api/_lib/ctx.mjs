import { redisFromEnv } from './store.mjs';
// Built once per function instance. Everything secret comes from Vercel environment variables.
export const ctx = { env: process.env, store: redisFromEnv(process.env), now: () => Date.now() };
