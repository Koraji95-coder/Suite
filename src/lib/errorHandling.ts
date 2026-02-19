/**
 * Comprehensive error handling utilities
 * Implements Result<T,E> pattern and AppError class hierarchy
 */

import { logger } from './logger';

// ── AppError Class Hierarchy ──────────────────────────────────

export enum ErrorCategory {
  NETWORK = 'NETWORK',
  VALIDATION = 'VALIDATION',
  AUTHENTICATION = 'AUTHENTICATION',
  AUTHORIZATION = 'AUTHORIZATION',
  NOT_FOUND = 'NOT_FOUND',
  TIMEOUT = 'TIMEOUT',
  UNKNOWN = 'UNKNOWN',
}

export class AppError extends Error {
  public readonly category: ErrorCategory;
  public readonly statusCode?: number;
  public readonly context?: Record<string, unknown>;
  public readonly timestamp: Date;

  constructor(
    message: string,
    category: ErrorCategory = ErrorCategory.UNKNOWN,
    statusCode?: number,
    context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AppError';
    this.category = category;
    this.statusCode = statusCode;
    this.context = context;
    this.timestamp = new Date();

    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AppError);
    }
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      category: this.category,
      statusCode: this.statusCode,
      context: this.context,
      timestamp: this.timestamp.toISOString(),
    };
  }
}

export class NetworkError extends AppError {
  constructor(message: string, statusCode?: number, context?: Record<string, unknown>) {
    super(message, ErrorCategory.NETWORK, statusCode, context);
    this.name = 'NetworkError';
  }
}

export class ValidationError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, ErrorCategory.VALIDATION, 400, context);
    this.name = 'ValidationError';
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication required', context?: Record<string, unknown>) {
    super(message, ErrorCategory.AUTHENTICATION, 401, context);
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends AppError {
  constructor(message: string = 'Insufficient permissions', context?: Record<string, unknown>) {
    super(message, ErrorCategory.AUTHORIZATION, 403, context);
    this.name = 'AuthorizationError';
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, context?: Record<string, unknown>) {
    super(`${resource} not found`, ErrorCategory.NOT_FOUND, 404, context);
    this.name = 'NotFoundError';
  }
}

export class TimeoutError extends AppError {
  constructor(operation: string, timeout: number, context?: Record<string, unknown>) {
    super(
      `${operation} timed out after ${timeout}ms`,
      ErrorCategory.TIMEOUT,
      408,
      context
    );
    this.name = 'TimeoutError';
  }
}

// ── Result<T,E> Pattern ───────────────────────────────────────

export type Result<T, E = AppError> = Success<T> | Failure<E>;

export class Success<T> {
  readonly ok = true as const;
  readonly value: T;

  constructor(value: T) {
    this.value = value;
  }

  map<U>(fn: (value: T) => U): Result<U, never> {
    return new Success(fn(this.value));
  }

  flatMap<U, F>(fn: (value: T) => Result<U, F>): Result<U, F> {
    return fn(this.value);
  }

  mapError<F>(): Result<T, F> {
    return this as unknown as Result<T, F>;
  }

  unwrap(): T {
    return this.value;
  }

  unwrapOr(): T {
    return this.value;
  }
}

export class Failure<E> {
  readonly ok = false as const;
  readonly error: E;

  constructor(error: E) {
    this.error = error;
  }

  map<U>(): Result<U, E> {
    return this as unknown as Result<U, E>;
  }

  flatMap<U, F>(): Result<U, E | F> {
    return this as unknown as Result<U, E | F>;
  }

  mapError<F>(fn: (error: E) => F): Result<never, F> {
    return new Failure(fn(this.error));
  }

  unwrap(): never {
    throw this.error;
  }

  unwrapOr<T>(defaultValue: T): T {
    return defaultValue;
  }
}

// ── Helper functions ──────────────────────────────────────────

export function ok<T>(value: T): Result<T, never> {
  return new Success(value);
}

export function err<E>(error: E): Result<never, E> {
  return new Failure(error);
}

/**
 * Wrap an async function to return Result<T, AppError>
 * Catches all errors and converts them to AppError
 */
export async function tryAsync<T>(
  fn: () => Promise<T>,
  context?: string
): Promise<Result<T, AppError>> {
  try {
    const value = await fn();
    return ok(value);
  } catch (error) {
    const appError = toAppError(error, context);
    logger.error(appError.message, context || 'tryAsync', appError);
    return err(appError);
  }
}

/**
 * Wrap a sync function to return Result<T, AppError>
 * Catches all errors and converts them to AppError
 */
export function trySync<T>(fn: () => T, context?: string): Result<T, AppError> {
  try {
    const value = fn();
    return ok(value);
  } catch (error) {
    const appError = toAppError(error, context);
    logger.error(appError.message, context || 'trySync', appError);
    return err(appError);
  }
}

/**
 * Convert any error to AppError
 */
export function toAppError(error: unknown, context?: string): AppError {
  if (error instanceof AppError) {
    return error;
  }

  if (error instanceof Error) {
    // Check for specific error types
    if (error.name === 'AbortError' || error.message.includes('timeout')) {
      return new TimeoutError('Operation', 0, { originalError: error.message });
    }

    if (error.message.includes('fetch') || error.message.includes('network')) {
      return new NetworkError(error.message, undefined, {
        context,
        originalError: error.message,
      });
    }

    return new AppError(error.message, ErrorCategory.UNKNOWN, undefined, {
      context,
      originalName: error.name,
    });
  }

  if (typeof error === 'string') {
    return new AppError(error, ErrorCategory.UNKNOWN, undefined, { context });
  }

  return new AppError(
    'An unknown error occurred',
    ErrorCategory.UNKNOWN,
    undefined,
    { context, error: String(error) }
  );
}

/**
 * Handle HTTP response errors
 */
export function handleHttpError(response: Response, context?: string): AppError {
  const statusCode = response.status;

  switch (statusCode) {
    case 400:
      return new ValidationError(`Bad request: ${response.statusText}`, { context });
    case 401:
      return new AuthenticationError(response.statusText, { context });
    case 403:
      return new AuthorizationError(response.statusText, { context });
    case 404:
      return new NotFoundError(context || 'Resource', {});
    case 408:
      return new TimeoutError(context || 'Request', 0, {});
    default:
      if (statusCode >= 500) {
        return new NetworkError(`Server error: ${response.statusText}`, statusCode, {
          context,
        });
      }
      return new NetworkError(
        `HTTP ${statusCode}: ${response.statusText}`,
        statusCode,
        { context }
      );
  }
}
