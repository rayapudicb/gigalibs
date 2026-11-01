import { StageRoundEvidenceV1 } from '@gigalibs/contracts';
import { CommandContext, type ModuleCommandContext, RequirePermissions, moduleErrors } from '@gigalibs/module-sdk';
import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { AuthorizationGuard } from '../authorization.js';
import { MediaService } from './media.service.js';

const errors = moduleErrors('OPERATOR_ROUNDS','Operator Inspection Rounds');

@Controller('v1/evidence')
@UseGuards(AuthorizationGuard)
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Post()
  @RequirePermissions('operator-rounds.runs.execute')
  stage(@CommandContext() context:ModuleCommandContext,@Body() body:unknown) {
    return this.media.stage(context,errors.parseInput(StageRoundEvidenceV1,body));
  }

  @Post(':id/commit')
  @RequirePermissions('operator-rounds.runs.execute')
  commit(@CommandContext() context:ModuleCommandContext,@Param('id') id:string) {
    errors.assertUuid(id,'evidenceId');
    return this.media.commit(context,id);
  }
}
