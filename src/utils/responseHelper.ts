// @ts-nocheck
import type { Response } from "express"

export interface ApiResponse<T = any> {
  success: boolean
  message: string
  data?: T
  error?: string
  timestamp: string
}

export interface PaginatedApiResponse<T = any> extends ApiResponse<T[]> {
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
    hasNextPage: boolean
    hasPrevPage: boolean
  }
}

export class ResponseHelper {
  static success<T>(res: Response, message: string, data?: T, statusCode = 200): Response {
    return res.status(statusCode).json({
      success: true,
      message,
      data,
      timestamp: new Date().toISOString(),
    })
  }

  static error(res: Response, message: string, error?: string, statusCode = 500): Response {
    return res.status(statusCode).json({
      success: false,
      message,
      error,
      timestamp: new Date().toISOString(),
    })
  }

  static paginated<T>(
    res: Response,
    message: string,
    data: T[],
    pagination: {
      page: number
      limit: number
      total: number
      totalPages: number
      hasNextPage: boolean
      hasPrevPage: boolean
    },
    statusCode = 200,
  ): Response {
    return res.status(statusCode).json({
      success: true,
      message,
      data,
      pagination,
      timestamp: new Date().toISOString(),
    })
  }

  static created<T>(res: Response, message: string, data?: T): Response {
    return this.success(res, message, data, 201)
  }

  static badRequest(res: Response, message: string, error?: string): Response {
    return this.error(res, message, error, 400)
  }

  static unauthorized(res: Response, message = "Unauthorized"): Response {
    return this.error(res, message, undefined, 401)
  }

  static forbidden(res: Response, message = "Forbidden"): Response {
    return this.error(res, message, undefined, 403)
  }

  static notFound(res: Response, message = "Resource not found"): Response {
    return this.error(res, message, undefined, 404)
  }

  static conflict(res: Response, message: string, error?: string): Response {
    return this.error(res, message, error, 409)
  }

  static validationError(res: Response, message: string, error?: string): Response {
    return this.error(res, message, error, 422)
  }
}
