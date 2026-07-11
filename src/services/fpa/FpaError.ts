// @ts-nocheck

export class FpaError extends Error {
  statusCode: number;
  code: string;
  errors?: Array<{ code: string; step?: string; message: string; field?: string }>;

  constructor(
    statusCode: number,
    code: string,
    message: string,
    errors?: Array<{ code: string; step?: string; message: string; field?: string }>
  ) {
    super(message);
    this.name = "FpaError";
    this.statusCode = statusCode;
    this.code = code;
    this.errors = errors;
  }
}
