import { ctx } from './_lib/ctx.mjs';
import { deactivate } from './_lib/core.mjs';

export const POST = (request) => deactivate(request, ctx);
