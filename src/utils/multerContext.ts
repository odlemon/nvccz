// @ts-nocheck
import multer from "multer";
import { requestContext } from "./requestContext";

/**
 * Multer reads the request body from stream events, and Node does not carry AsyncLocalStorage across those, so anything that
 * ran after an upload (a controller writing an audit row) lost the request's IP, device and signed-in user. This wraps every
 * multer middleware once, at start-up, to re-enter the request context after the body has been read.
 *
 * It also turns multer's own refusals into answers a person can act on: a file over the limit is a 413 with a message,
 * not an unexplained 500.
 *
 * Imported first in app.ts, before any route file builds its upload middleware.
 */
const proto = Object.getPrototypeOf(multer({ storage: multer.memoryStorage() }));
for (const method of ["single", "array", "fields", "any", "none"]) {
  const original = proto[method];
  if (typeof original !== "function" || original.__requestContextBound) continue;
  const bound = function (...args: any[]) {
    const middleware = original.apply(this, args);
    return (req: any, res: any, next: any) => {
      const store = requestContext.getStore();
      middleware(req, res, (err?: any) => {
        if (err && err.name === "MulterError") {
          const tooLarge = err.code === "LIMIT_FILE_SIZE";
          return res.status(tooLarge ? 413 : 400).json({
            success: false,
            message: tooLarge ? "A file is larger than the upload limit. Reduce its size, or split it, and try again." : `The upload was not accepted: ${err.message}`,
          });
        }
        if (store) return requestContext.run(store, () => next(err));
        return next(err);
      });
    };
  };
  bound.__requestContextBound = true;
  proto[method] = bound;
}
