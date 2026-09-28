import type { CompiledConfigurationManifest } from '@gigalibs/configuration-core';
import { prisma } from '@gigalibs/db';
import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { Client, type Notification } from 'pg';
// biome-ignore lint/style/useImportType: NestJS needs the runtime constructor token for dependency injection.
import {
  ConfigurationManifestCache,
  type ConfigurationManifestProjection,
  type ConfigurationManifestScope,
} from './configuration-manifest.cache.js';
import {
  CONFIGURATION_OUTBOX_CHANNEL,
  parseConfigurationOutboxEnvelope,
} from './configuration-outbox.publisher.js';

// biome-ignore lint/style/useImportType: NestJS needs the runtime constructor token for dependency injection.
import { TransactionalInboxService } from './transactional-inbox.service.js';

const DEDUPLICATION_TTL_MS = 60 * 60 * 1_000;
const MAX_DEDUPLICATION_ENTRIES = 10_000;
const INITIAL_RECONNECT_DELAY_MS = 1_000;
const MAX_RECONNECT_DELAY_MS = 30_000;

@Injectable()
export class ConfigurationInvalidationConsumer
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(ConfigurationInvalidationConsumer.name);
  private readonly processedEvents = new Map<string, number>();
  private client: Client | undefined;
  private reconnectTimer: NodeJS.Timeout | undefined;
  private notificationChain = Promise.resolve();
  private reconnectDelayMs = INITIAL_RECONNECT_DELAY_MS;
  private stopping = false;
  private generation = 0;

  constructor(
    private readonly cache: ConfigurationManifestCache,
    private readonly inbox?: TransactionalInboxService,
  ) {}

  async onApplicationBootstrap() {
    await this.connect(true);
  }

  async onApplicationShutdown() {
    this.stopping = true;
    this.cache.markListenerDisconnected();
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
    this.generation += 1;
    const client = this.client;
    this.client = undefined;
    await this.notificationChain.catch(() => undefined);
    if (client) await client.end().catch(() => undefined);
  }

  private async connect(initial: boolean) {
    const databaseUrl = requireDatabaseUrl();
    const generation = ++this.generation;
    const client = new Client({
      connectionString: databaseUrl,
      application_name: `gigalibs-configuration-manifest-consumer-${process.pid}`,
      connectionTimeoutMillis: 5_000,
    });
    client.on('notification', (notification) => this.enqueue(notification));
    client.on('error', () => this.handleDisconnect(client, generation));
    client.on('end', () => this.handleDisconnect(client, generation));

    try {
      await client.connect();
      await client.query(`LISTEN ${CONFIGURATION_OUTBOX_CHANNEL}`);
      this.client = client;
      await this.cache.resynchronizeAll((scope) => this.loadProjection(scope));
      if (generation !== this.generation || this.stopping) {
        await client.end().catch(() => undefined);
        return;
      }
      this.cache.markListenerConnected();
      if (!initial) this.cache.recordReconnect();
      this.reconnectDelayMs = INITIAL_RECONNECT_DELAY_MS;
      this.logger.log('Configuration manifest invalidation listener is connected.');
    } catch (error) {
      this.cache.markListenerDisconnected();
      if (this.client === client) this.client = undefined;
      await client.end().catch(() => undefined);
      if (initial) {
        this.logger.error('Configuration manifest invalidation listener failed to start.');
        throw new Error('CONFIGURATION_INVALIDATION_LISTENER_START_FAILED', { cause: error });
      }
      this.logger.warn('Configuration manifest invalidation listener reconnect failed.');
      this.scheduleReconnect();
    }
  }

  private handleDisconnect(client: Client, generation: number) {
    if (generation !== this.generation || this.stopping) return;
    this.generation += 1;
    if (this.client === client) this.client = undefined;
    this.cache.markListenerDisconnected();
    this.logger.warn(
      'Configuration manifest invalidation listener disconnected; cache reads are bypassed.',
    );
    void client.end().catch(() => undefined);
    this.scheduleReconnect();
  }

  private scheduleReconnect() {
    if (this.stopping || this.reconnectTimer) return;
    const delayMs = this.reconnectDelayMs;
    this.reconnectDelayMs = Math.min(MAX_RECONNECT_DELAY_MS, delayMs * 2);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      void this.connect(false);
    }, delayMs);
    this.reconnectTimer.unref();
  }

  private enqueue(notification: Notification) {
    this.notificationChain = this.notificationChain
      .then(() => this.processNotification(notification))
      .catch(() => undefined);
  }

  private async processNotification(notification: Notification) {
    if (
      notification.channel !== CONFIGURATION_OUTBOX_CHANNEL ||
      notification.payload === undefined
    ) {
      this.cache.recordNotification('invalid');
      return;
    }

    let envelope: ReturnType<typeof parseConfigurationOutboxEnvelope>;
    try {
      envelope = parseConfigurationOutboxEnvelope(notification.payload);
    } catch {
      this.cache.recordNotification('invalid');
      this.logger.warn('Rejected an invalid configuration invalidation notification.');
      return;
    }

    this.pruneProcessedEvents();
    if (this.processedEvents.has(envelope.eventId)) {
      this.cache.recordNotification('deduplicated');
      return;
    }

    const applyNotification = async () => {
      if (envelope.eventType.startsWith('configuration.activation.')) {
        const activation = await prisma.configurationActivation.findFirst({
          where: { id: envelope.aggregateId, tenantId: envelope.tenantId },
          select: {
            tenantId: true,
            moduleKey: true,
            entityKey: true,
            surfaceKey: true,
            environmentKey: true,
            cohortKey: true,
          },
        });
        if (!activation) throw new Error('CONFIGURATION_ACTIVATION_NOT_FOUND');
        const scope: ConfigurationManifestScope = activation;
        this.cache.invalidateTenant(envelope.tenantId);
        this.cache.invalidate(scope);
        await this.cache.resynchronize(scope, () => this.loadProjection(scope));
        this.cache.recordNotification('applied');
      } else {
        this.cache.recordNotification('ignored');
      }
    };

    if (this.inbox) {
      try {
        const result = await this.inbox.handleMessage(
          {
            tenantId: envelope.tenantId,
            consumerGroup: 'configuration-manifest-invalidation',
            messageId: envelope.eventId,
            eventType: envelope.eventType,
            aggregateType: 'configuration-activation',
            aggregateId: envelope.aggregateId,
            payload: { attempt: envelope.attempt },
          },
          applyNotification,
        );

        if (result.status === 'DEDUPLICATED') {
          this.cache.recordNotification('deduplicated');
          return;
        }
        if (result.status === 'PROCESSED') {
          this.rememberProcessedEvent(envelope.eventId);
          return;
        }
        this.cache.invalidateTenant(envelope.tenantId);
        this.cache.recordNotification('failed');
        this.logger.error(`Inbox processing resulted in ${result.status}: ${result.error}`);
      } catch (error) {
        this.cache.invalidateTenant(envelope.tenantId);
        this.cache.recordNotification('failed');
        this.logger.error('Inbox execution failed unexpectedly.', error);
      }
      return;
    }

    try {
      await applyNotification();
      this.rememberProcessedEvent(envelope.eventId);
    } catch {
      this.cache.invalidateTenant(envelope.tenantId);
      this.cache.recordNotification('failed');
      this.logger.error('Configuration manifest invalidation notification processing failed.');
    }
  }

  private async loadProjection(
    scope: ConfigurationManifestScope,
  ): Promise<ConfigurationManifestProjection | null> {
    const activation = await prisma.configurationActivation.findFirst({
      where: { ...scope, status: 'ACTIVE' },
      include: { publishedVersion: true },
      orderBy: { activatedAt: 'desc' },
    });
    if (!activation) return null;
    return {
      activationId: activation.id,
      publishedVersionId: activation.publishedVersionId,
      activatedAt: activation.activatedAt,
      manifest: activation.publishedVersion.manifest as unknown as CompiledConfigurationManifest,
      checksum: activation.publishedVersion.checksum,
    };
  }

  private rememberProcessedEvent(eventId: string) {
    this.processedEvents.delete(eventId);
    this.processedEvents.set(eventId, Date.now());
    while (this.processedEvents.size > MAX_DEDUPLICATION_ENTRIES) {
      const oldest = this.processedEvents.keys().next().value as string | undefined;
      if (!oldest) break;
      this.processedEvents.delete(oldest);
    }
  }

  private pruneProcessedEvents() {
    const expiredBefore = Date.now() - DEDUPLICATION_TTL_MS;
    for (const [eventId, processedAt] of this.processedEvents) {
      if (processedAt >= expiredBefore) break;
      this.processedEvents.delete(eventId);
    }
  }
}

function requireDatabaseUrl(): string {
  const configured = process.env.DATABASE_URL?.trim();
  if (!configured) throw new Error('DATABASE_URL must be configured.');
  let parsed: URL;
  try {
    parsed = new URL(configured);
  } catch {
    throw new Error('DATABASE_URL must be a valid PostgreSQL URL.');
  }
  if (
    !['postgres:', 'postgresql:'].includes(parsed.protocol) ||
    !parsed.hostname ||
    parsed.pathname === '/'
  ) {
    throw new Error('DATABASE_URL must be a valid PostgreSQL URL.');
  }
  return configured;
}
