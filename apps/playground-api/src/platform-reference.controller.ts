import { CurrentUser, Public } from '@gigalibs/auth-nest';
import { ReferenceSetKeySchema } from '@gigalibs/contracts';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Param,
  Post,
  Query,
} from '@nestjs/common';
// biome-ignore lint/style/useImportType: NestJS needs the runtime constructor token for dependency injection.
import { PlatformReferenceService } from './platform-reference.service.js';

// WI-OI-120av / WI-OI-176: read-only lookups for platform reference data; operator load and version history gated.
@Controller('platform-reference')
export class PlatformReferenceController {
  constructor(private readonly reference: PlatformReferenceService) {}

  @Get('versions')
  async listVersions(
    @Query('setKey') setKey: string | undefined,
    @CurrentUser('sub') userId: string,
  ) {
    await this.reference.assertPlatformOperator(userId);
    const parsed = setKey ? ReferenceSetKeySchema.safeParse(setKey) : { success: true as const, data: undefined };
    if (setKey && !parsed.success)
      throw new BadRequestException(`Unknown reference set; expected one of ${ReferenceSetKeySchema.options.join(', ')}.`);
    return this.reference.listVersions(parsed.success ? parsed.data : undefined);
  }

  @Public()
  @Get(':setKey')
  @Header('Cache-Control', 'public, max-age=300')
  lookup(@Param('setKey') setKey: string) {
    const parsed = ReferenceSetKeySchema.safeParse(setKey);
    if (!parsed.success)
      throw new BadRequestException(`Unknown reference set; expected one of ${ReferenceSetKeySchema.options.join(', ')}.`);
    return this.reference.lookup(parsed.data);
  }

  @Post(':setKey/load-generated')
  async loadGenerated(
    @Param('setKey') setKey: string,
    @Body() body: { reason?: unknown },
    @CurrentUser('sub') userId: string,
  ) {
    await this.reference.assertPlatformOperator(userId);
    const parsed = ReferenceSetKeySchema.safeParse(setKey);
    if (!parsed.success)
      throw new BadRequestException(`Unknown reference set; expected one of ${ReferenceSetKeySchema.options.join(', ')}.`);
    const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';
    if (reason.length < 3 || reason.length > 500)
      throw new BadRequestException('A load reason of 3 to 500 characters is required.');
    return this.reference.loadGeneratedSet(userId, parsed.data, reason);
  }
}
