// @ts-nocheck
import type { Request, Response, NextFunction } from "express"
import { logger } from "../utils/logger"
import { envConfig } from "../utils/env"


export const errorMiddleware = (err: any, req: Request, res: Response, next: NextFunction): void => {

  logger.error("Unhandled error", {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    body: req.body,
    params: req.params,
    query: req.query,
  })

  
  const error = {
    message: err.message || "Internal server error",
    status: err.status || 500,
  }

  if (err.name === "ValidationError") {
    error.message = "Validation Error"
    error.status = 400
  }

  
  if (err.code === 11000) {
    error.message = "Duplicate field value entered"
    error.status = 400
  }

  if (err.name === "CastError") {
    error.message = "Resource not found"
    error.status = 404
  }

  res.status(error.status).json({
    success: false,
    message: error.message,
    ...(envConfig.isDevelopment() && {
      stack: err.stack,
      originalError: err.message,
    }),
    timestamp: new Date().toISOString(),
  })
}
