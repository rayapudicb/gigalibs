/**
 * @gigalibs/errors
 *
 * Shared error classes, HTTP exception mapping, NestJS exception filter.
 * Every module throws these — never raw Error or HttpException.
 *
 * @module
 */

export * from './app-error.js';
export * from './http-errors.js';
export { ErrorCode } from '@gigalibs/contracts';
