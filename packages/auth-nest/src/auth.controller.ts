import {
  type CompleteOidcLoginDto,
  CompleteOidcLoginSchema,
  type ConsumeMfaAssistedRecoveryDto,
  ConsumeMfaAssistedRecoverySchema,
  type DecideMfaAssistedRecoveryDto,
  DecideMfaAssistedRecoverySchema,
  type DeleteTenantOidcConfigurationDto,
  DeleteTenantOidcConfigurationSchema,
  type GenerateMfaRecoveryCodesDto,
  GenerateMfaRecoveryCodesSchema,
  type LoginWithEmailDto,
  LoginWithEmailSchema,
  type RefreshTokenDto,
  RefreshTokenSchema,
  type RevokeExternalIdentityDto,
  RevokeExternalIdentitySchema,
  type ResetPasswordDto,
  ResetPasswordSchema,
  type RegisterWithEmailDto,
  RegisterWithEmailSchema,
  type RequestMfaAssistedRecoveryDto,
  RequestMfaAssistedRecoverySchema,
  type SelectTenantDto,
  SelectTenantSchema,
  type StartOidcLoginDto,
  StartOidcLoginSchema,
  type StartOidcLinkDto,
  StartOidcLinkSchema,
  type UpsertTenantOidcConfigurationDto,
  UpsertTenantOidcConfigurationSchema,
  type UpdateProfileDto,
  UpdateProfileSchema,
  type ChangePasswordDto,
  ChangePasswordSchema,
  type VerifyMfaRecoveryCodeDto,
  VerifyMfaRecoveryCodeSchema,
  type VerifyTotpDto,
  VerifyTotpSchema,
} from '@gigalibs/contracts';
import { RequirePermissions } from '@gigalibs/rbac-nest';
import { ZodValidationPipe } from '@gigalibs/validation-nest';
import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
  SetMetadata,
  UseGuards,
} from '@nestjs/common';
// biome-ignore lint/style/useImportType: Nest constructor injection requires the runtime class.
import { AuthService } from './auth.service.js';
import { AllowMfaPending } from './decorators/allow-mfa-pending.decorator.js';
import { CurrentUser } from './decorators/current-user.decorator.js';
import { Public } from './decorators/public.decorator.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
// biome-ignore lint/style/useImportType: Nest constructor injection requires the runtime class.
import { MfaAssistedRecoveryService } from './mfa-assisted-recovery.service.js';
// biome-ignore lint/style/useImportType: Nest constructor injection requires the runtime class.
import { OidcService } from './oidc.service.js';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly oidcService: OidcService,
    private readonly mfaAssistedRecoveryService: MfaAssistedRecoveryService,
  ) {}

  @Get('mfa/assisted-recovery')
  @RequirePermissions('users:read')
  listMfaAssistedRecoveries(@CurrentUser('tid') tenantId: string) {
    return this.mfaAssistedRecoveryService.list(tenantId);
  }

  @Post('mfa/assisted-recovery')
  @RequirePermissions('users:update')
  requestMfaAssistedRecovery(
    @CurrentUser('tid') tenantId: string,
    @CurrentUser('sub') userId: string,
    @Body(new ZodValidationPipe(RequestMfaAssistedRecoverySchema))
    dto: RequestMfaAssistedRecoveryDto,
  ) {
    return this.mfaAssistedRecoveryService.request(tenantId, userId, dto);
  }

  @Post('mfa/assisted-recovery/:recoveryId/approve')
  @Header('Cache-Control', 'no-store')
  @RequirePermissions('users:update')
  approveMfaAssistedRecovery(
    @CurrentUser('tid') tenantId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('sid') sessionId: string,
    @Param('recoveryId') recoveryId: string,
    @Body(new ZodValidationPipe(DecideMfaAssistedRecoverySchema))
    dto: DecideMfaAssistedRecoveryDto,
  ) {
    return this.mfaAssistedRecoveryService.approve(
      tenantId,
      recoveryId,
      userId,
      sessionId,
      dto.reason,
    );
  }

  @Post('mfa/assisted-recovery/:recoveryId/reject')
  @RequirePermissions('users:update')
  rejectMfaAssistedRecovery(
    @CurrentUser('tid') tenantId: string,
    @CurrentUser('sub') userId: string,
    @Param('recoveryId') recoveryId: string,
    @Body(new ZodValidationPipe(DecideMfaAssistedRecoverySchema))
    dto: DecideMfaAssistedRecoveryDto,
  ) {
    return this.mfaAssistedRecoveryService.reject(tenantId, recoveryId, userId, dto.reason);
  }

  @AllowMfaPending()
  @Post('mfa/assisted-recovery/consume')
  @Header('Cache-Control', 'no-store')
  consumeMfaAssistedRecovery(
    @CurrentUser('sub') userId: string,
    @CurrentUser('sid') sessionId: string,
    @Body(new ZodValidationPipe(ConsumeMfaAssistedRecoverySchema))
    dto: ConsumeMfaAssistedRecoveryDto,
  ) {
    return this.mfaAssistedRecoveryService.consume(userId, sessionId, dto.grant);
  }

  @Get('oidc/config')
  @RequirePermissions('settings:read')
  getOidcConfiguration(@CurrentUser('tid') tenantId: string) {
    return this.oidcService.getConfiguration(tenantId);
  }

  @Put('oidc/config')
  @RequirePermissions('settings:update')
  upsertOidcConfiguration(
    @CurrentUser('tid') tenantId: string,
    @CurrentUser('sub') userId: string,
    @Body(new ZodValidationPipe(UpsertTenantOidcConfigurationSchema))
    dto: UpsertTenantOidcConfigurationDto,
  ) {
    return this.oidcService.upsertConfiguration(tenantId, userId, dto);
  }

  @Delete('oidc/config')
  @RequirePermissions('settings:update')
  deleteOidcConfiguration(
    @CurrentUser('tid') tenantId: string,
    @CurrentUser('sub') userId: string,
    @Query(new ZodValidationPipe(DeleteTenantOidcConfigurationSchema))
    query: DeleteTenantOidcConfigurationDto,
  ) {
    return this.oidcService.deleteConfiguration(tenantId, userId, query.reason);
  }

  @Public()
  @Post('oidc/start')
  @Header('Cache-Control', 'no-store')
  @HttpCode(HttpStatus.OK)
  startOidcLogin(@Body(new ZodValidationPipe(StartOidcLoginSchema)) dto: StartOidcLoginDto) {
    return this.oidcService.startLogin(dto.tenantSlug);
  }

  @Post('oidc/link/start')
  @Header('Cache-Control', 'no-store')
  @HttpCode(HttpStatus.OK)
  startOidcLink(
    @CurrentUser('tid') tenantId: string,
    @CurrentUser('sub') userId: string,
    @Body(new ZodValidationPipe(StartOidcLinkSchema)) dto: StartOidcLinkDto,
  ) {
    return this.oidcService.startLink(tenantId, userId, dto.reason);
  }

  @Get('external-identities')
  @Header('Cache-Control', 'no-store')
  listExternalIdentities(
    @CurrentUser('tid') tenantId: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.oidcService.listExternalIdentities(tenantId, userId);
  }

  @Post('external-identities/:identityId/revoke')
  @Header('Cache-Control', 'no-store')
  @HttpCode(HttpStatus.OK)
  revokeExternalIdentity(
    @CurrentUser('tid') tenantId: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('sid') sessionId: string,
    @Param('identityId') identityId: string,
    @Body(new ZodValidationPipe(RevokeExternalIdentitySchema)) dto: RevokeExternalIdentityDto,
  ) {
    return this.oidcService.revokeExternalIdentity(
      tenantId,
      userId,
      sessionId,
      identityId,
      dto,
    );
  }

  @Public()
  @Post('oidc/callback')
  @Header('Cache-Control', 'no-store')
  @HttpCode(HttpStatus.OK)
  completeOidcLogin(
    @Body(new ZodValidationPipe(CompleteOidcLoginSchema)) dto: CompleteOidcLoginDto,
  ) {
    return this.oidcService.completeLogin(dto);
  }

  @Public()
  @Post('register')
  async register(@Body(new ZodValidationPipe(RegisterWithEmailSchema)) dto: RegisterWithEmailDto) {
    return this.authService.register(dto);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body(new ZodValidationPipe(LoginWithEmailSchema)) dto: LoginWithEmailDto) {
    return this.authService.login(dto);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body(new ZodValidationPipe(RefreshTokenSchema)) dto: RefreshTokenDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  @UseGuards(JwtAuthGuard)
  @SetMetadata('skipTenantBoundary', true)
  @AllowMfaPending()
  @Post('select-tenant')
  @HttpCode(HttpStatus.OK)
  async selectTenant(
    @CurrentUser('sub') userId: string,
    @CurrentUser('sid') sessionId: string,
    @Body(new ZodValidationPipe(SelectTenantSchema)) dto: SelectTenantDto,
  ) {
    return this.authService.selectTenant(userId, sessionId, dto.tenantId);
  }

  @UseGuards(JwtAuthGuard)
  @AllowMfaPending()
  @Get('context')
  async context(
    @CurrentUser('sub') userId: string,
    @CurrentUser('sid') sessionId: string,
    @CurrentUser('tid') tenantId?: string,
  ) {
    return this.authService.getSessionContext(userId, sessionId, tenantId);
  }

  @UseGuards(JwtAuthGuard)
  @AllowMfaPending()
  @Post('mfa/totp/enroll')
  @Header('Cache-Control', 'no-store')
  @HttpCode(HttpStatus.CREATED)
  enrollTotp(@CurrentUser('sub') userId: string, @CurrentUser('sid') sessionId: string) {
    return this.authService.startTotpEnrollment(userId, sessionId);
  }

  @UseGuards(JwtAuthGuard)
  @AllowMfaPending()
  @Post('mfa/totp/verify')
  @Header('Cache-Control', 'no-store')
  @HttpCode(HttpStatus.OK)
  verifyTotp(
    @CurrentUser('sub') userId: string,
    @CurrentUser('sid') sessionId: string,
    @Body(new ZodValidationPipe(VerifyTotpSchema)) dto: VerifyTotpDto,
  ) {
    return this.authService.verifyTotp(userId, sessionId, dto.code);
  }

  @UseGuards(JwtAuthGuard)
  @Post('mfa/recovery/generate')
  @Header('Cache-Control', 'no-store')
  @HttpCode(HttpStatus.CREATED)
  generateRecoveryCodes(
    @CurrentUser('sub') userId: string,
    @CurrentUser('sid') sessionId: string,
    @Body(new ZodValidationPipe(GenerateMfaRecoveryCodesSchema)) dto: GenerateMfaRecoveryCodesDto,
  ) {
    return this.authService.generateRecoveryCodes(userId, sessionId, dto.reason);
  }

  @UseGuards(JwtAuthGuard)
  @AllowMfaPending()
  @Post('mfa/recovery/verify')
  @Header('Cache-Control', 'no-store')
  @HttpCode(HttpStatus.OK)
  verifyRecoveryCode(
    @CurrentUser('sub') userId: string,
    @CurrentUser('sid') sessionId: string,
    @Body(new ZodValidationPipe(VerifyMfaRecoveryCodeSchema)) dto: VerifyMfaRecoveryCodeDto,
  ) {
    return this.authService.verifyRecoveryCode(userId, sessionId, dto.code);
  }

  @UseGuards(JwtAuthGuard)
  @AllowMfaPending()
  @SetMetadata('skipTenantBoundary', true)
  @Get('profile')
  async getProfile(@CurrentUser('sub') userId: string) {
    return this.authService.getProfile(userId);
  }

  @UseGuards(JwtAuthGuard)
  @AllowMfaPending()
  @SetMetadata('skipTenantBoundary', true)
  @Patch('profile')
  async updateProfile(
    @CurrentUser('sub') userId: string,
    @Body(new ZodValidationPipe(UpdateProfileSchema)) body: UpdateProfileDto,
  ) {
    return this.authService.updateProfile(userId, body);
  }

  @UseGuards(JwtAuthGuard)
  @AllowMfaPending()
  @SetMetadata('skipTenantBoundary', true)
  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  async changePassword(
    @CurrentUser('sub') userId: string,
    @CurrentUser('sid') sessionId: string,
    @Body(new ZodValidationPipe(ChangePasswordSchema)) body: ChangePasswordDto,
  ) {
    return this.authService.changePassword(userId, sessionId, body);
  }

  @Public()
  @SetMetadata('skipTenantBoundary', true)
  @Post('reset-password')
  @Header('Cache-Control', 'no-store')
  @HttpCode(HttpStatus.OK)
  async resetPassword(
    @Body(new ZodValidationPipe(ResetPasswordSchema)) body: ResetPasswordDto,
  ) {
    return this.authService.resetPassword(body);
  }

  @UseGuards(JwtAuthGuard)
  @AllowMfaPending()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@CurrentUser('sid') sessionId: string) {
    if (sessionId) {
      await this.authService.logout(sessionId);
    }
  }
}
