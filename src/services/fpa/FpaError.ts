// @ts-nocheck

export class FpaError extends Error {
  statusCode: number;
  code: string;
  errors?: Array<{ code: string; step?: string; message: string; field?: string }>;
  data?: any;

  constructor(
    statusCode: number,
    code: string,
    message: string,
    errors?: Array<{ code: string; step?: string; message: string; field?: string }>,
    data?: any
  ) {
    super(message);
    this.name = "FpaError";
    this.statusCode = statusCode;
    this.code = code;
    this.errors = errors;
    this.data = data;
  }
}
