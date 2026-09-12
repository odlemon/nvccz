// @ts-nocheck

export class FundraisingIrError extends Error {
  statusCode: number;
  code: string;
  unmetRequirements?: string[];
  unmet?: string[];

  constructor(
    statusCode: number,
    code: string,
    message: string,
    extra?: { unmetRequirements?: string[]; unmet?: string[] }
  ) {
    super(message);
    this.name = "FundraisingIrError";
    this.statusCode = statusCode;
    this.code = code;
    if (extra?.unmetRequirements) this.unmetRequirements = extra.unmetRequirements;
    if (extra?.unmet) this.unmet = extra.unmet;
  }

  static notFound(message = "Not found", code = "NOT_FOUND") {
    return new FundraisingIrError(404, code, message);
  }

  static badRequest(message: string, code = "BAD_REQUEST", extra?: { unmetRequirements?: string[]; unmet?: string[] }) {
    return new FundraisingIrError(400, code, message, extra);
  }

  static forbidden(message = "Forbidden", code = "FORBIDDEN") {
    return new FundraisingIrError(403, code, message);
  }

  static conflict(message: string, code = "CONFLICT") {
    return new FundraisingIrError(409, code, message);
  }
}
