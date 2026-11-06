import { ctx } from './_lib/ctx.mjs';
import { checkoutConfig } from './_lib/core.mjs';

export const GET = () => checkoutConfig(ctx);
