// @ts-nocheck
import { Request, Response, NextFunction } from "express";

export const noCacheMiddleware = (req: Request, res: Response, next: NextFunction) => {
  // Set cache control headers
  res.set({
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0'
  });
  
  next();
};
