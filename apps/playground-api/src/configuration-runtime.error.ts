import {
  ConfigurationRuntimeErrorResponseSchema,
  type ConfigurationRuntimeErrorCode,
} from '@gigalibs/contracts';
import { HttpException } from '@nestjs/common';

export function configurationRuntimeError(
  code: ConfigurationRuntimeErrorCode,
  message: string,
  retryable: boolean,
  status: number,
): HttpException {
  return new HttpException(
    ConfigurationRuntimeErrorResponseSchema.parse({
      contractVersion: '1.0',
      code,
      message,
      retryable,
    }),
    status,
  );
}
