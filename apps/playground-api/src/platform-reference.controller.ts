import { Public } from '@gigalibs/auth-nest';
import { ReferenceSetKeySchema } from '@gigalibs/contracts';
import { BadRequestException, Controller, Get, Header, Param } from '@nestjs/common';
// biome-ignore lint/style/useImportType: NestJS needs the runtime constructor token for dependency injection.
import { PlatformReferenceService } from './platform-reference.service.js';

// WI-OI-120av (Phase 5A): read-only lookups for platform reference data. The sets are non-sensitive published
// standards (ISO 4217 currencies, IANA time zones, …) every workspace and module reads, so the read is Public. The
// platform-operator LOAD is a separate Platform Control Tower action — it must be platform-role gated, which is not
// wired in this app yet, so it stays a service method (PlatformReferenceService.loadGeneratedSet) pending that wiring.
@Controller('platform-reference')
export class PlatformReferenceController {
  constructor(private readonly reference: PlatformReferenceService) {}

  @Public()
  @Get(':setKey')
  @Header('Cache-Control', 'public, max-age=300')
  lookup(@Param('setKey') setKey: string) {
    const parsed = ReferenceSetKeySchema.safeParse(setKey);
    if (!parsed.success)
      throw new BadRequestException(`Unknown reference set; expected one of ${ReferenceSetKeySchema.options.join(', ')}.`);
    return this.reference.lookup(parsed.data);
  }
}
