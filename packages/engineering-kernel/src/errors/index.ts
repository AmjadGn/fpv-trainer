export type EngineeringErrorKind =
  | 'domain'
  | 'validation'
  | 'compilation'
  | 'engineering-warning'
  | 'infrastructure';

export class EngineeringError extends Error {
  readonly kind: EngineeringErrorKind;
  readonly code: string;
  readonly details: Readonly<Record<string, unknown>>;

  constructor(
    kind: EngineeringErrorKind,
    code: string,
    message: string,
    details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'EngineeringError';
    this.kind = kind;
    this.code = code;
    this.details = details;
  }
}

export function domainError(
  code: string,
  message: string,
  details?: Record<string, unknown>,
): EngineeringError {
  return new EngineeringError('domain', code, message, details ?? {});
}

export function compilationError(
  code: string,
  message: string,
  details?: Record<string, unknown>,
): EngineeringError {
  return new EngineeringError('compilation', code, message, details ?? {});
}

export function infrastructureError(
  code: string,
  message: string,
  details?: Record<string, unknown>,
): EngineeringError {
  return new EngineeringError('infrastructure', code, message, details ?? {});
}
