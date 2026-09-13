import {
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { FormDefinitionsService } from './form-definitions.service.js';
import type { FormDefinitionBody, MergeOptions } from './types.js';

/** Token for injecting the locked-keys set from registerReservedKeys */
export const FORMS_LOCKED_KEYS = 'FORMS_LOCKED_KEYS';

@Controller('forms')
export class FormDefinitionsController {
  constructor(
    private readonly svc: FormDefinitionsService,
    @Inject(FORMS_LOCKED_KEYS)
    private readonly lockedKeys: ReadonlySet<string>,
  ) {}

  /**
   * GET /forms/:key?tenantId=<uuid>
   *
   * Returns the effective published definition for the given form key.
   * Client apps call this at runtime — no deployment required when admin publishes.
   */
  @Get(':key')
  async getEffective(
    @Param('key') formKey: string,
    @Query('tenantId') tenantId?: string,
  ): Promise<{ formKey: string; definition: FormDefinitionBody }> {
    if (!tenantId) {
      // Platform-only query (no tenant context)
      const record = await this.svc.getPublished(formKey, null);
      if (!record) throw new NotFoundException(`Form "${formKey}" has no published definition`);
      return { formKey, definition: record.definition };
    }

    const mergeOptions: MergeOptions = { lockedKeys: this.lockedKeys };
    const definition = await this.svc.getEffectiveDefinition(formKey, tenantId, mergeOptions);
    if (!definition) throw new NotFoundException(`Form "${formKey}" has no published definition`);
    return { formKey, definition };
  }

  /**
   * GET /forms/:key/draft?tenantId=<uuid>
   *
   * Returns the current draft for the Form Builder UI.
   */
  @Get(':key/draft')
  async getDraft(
    @Param('key') formKey: string,
    @Query('tenantId') tenantId?: string,
  ) {
    const record = await this.svc.getDraft(formKey, tenantId ?? null);
    if (!record) throw new NotFoundException(`No draft found for form "${formKey}"`);
    return record;
  }

  /**
   * PUT /forms/:key?tenantId=<uuid>
   *
   * Saves a draft definition. Called by the admin Form Builder on every change.
   */
  @Put(':key')
  async saveDraft(
    @Param('key') formKey: string,
    @Query('tenantId') tenantId: string | undefined,
    @Body() definition: FormDefinitionBody,
  ) {
    return this.svc.saveDraft(formKey, tenantId ?? null, definition);
  }

  /**
   * POST /forms/:key/publish?tenantId=<uuid>
   *
   * Promotes current draft to PUBLISHED. After this call, all users see
   * the new definition on their next request — zero deployment.
   */
  @Post(':key/publish')
  async publish(
    @Param('key') formKey: string,
    @Query('tenantId') tenantId: string | undefined,
    @Body() body: { publishedBy: string },
  ) {
    return this.svc.publish(formKey, tenantId ?? null, body.publishedBy);
  }

  /** GET /forms — lists all registered platform-level form keys */
  @Get()
  async listFormKeys(): Promise<{ formKeys: string[] }> {
    return { formKeys: await this.svc.listFormKeys() };
  }
}
