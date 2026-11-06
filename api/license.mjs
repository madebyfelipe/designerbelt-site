import { ctx } from './_lib/ctx.mjs';
import { licenseForTxn } from './_lib/core.mjs';

export const GET = (request) => licenseForTxn(request, ctx);
