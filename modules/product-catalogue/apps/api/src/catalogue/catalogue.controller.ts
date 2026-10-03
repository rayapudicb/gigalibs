import {
  CreateAttributeDefinitionInputV1Schema,
  CreateCatalogueInputV1Schema,
  CreateCatalogueVersionInputV1Schema,
  CreatePriceListInputV1Schema,
  CreatePriceListVersionInputV1Schema,
  CreateProductCategoryInputV1Schema,
  CreateProductInputV1Schema,
  CreateUomConversionInputV1Schema,
  CreateUomInputV1Schema,
  ResolvePriceInputV1Schema,
  SetProductPriceInputV1Schema,
  UpdateProductCategoryInputV1Schema,
  UpdateProductInputV1Schema,
} from '@gigalibs/contracts';
import { CommandContext, CurrentPrincipal, type ModuleCommandContext, type ModulePrincipal, RequirePermissions } from '@gigalibs/module-sdk';
import { Body, Controller, Get, Headers, HttpCode, Param, Patch, Post, Query, Res, UseGuards } from '@nestjs/common';
import { AuthorizationGuard } from '../authorization.js';
import {
  AddCatalogueEntryV1,
  IdempotencyKeyV1,
  ListProductsQueryV1,
  ProductArchiveInputV1,
  ProductImportCommitV1,
  ProductImportPreviewV1,
  ProductReferenceInputV1,
  UomResolveInputV1,
  VersionTransitionInputV1,
} from './catalogue.contract.js';
import { CatalogueService, errors } from './catalogue.service.js';

interface ReplayResponse { status(code: number): unknown; setHeader(name: string, value: string): unknown }
const key = (value: unknown) => errors.parseInput(IdempotencyKeyV1, value);
const replay = <T extends { result: unknown; replayed: boolean }>(result: T, response: ReplayResponse, created = true) => {
  response.status(result.replayed ? 200 : created ? 201 : 200);
  if (result.replayed) response.setHeader('Idempotency-Replayed', 'true');
  return result.result;
};

@Controller('v1/products')
@UseGuards(AuthorizationGuard)
export class ProductsController {
  constructor(private readonly catalogue: CatalogueService) {}

  @Get() @RequirePermissions('products:read')
  list(@CurrentPrincipal() principal: ModulePrincipal, @Query() query: unknown) {
    return this.catalogue.listProducts(principal, errors.parseInput(ListProductsQueryV1, query));
  }

  @Post() @RequirePermissions('products:create')
  async create(@CommandContext() context: ModuleCommandContext, @Headers('idempotency-key') header: unknown,
    @Body() body: unknown, @Res({ passthrough: true }) response: ReplayResponse) {
    return replay(await this.catalogue.createProduct(context, errors.parseInput(CreateProductInputV1Schema, body), key(header)), response);
  }

  @Post('import/preview') @HttpCode(200) @RequirePermissions('products:import')
  preview(@Body() body: unknown) { return this.catalogue.previewImport(errors.parseInput(ProductImportPreviewV1, body).rows); }

  @Post('import/commit') @RequirePermissions('products:import')
  commit(@CommandContext() context: ModuleCommandContext, @Headers('idempotency-key') header: unknown, @Body() body: unknown) {
    return this.catalogue.commitImport(context, errors.parseInput(ProductImportCommitV1, body).rows, key(header));
  }

  @Get('export') @RequirePermissions('products:export')
  export(@CurrentPrincipal() principal: ModulePrincipal) { return this.catalogue.exportProducts(principal); }

  @Get(':id') @RequirePermissions('products:read')
  get(@CurrentPrincipal() principal: ModulePrincipal, @Param('id') id: string) { return this.catalogue.getProduct(principal, id); }

  @Patch(':id') @RequirePermissions('products:update')
  update(@CommandContext() context: ModuleCommandContext, @Param('id') id: string, @Body() body: unknown) {
    return this.catalogue.updateProduct(context, id, errors.parseInput(UpdateProductInputV1Schema, body));
  }

  @Post(':id/archive') @HttpCode(200) @RequirePermissions('products:archive')
  archive(@CommandContext() context: ModuleCommandContext, @Param('id') id: string, @Body() body: unknown) {
    const input = errors.parseInput(ProductArchiveInputV1, body);
    return this.catalogue.setProductArchive(context, id, input.expectedVersion, input.reason, false);
  }

  @Post(':id/restore') @HttpCode(200) @RequirePermissions('products:archive')
  restore(@CommandContext() context: ModuleCommandContext, @Param('id') id: string, @Body() body: unknown) {
    const input = errors.parseInput(ProductArchiveInputV1, body);
    return this.catalogue.setProductArchive(context, id, input.expectedVersion, input.reason, true);
  }

  @Get(':id/snapshot') @RequirePermissions('products:read')
  snapshot(@CommandContext() context: ModuleCommandContext, @Param('id') id: string) { return this.catalogue.productSnapshot(context, id); }

  @Post(':id/references') @RequirePermissions('products:update')
  async reference(@CommandContext() context: ModuleCommandContext, @Param('id') id: string,
    @Headers('idempotency-key') header: unknown, @Body() body: unknown, @Res({ passthrough: true }) response: ReplayResponse) {
    return replay(await this.catalogue.addReference(context, id, errors.parseInput(ProductReferenceInputV1, body), key(header)), response);
  }
}

@Controller('v1/product-categories')
@UseGuards(AuthorizationGuard)
export class CategoriesController {
  constructor(private readonly catalogue: CatalogueService) {}
  @Get() @RequirePermissions('products:read')
  list(@CurrentPrincipal() principal: ModulePrincipal) { return this.catalogue.listCategories(principal); }
  @Post() @RequirePermissions('product-categories:manage')
  async create(@CommandContext() context: ModuleCommandContext, @Headers('idempotency-key') header: unknown,
    @Body() body: unknown, @Res({ passthrough: true }) response: ReplayResponse) {
    return replay(await this.catalogue.createCategory(context, errors.parseInput(CreateProductCategoryInputV1Schema, body), key(header)), response);
  }
  @Patch(':id') @RequirePermissions('product-categories:manage')
  update(@CommandContext() context: ModuleCommandContext, @Param('id') id: string, @Body() body: unknown) {
    return this.catalogue.updateCategory(context, id, errors.parseInput(UpdateProductCategoryInputV1Schema, body));
  }
}

@Controller('v1/uoms')
@UseGuards(AuthorizationGuard)
export class UomsController {
  constructor(private readonly catalogue: CatalogueService) {}
  @Get() @RequirePermissions('uoms:read')
  list(@CurrentPrincipal() principal: ModulePrincipal) { return this.catalogue.listUoms(principal); }
  @Post() @RequirePermissions('uoms:manage')
  async create(@CommandContext() context: ModuleCommandContext, @Headers('idempotency-key') header: unknown,
    @Body() body: unknown, @Res({ passthrough: true }) response: ReplayResponse) {
    return replay(await this.catalogue.createUom(context, errors.parseInput(CreateUomInputV1Schema, body), key(header)), response);
  }
}

@Controller('v1/uom-conversions')
@UseGuards(AuthorizationGuard)
export class UomConversionsController {
  constructor(private readonly catalogue: CatalogueService) {}
  @Post() @RequirePermissions('uoms:manage')
  async create(@CommandContext() context: ModuleCommandContext, @Headers('idempotency-key') header: unknown,
    @Body() body: unknown, @Res({ passthrough: true }) response: ReplayResponse) {
    return replay(await this.catalogue.createConversion(context, errors.parseInput(CreateUomConversionInputV1Schema, body), key(header)), response);
  }
  @Post('resolve') @HttpCode(200) @RequirePermissions('uoms:read')
  resolve(@CurrentPrincipal() principal: ModulePrincipal, @Body() body: unknown) {
    return this.catalogue.resolveConversion(principal, errors.parseInput(UomResolveInputV1, body));
  }
}

@Controller('v1/product-attributes')
@UseGuards(AuthorizationGuard)
export class AttributesController {
  constructor(private readonly catalogue: CatalogueService) {}
  @Get() @RequirePermissions('products:read')
  list(@CurrentPrincipal() principal: ModulePrincipal) { return this.catalogue.listAttributes(principal); }
  @Post() @RequirePermissions('products:update')
  async create(@CommandContext() context: ModuleCommandContext, @Headers('idempotency-key') header: unknown,
    @Body() body: unknown, @Res({ passthrough: true }) response: ReplayResponse) {
    return replay(await this.catalogue.createAttribute(context, errors.parseInput(CreateAttributeDefinitionInputV1Schema, body), key(header)), response);
  }
}

@Controller('v1/catalogues')
@UseGuards(AuthorizationGuard)
export class CataloguesController {
  constructor(private readonly catalogue: CatalogueService) {}
  @Get() @RequirePermissions('catalogues:read')
  list(@CurrentPrincipal() principal: ModulePrincipal) { return this.catalogue.listCatalogues(principal); }
  @Post() @RequirePermissions('catalogues:draft')
  async create(@CommandContext() context: ModuleCommandContext, @Headers('idempotency-key') header: unknown,
    @Body() body: unknown, @Res({ passthrough: true }) response: ReplayResponse) {
    return replay(await this.catalogue.createCatalogue(context, errors.parseInput(CreateCatalogueInputV1Schema, body), key(header)), response);
  }
  @Post(':id/versions') @RequirePermissions('catalogues:draft')
  async createVersion(@CommandContext() context: ModuleCommandContext, @Param('id') id: string,
    @Headers('idempotency-key') header: unknown, @Body() body: unknown, @Res({ passthrough: true }) response: ReplayResponse) {
    return replay(await this.catalogue.createCatalogueVersion(context, id, errors.parseInput(CreateCatalogueVersionInputV1Schema, body), key(header)), response);
  }
  @Post(':id/versions/:versionId/entries') @RequirePermissions('catalogues:draft')
  async entry(@CommandContext() context: ModuleCommandContext, @Param('id') id: string, @Param('versionId') versionId: string,
    @Headers('idempotency-key') header: unknown, @Body() body: unknown, @Res({ passthrough: true }) response: ReplayResponse) {
    return replay(await this.catalogue.addCatalogueEntry(context, id, versionId, errors.parseInput(AddCatalogueEntryV1, body), key(header)), response);
  }
  @Post(':id/versions/:versionId/submit') @HttpCode(200) @RequirePermissions('catalogues:submit')
  submit(@CommandContext() c: ModuleCommandContext, @Param('id') id: string, @Param('versionId') v: string, @Body() b: unknown) { const x=errors.parseInput(VersionTransitionInputV1,b); return this.catalogue.transitionCatalogue(c,id,v,x.expectedVersion,x.reason,'SUBMITTED'); }
  @Post(':id/versions/:versionId/approve') @HttpCode(200) @RequirePermissions('catalogues:approve')
  approve(@CommandContext() c: ModuleCommandContext, @Param('id') id: string, @Param('versionId') v: string, @Body() b: unknown) { const x=errors.parseInput(VersionTransitionInputV1,b); return this.catalogue.transitionCatalogue(c,id,v,x.expectedVersion,x.reason,'APPROVED'); }
  @Post(':id/versions/:versionId/publish') @HttpCode(200) @RequirePermissions('catalogues:publish')
  publish(@CommandContext() c: ModuleCommandContext, @Param('id') id: string, @Param('versionId') v: string, @Body() b: unknown) { const x=errors.parseInput(VersionTransitionInputV1,b); return this.catalogue.transitionCatalogue(c,id,v,x.expectedVersion,x.reason,'PUBLISHED'); }
}

@Controller('v1/price-lists')
@UseGuards(AuthorizationGuard)
export class PriceListsController {
  constructor(private readonly catalogue: CatalogueService) {}
  @Get() @RequirePermissions('pricing:read')
  list(@CurrentPrincipal() principal: ModulePrincipal) { return this.catalogue.listPriceLists(principal); }
  @Post() @RequirePermissions('pricing:draft')
  async create(@CommandContext() context: ModuleCommandContext, @Headers('idempotency-key') header: unknown,
    @Body() body: unknown, @Res({ passthrough: true }) response: ReplayResponse) {
    return replay(await this.catalogue.createPriceList(context, errors.parseInput(CreatePriceListInputV1Schema, body), key(header)), response);
  }
  @Post(':id/versions') @RequirePermissions('pricing:draft')
  async version(@CommandContext() context: ModuleCommandContext, @Param('id') id: string,
    @Headers('idempotency-key') header: unknown, @Body() body: unknown, @Res({ passthrough: true }) response: ReplayResponse) {
    return replay(await this.catalogue.createPriceListVersion(context, id, errors.parseInput(CreatePriceListVersionInputV1Schema, body), key(header)), response);
  }
  @Post(':id/versions/:versionId/prices') @HttpCode(200) @RequirePermissions('pricing:draft')
  async price(@CommandContext() context: ModuleCommandContext, @Param('id') id: string, @Param('versionId') versionId: string,
    @Headers('idempotency-key') header: unknown, @Body() body: unknown, @Res({ passthrough: true }) response: ReplayResponse) {
    return replay(await this.catalogue.setPrice(context, id, versionId, errors.parseInput(SetProductPriceInputV1Schema, body), key(header)), response, false);
  }
  @Post(':id/versions/:versionId/submit') @HttpCode(200) @RequirePermissions('pricing:submit')
  submit(@CommandContext() c: ModuleCommandContext, @Param('id') id: string, @Param('versionId') v: string, @Body() b: unknown) { const x=errors.parseInput(VersionTransitionInputV1,b); return this.catalogue.transitionPrice(c,id,v,x.expectedVersion,x.reason,'SUBMITTED'); }
  @Post(':id/versions/:versionId/approve') @HttpCode(200) @RequirePermissions('pricing:approve')
  approve(@CommandContext() c: ModuleCommandContext, @Param('id') id: string, @Param('versionId') v: string, @Body() b: unknown) { const x=errors.parseInput(VersionTransitionInputV1,b); return this.catalogue.transitionPrice(c,id,v,x.expectedVersion,x.reason,'APPROVED'); }
  @Post(':id/versions/:versionId/activate') @HttpCode(200) @RequirePermissions('pricing:activate')
  activate(@CommandContext() c: ModuleCommandContext, @Param('id') id: string, @Param('versionId') v: string, @Body() b: unknown) { const x=errors.parseInput(VersionTransitionInputV1,b); return this.catalogue.transitionPrice(c,id,v,x.expectedVersion,x.reason,'ACTIVATED'); }
}

@Controller('v1/prices')
@UseGuards(AuthorizationGuard)
export class PricesController {
  constructor(private readonly catalogue: CatalogueService) {}
  @Post('resolve') @HttpCode(200) @RequirePermissions('pricing:read')
  resolve(@CurrentPrincipal() principal: ModulePrincipal, @Body() body: unknown) { return this.catalogue.resolvePrice(principal, errors.parseInput(ResolvePriceInputV1Schema, body)); }
}
