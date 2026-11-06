import { ctx } from './_lib/ctx.mjs';
import { paddleWebhook } from './_lib/core.mjs';

export const POST = (request) => paddleWebhook(request, ctx);
