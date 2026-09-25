export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: Record<string, unknown>;

  constructor(code: string, status: number, message: string, details?: Record<string, unknown>) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export const badRequest = (message = 'Некорректный запрос', details?: Record<string, unknown>) => new ApiError('bad_request', 400, message, details);
export const notFound = (message = 'Не найдено') => new ApiError('not_found', 404, message);
export const conflict = (code: string, message: string, details?: Record<string, unknown>) => new ApiError(code, 409, message, details);
