import { ctx } from './_lib/ctx.mjs';
import { activate } from './_lib/core.mjs';

export const POST = (request) => activate(request, ctx);
