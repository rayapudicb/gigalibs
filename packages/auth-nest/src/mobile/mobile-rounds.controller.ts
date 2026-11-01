import { createHash, createPrivateKey, randomUUID } from 'node:crypto';
import { buildPlatformContext, signPlatformContextToken } from '@gigalibs/auth-core';
import {
  RoundOfflineGrantBundleSourceV1, RoundOfflineGrantV1, RoundSyncBatchV1,
  StageRoundEvidenceV1, holdsPermission, type MobileSessionV3,
} from '@gigalibs/contracts';
import { Body, Controller, Get, Header, Headers, HttpException, Logger, Param, Post } from '@nestjs/common';
import { Public } from '../decorators/public.decorator.js';
import { MobileAuthService, MobileProblemException, type MobileRequest } from './mobile-auth.service.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type RequestHeaders = Record<string,string|string[]|undefined>;
const single = (headers:RequestHeaders,name:string) => typeof headers[name] === 'string' ? headers[name] as string : undefined;
const requestFrom = (headers:RequestHeaders):MobileRequest => {
  const authorization = single(headers,'authorization');
  const installationId = single(headers,'x-gigalibs-installation-id');
  const appVersion = single(headers,'x-gigalibs-app-version');
  const idempotencyKey = single(headers,'idempotency-key');
  return {
    ...(authorization ? {authorization} : {}),
    ...(installationId ? {installationId} : {}),
    ...(appVersion ? {appVersion} : {}),
    ...(idempotencyKey ? {idempotencyKey} : {}),
  };
};

/** The BFF grants local capture time only after a live session and a module-authorized bundle read. */
export function issueRoundOfflineGrant(session:MobileSessionV3,sessionId:string,
  installationId:string,bundleInput:unknown,assignmentId:string,now=new Date()):RoundOfflineGrantV1 {
  const parsed=RoundOfflineGrantBundleSourceV1.safeParse(bundleInput);
  if (!parsed.success) throw new MobileProblemException('MOBILE_UNAVAILABLE');
  const {assignment,route}=parsed.data;
  if (assignment.id!==assignmentId || assignment.operatorSubject!==session.user.id ||
      assignment.routeRevision!==route.revision ||
      !['ASSIGNED','STARTED'].includes(assignment.state))
    throw new MobileProblemException('MOBILE_ROUND_CONFLICT');
  const deadline=Date.parse(assignment.dueAt)+route.schedule.graceMinutes*60_000;
  // Local capture authority cannot outlive the authenticated mobile session.
  const sessionExpiry=Date.parse(session.expiresAt);
  const expiry=Math.min(now.getTime()+8*60*60_000,deadline,sessionExpiry);
  if (!Number.isFinite(expiry) || expiry<=now.getTime())
    throw new MobileProblemException('MOBILE_ROUND_CONFLICT');
  const scopeKey=createHash('sha256').update(JSON.stringify({sessionId,
    tenantId:session.tenant.id,userId:session.user.id,membershipId:session.membershipId,
    installationId,sessionRevision:session.sessionRevision,assignmentId})).digest('hex');
  return RoundOfflineGrantV1.parse({
    contractVersion:'round-offline-grant.v1',grantId:randomUUID(),assignmentId,
    routeRevision:route.revision,scopeKey,tenantId:session.tenant.id,userId:session.user.id,
    membershipId:session.membershipId,installationId,
    sessionRevision:session.sessionRevision,
    authorizationRevision:session.authorizationRevision,
    configurationRevision:session.configurationRevision,
    issuedAt:now.toISOString(),expiresAt:new Date(expiry).toISOString(),
  });
}

/** Authenticated mobile Rounds adapter. The mobile bearer is checked against the current control-plane session. */
@Public()
@Controller('mobile/rounds')
export class MobileRoundsController {
  private readonly logger = new Logger(MobileRoundsController.name);
  constructor(private readonly mobile:MobileAuthService) {}

  @Get('assignments')
  @Header('Cache-Control','no-store')
  mine(@Headers() headers:RequestHeaders) {
    return this.answer(() => this.forward(headers,'GET','/v1/assignments/mine'));
  }

  @Get('board')
  @Header('Cache-Control','no-store')
  board(@Headers() headers:RequestHeaders) {
    return this.answer(() => this.forward(headers,'GET','/v1/assignments/board',undefined,
      'operator-rounds.board.read'));
  }

  @Get('assignments/:id/bundle')
  @Header('Cache-Control','no-store')
  bundle(@Headers() headers:RequestHeaders,@Param('id') id:string) {
    this.uuid(id);return this.answer(() => this.forward(headers,'GET',`/v1/assignments/${id}/bundle`));
  }

  @Get('assignments/:id/history')
  @Header('Cache-Control','no-store')
  history(@Headers() headers:RequestHeaders,@Param('id') id:string) {
    this.uuid(id);return this.answer(() => this.forward(headers,'GET',`/v1/assignments/${id}/history`));
  }

  @Get('assignments/:id/offline-grant')
  @Header('Cache-Control','no-store')
  offlineGrant(@Headers() headers:RequestHeaders,@Param('id') id:string) {
    this.uuid(id);
    return this.answer(async () => {
      const request=requestFrom(headers);
      const first=await this.mobile.session(request);
      const bundle=await this.forward(headers,'GET',`/v1/assignments/${id}/bundle`);
      const current=await this.mobile.session(request);
      if (first.tenant.id!==current.tenant.id || first.user.id!==current.user.id ||
          first.membershipId!==current.membershipId ||
          first.sessionRevision!==current.sessionRevision ||
          first.authorizationRevision!==current.authorizationRevision ||
          first.configurationRevision!==current.configurationRevision || !request.installationId)
        throw new MobileProblemException('MOBILE_SCOPE_DENIED');
      const subject=await this.mobile.moduleSubject(request);
      if (subject.user.id!==current.user.id || subject.tenant?.id!==current.tenant.id)
        throw new MobileProblemException('MOBILE_SCOPE_DENIED');
      return issueRoundOfflineGrant(current,subject.session.id,request.installationId,bundle,id);
    });
  }

  @Get('receipts/:id')
  @Header('Cache-Control','no-store')
  receipt(@Headers() headers:RequestHeaders,@Param('id') id:string) {
    this.uuid(id);return this.answer(() => this.forward(headers,'GET',`/v1/receipts/${id}`));
  }

  @Post('sync')
  @Header('Cache-Control','no-store')
  sync(@Headers() headers:RequestHeaders,@Body() raw:unknown) {
    const body = RoundSyncBatchV1.safeParse(raw);
    if (!body.success) throw new MobileProblemException('MOBILE_REQUEST_INVALID');
    return this.answer(() => this.forward(headers,'POST','/v1/sync',body.data));
  }

  @Post('evidence')
  @Header('Cache-Control','no-store')
  stage(@Headers() headers:RequestHeaders,@Body() raw:unknown) {
    const body = StageRoundEvidenceV1.safeParse(raw);
    if (!body.success) throw new MobileProblemException('MOBILE_REQUEST_INVALID');
    return this.answer(() => this.forward(headers,'POST','/v1/evidence',body.data));
  }

  @Post('evidence/:id/commit')
  @Header('Cache-Control','no-store')
  commit(@Headers() headers:RequestHeaders,@Param('id') id:string) {
    this.uuid(id);return this.answer(() => this.forward(headers,'POST',`/v1/evidence/${id}/commit`,{}));
  }

  private uuid(id:string) {
    if (!UUID.test(id)) throw new MobileProblemException('MOBILE_REQUEST_INVALID');
  }

  private async forward(headers:RequestHeaders,method:'GET'|'POST',path:string,body?:unknown,
    permission='operator-rounds.runs.execute'):Promise<unknown> {
    const subject = await this.mobile.moduleSubject(requestFrom(headers));
    if (!subject.tenant || !subject.tenant.entitlements.some((item) =>
      item.moduleKey === 'operator-rounds' && item.status === 'ENABLED') ||
        !holdsPermission(subject.permissions,permission))
      throw new MobileProblemException('MOBILE_SCOPE_DENIED');
    const upstream = process.env['OPERATOR_ROUNDS_API_URL']?.trim();
    const encodedKey = process.env['OPERATOR_ROUNDS_PLATFORM_CONTEXT_PRIVATE_KEY_BASE64']?.trim();
    if (!upstream || !encodedKey) throw new MobileProblemException('MOBILE_UNAVAILABLE');
    let url:URL;
    let privateKey:string;
    try {
      url = new URL(upstream);
      if (!['http:','https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash)
        throw new Error('invalid upstream');
      privateKey = createPrivateKey({key:Buffer.from(encodedKey,'base64'),format:'der',type:'pkcs8'})
        .export({format:'pem',type:'pkcs8'}).toString();
    } catch {throw new MobileProblemException('MOBILE_UNAVAILABLE');}
    const claims = buildPlatformContext(subject,'operator-rounds','gigalibs-operator-rounds-api',{ttlSeconds:60});
    const token = signPlatformContextToken(claims,privateKey);
    const target = new URL(`${url.pathname.replace(/\/$/,'')}${path}`,url.origin);
    let response:Response;
    try {
      response = await fetch(target,{
        method,headers:{Authorization:`Bearer ${token}`,Accept:'application/json, application/problem+json',
          'X-Correlation-Id':single(headers,'x-correlation-id') ?? randomUUID(),
          ...(body === undefined ? {} : {'Content-Type':'application/json'})},
        ...(body === undefined ? {} : {body:JSON.stringify(body)}),
        cache:'no-store',redirect:'error',signal:AbortSignal.timeout(10_000),
      });
    } catch (error) {
      throw new MobileProblemException(error instanceof Error && error.name === 'TimeoutError'
        ? 'MOBILE_UPSTREAM_TIMEOUT' : 'MOBILE_UNAVAILABLE');
    }
    const value:unknown = await response.json().catch(() => null);
    if (response.ok && value && typeof value === 'object') return value;
    if (response.status === 409) throw new MobileProblemException('MOBILE_ROUND_CONFLICT');
    if (response.status === 400 || response.status === 422) throw new MobileProblemException('MOBILE_REQUEST_INVALID');
    if (response.status === 401) throw new MobileProblemException('MOBILE_AUTH_REQUIRED');
    if (response.status === 403) throw new MobileProblemException('MOBILE_SCOPE_DENIED');
    if (response.status === 404) throw new MobileProblemException('MOBILE_NOT_FOUND');
    this.logger.warn(`Rounds module returned status ${response.status}.`);
    throw new MobileProblemException('MOBILE_UNAVAILABLE');
  }

  private async answer<T>(work:() => Promise<T>):Promise<T> {
    try {return await work();}
    catch (error) {
      if (error instanceof MobileProblemException) throw error;
      if (error instanceof HttpException && error.getStatus() === 401) throw new MobileProblemException('MOBILE_AUTH_REQUIRED');
      if (error instanceof HttpException && error.getStatus() === 403) throw new MobileProblemException('MOBILE_SCOPE_DENIED');
      this.logger.error(`Rounds request failed: ${error instanceof Error ? error.name : 'UnknownError'}`);
      throw new MobileProblemException('MOBILE_UNAVAILABLE');
    }
  }
}
