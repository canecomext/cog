/**
 * Generates domain exception classes
 */
export class DomainExceptionsGenerator {
  /**
   * Generate domain exceptions file content
   */
  generate(): string {
    return `/**
 * Domain-level exceptions
 * These are transport-agnostic and should be converted to appropriate
 * transport-specific errors (e.g., HTTPException) at the REST layer
 */

/**
 * Base domain exception class
 */
export class DomainException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DomainException';

    // Maintains proper stack trace for where our error was thrown
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, DomainException);
    }
  }
}

/**
 * Thrown when a requested entity is not found
 * Typically maps to HTTP 404 Not Found
 */
export class NotFoundException extends DomainException {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundException';
  }
}
`;
  }
}
