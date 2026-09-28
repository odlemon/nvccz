import { AsyncLocalStorage } from "node:async_hooks";

/**
 * The request a piece of work is running for. The audit writer reads it, so every audit row carries the caller's IP and
 * device without each of the hundreds of call sites having to pass them.
 */
export type RequestContext = { ipAddress: string; userAgent: string; userId?: string };

export const requestContext = new AsyncLocalStorage<RequestContext>();
export const currentRequestContext = (): RequestContext | undefined => requestContext.getStore();
