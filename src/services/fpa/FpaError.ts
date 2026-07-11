// @ts-nocheck

export class FpaError extends Error {
  statusCode: number;
  code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.name = "FpaError";
    this.statusCode = statusCode;
    this.code = code;
  }
}
