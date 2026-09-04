/**
 * @gigalibs/host-kit
 *
 * Universal Host Adapter Framework — Pluggable integration protocol for embedding
 * GigaLibs modules (Invoicing, Communications, Workflow, Forms, Tickets, ERP)
 * into any external host SaaS application (WhooCrew, Magento, Shopify, Next.js, Salesforce, Custom ERPs).
 *
 * Architecture Principles:
 * - 100% Industry Agnostic: No domain or business-specific logic locked into the core adapter.
 * - Secure BFF Minting: Tokens are minted exclusively server-to-server; host secrets never reach the browser.
 * - Cross-Origin Bridge: Frame-level isolation with strict origin allowlists and bi-directional event bus.
 *
 * @module
 */

export type EmbedModuleScope = 'mine' | 'tenant' | 'global' | 'custom';

/**
 * Generic Host Actor identity representation.
 * Standardizes user claims from any host authentication provider.
 */
export interface HostActor {
  /** Stable unique external host user identifier */
  externalUserId: string;
  email?: string;
  mobile?: string;
  displayName?: string;
  orgId?: string;
  hostRole?: string;
  permissions?: string[];
  metadata?: Record<string, unknown>;
}

/**
 * Input payload for server-side embed session minting.
 */
export interface MintEmbedSessionInput {
  tenantId: string;
  hostKey: string;
  modules?: string[];
  actor: HostActor;
  scope?: EmbedModuleScope;
  /** Exact browser origin hosting the iframe (validated against host allowlist) */
  parentOrigin?: string;
  /** Atomic rotation: Replaces an existing session without disrupting UI state */
  replaceSessionId?: string;
  sessionTtlSeconds?: number;
  customContext?: Record<string, unknown>;
}

/**
 * Result payload returned from server-side embed session minting.
 */
export interface MintEmbedSessionResult {
  token: string;
  sessionId: string;
  sessionVersion: number;
  issuedAt: string;
  expiresAt: string;
  embedBaseUrl: string;
  tenantId: string;
  hostKey: string;
  modules: string[];
  scope?: EmbedModuleScope;
  parentOrigin?: string | null;
  permissions: string[];
}

/**
 * Universal Host Adapter Contract.
 * Any host application implements this contract to mount and govern GigaLibs modules.
 */
export interface UniversalHostAdapter {
  /**
   * Translates a host organization / store / account identifier to a platform tenant ID.
   */
  mapTenant(hostOrgId: string | number): Promise<string | null>;

  /**
   * Normalizes a logged-in host user / session into standardized HostActor claims.
   */
  mapActor(hostUser: unknown): Promise<HostActor>;

  /**
   * Server-side only: Mints an isolated embed session JWT via the platform API.
   */
  mintEmbedSession(input: MintEmbedSessionInput): Promise<MintEmbedSessionResult>;

  /**
   * Evaluates host ACL to determine if the actor can access a specific module.
   */
  canAccessModule(hostUser: unknown, moduleKey: string): Promise<boolean>;

  /**
   * Optional: Revokes active browser sessions upon host logout or permission change.
   */
  revokeEmbedSession?(sessionId: string, reason?: string): Promise<void>;
}

/**
 * Universal postMessage event names for cross-frame host orchestration.
 */
export const HOST_EVENT_TYPES = {
  // Child -> Host
  UNREAD_COUNT: 'gigalibs:unread-count',
  RESIZE_FRAME: 'gigalibs:resize',
  NAVIGATE: 'gigalibs:navigate',
  ACTION_TRIGGERED: 'gigalibs:action',
  SESSION_EXPIRED: 'gigalibs:session-expired',

  // Host -> Child
  VISIBILITY_CHANGE: 'gigalibs:visibility',
  UPDATE_TOKEN: 'gigalibs:update-token',
  CONTEXT_UPDATE: 'gigalibs:context-update',
  HOST_LOGOUT: 'gigalibs:host-logout',
} as const;

/**
 * Generic Host Message Payload
 */
export interface HostBridgeMessage<T = unknown> {
  type: string;
  source?: string;
  payload?: T;
  timestamp?: number;
}

/**
 * Browser-side Cross-Origin Bridge Manager.
 * Handles safe postMessage exchange between host and embedded GigaLibs iframe.
 */
export class UniversalHostBridge {
  private messageHandlers = new Map<string, Set<(payload: any) => void>>();
  private isListening = false;
  private config: {
    allowedOrigins: string[];
    iframeElement?: () => HTMLIFrameElement | null;
  };

  constructor(config: {
    allowedOrigins: string[];
    iframeElement?: () => HTMLIFrameElement | null;
  }) {
    this.config = config;
  }

  /**
   * Starts listening for cross-origin messages with origin security validation.
   */
  start(): () => void {
    if (typeof window === 'undefined' || this.isListening) return () => {};

    const listener = (event: MessageEvent) => {
      // Validate origin against allowed allowlist
      if (this.config.allowedOrigins.length > 0 && !this.config.allowedOrigins.includes(event.origin)) {
        return;
      }

      const data = event.data as HostBridgeMessage;
      if (!data || typeof data.type !== 'string') return;

      const handlers = this.messageHandlers.get(data.type);
      if (handlers) {
        for (const handler of handlers) {
          try {
            handler(data.payload);
          } catch (err) {
            console.error(`[UniversalHostBridge] Error in event handler for "${data.type}":`, err);
          }
        }
      }
    };

    window.addEventListener('message', listener);
    this.isListening = true;

    return () => {
      window.removeEventListener('message', listener);
      this.isListening = false;
    };
  }

  /**
   * Subscribes to a specific bridge event.
   */
  on<T = any>(eventType: string, handler: (payload: T) => void): () => void {
    if (!this.messageHandlers.has(eventType)) {
      this.messageHandlers.set(eventType, new Set());
    }
    this.messageHandlers.get(eventType)!.add(handler);

    return () => {
      this.messageHandlers.get(eventType)?.delete(handler);
    };
  }

  /**
   * Dispatches a message to the embedded iframe window.
   */
  postToChild<T = any>(eventType: string, payload?: T, targetOrigin = '*'): boolean {
    const iframe = this.config.iframeElement?.();
    if (!iframe || !iframe.contentWindow) return false;

    iframe.contentWindow.postMessage(
      {
        type: eventType,
        source: 'gigalibs-host',
        payload,
        timestamp: Date.now(),
      },
      targetOrigin
    );
    return true;
  }
}
