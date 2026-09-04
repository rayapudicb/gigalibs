import { Controller, Post, Body, UseGuards, HttpCode, HttpStatus, Get, SetMetadata } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { Public } from './decorators/public.decorator.js';
import { CurrentUser } from './decorators/current-user.decorator.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import {
  LoginWithEmailSchema,
  RefreshTokenSchema,
  RegisterWithEmailSchema,
  SelectTenantSchema,
  type LoginWithEmailDto,
  type RefreshTokenDto,
  type RegisterWithEmailDto,
  type SelectTenantDto,
} from '@gigalibs/contracts';
import { ZodValidationPipe } from '@gigalibs/validation-nest';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register')
  async register(
    @Body(new ZodValidationPipe(RegisterWithEmailSchema)) dto: RegisterWithEmailDto,
  ) {
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
  @Get('context')
  async context(
    @CurrentUser('sub') userId: string,
    @CurrentUser('sid') sessionId: string,
    @CurrentUser('tid') tenantId?: string,
  ) {
    return this.authService.getSessionContext(userId, sessionId, tenantId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@CurrentUser('sid') sessionId: string) {
    if (sessionId) {
      await this.authService.logout(sessionId);
    }
  }
}
