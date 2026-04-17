import type { Response } from 'express';

export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly requestId?: string;

  public constructor(statusCode: number, code: string, message: string, requestId?: string) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.requestId = requestId;
  }
}

export function toErrorResponse(error: ApiError): {
  status: 'error';
  error: { code: string; message: string; requestId?: string };
} {
  return {
    status: 'error',
    error: {
      code: error.code,
      message: error.message,
      requestId: error.requestId
    }
  };
}

export function sendApiError(response: Response, error: ApiError): void {
  response.status(error.statusCode).json(toErrorResponse(error));
}