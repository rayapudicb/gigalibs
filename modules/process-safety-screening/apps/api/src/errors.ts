import { moduleErrors } from '@gigalibs/module-sdk';
import { ForbiddenException, UnprocessableEntityException } from '@nestjs/common';

/** SPEED's error helpers; codes carry the `SPEED_` prefix (WI-OI-120bw). */
export const errors = moduleErrors('SPEED', 'SPEED');

/** A change refused by a rule of the record's state, with its code. */
export function refuse(code: string, message: string): never {
  throw new ForbiddenException({ code, message });
}

/** Input the engines refuse (a formula error, a value out of range), field by field with the engine's codes. */
export function unprocessable(code: string, message: string, issues: readonly unknown[]): never {
  throw new UnprocessableEntityException({ code, message, issues });
}
