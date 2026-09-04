/**
 * @gigalibs/embed-sdk
 *
 * Lightweight script to embed GigaLibs widgets (Chat, Forms, Support Tickets, AI Copilot)
 * into any external third-party website with postMessage RPC communication.
 *
 * @module
 */

export type WidgetType = 'chat' | 'ticket' | 'form' | 'copilot';

export interface EmbedConfig {
  appUrl: string;
  tenantId: string;
  widget?: WidgetType | undefined;
  theme?: 'light' | 'dark' | 'auto' | undefined;
  position?: 'bottom-right' | 'bottom-left' | undefined;
  primaryColor?: string | undefined;
  zIndex?: number | undefined;
}

export type EmbedEventHandler = (payload: any) => void;

export class GigaEmbed {
  private iframe: HTMLIFrameElement | null = null;
  private launcherBtn: HTMLButtonElement | null = null;
  private isOpen = false;
  private eventHandlers = new Map<string, Set<EmbedEventHandler>>();

  constructor(private readonly config: EmbedConfig) {}

  init(): void {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    this.createIframe();
    this.createLauncher();
    this.setupMessageListener();
  }

  private createIframe(): void {
    const isLeft = this.config.position === 'bottom-left';
    this.iframe = document.createElement('iframe');
    this.iframe.src = `${this.config.appUrl}/embed?tenantId=${this.config.tenantId}&widget=${this.config.widget || 'chat'}&theme=${this.config.theme || 'auto'}`;
    this.iframe.style.position = 'fixed';
    this.iframe.style.bottom = '85px';
    this.iframe.style.right = isLeft ? 'auto' : '20px';
    this.iframe.style.left = isLeft ? '20px' : 'auto';
    this.iframe.style.width = '380px';
    this.iframe.style.height = '620px';
    this.iframe.style.border = 'none';
    this.iframe.style.borderRadius = '16px';
    this.iframe.style.boxShadow = '0 20px 25px -5px rgba(0, 0, 0, 0.15), 0 10px 10px -5px rgba(0, 0, 0, 0.04)';
    this.iframe.style.zIndex = String(this.config.zIndex || 999999);
    this.iframe.style.display = 'none';
    this.iframe.style.transition = 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)';

    document.body.appendChild(this.iframe);
  }

  private createLauncher(): void {
    const isLeft = this.config.position === 'bottom-left';
    this.launcherBtn = document.createElement('button');
    this.launcherBtn.innerHTML = `
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
      </svg>
    `;
    this.launcherBtn.style.position = 'fixed';
    this.launcherBtn.style.bottom = '20px';
    this.launcherBtn.style.right = isLeft ? 'auto' : '20px';
    this.launcherBtn.style.left = isLeft ? '20px' : 'auto';
    this.launcherBtn.style.width = '56px';
    this.launcherBtn.style.height = '56px';
    this.launcherBtn.style.borderRadius = '28px';
    this.launcherBtn.style.backgroundColor = this.config.primaryColor || '#2563EB';
    this.launcherBtn.style.color = '#FFFFFF';
    this.launcherBtn.style.border = 'none';
    this.launcherBtn.style.cursor = 'pointer';
    this.launcherBtn.style.boxShadow = '0 4px 14px rgba(37, 99, 235, 0.4)';
    this.launcherBtn.style.display = 'flex';
    this.launcherBtn.style.alignItems = 'center';
    this.launcherBtn.style.justifyContent = 'center';
    this.launcherBtn.style.zIndex = String(this.config.zIndex || 999999);
    this.launcherBtn.style.transition = 'transform 0.15s ease';

    this.launcherBtn.onclick = () => this.toggle();
    document.body.appendChild(this.launcherBtn);
  }

  private setupMessageListener(): void {
    window.addEventListener('message', (event) => {
      if (event.data?.source === 'gigalibs-embed') {
        const { type, payload } = event.data;
        if (type === 'CLOSE_WIDGET') {
          this.hide();
        }
        const handlers = this.eventHandlers.get(type);
        if (handlers) {
          handlers.forEach((fn) => fn(payload));
        }
      }
    });
  }

  show(): void {
    if (!this.iframe) return;
    this.iframe.style.display = 'block';
    this.isOpen = true;
    this.sendMessage('WIDGET_OPENED', {});
  }

  hide(): void {
    if (!this.iframe) return;
    this.iframe.style.display = 'none';
    this.isOpen = false;
    this.sendMessage('WIDGET_CLOSED', {});
  }

  toggle(): void {
    if (this.isOpen) this.hide();
    else this.show();
  }

  on(event: string, handler: EmbedEventHandler): () => void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler);
    return () => this.eventHandlers.get(event)?.delete(handler);
  }

  sendMessage(type: string, payload: unknown): void {
    if (this.iframe?.contentWindow) {
      this.iframe.contentWindow.postMessage({ source: 'gigalibs-parent', type, payload }, '*');
    }
  }

  destroy(): void {
    if (this.iframe && this.iframe.parentNode) {
      this.iframe.parentNode.removeChild(this.iframe);
      this.iframe = null;
    }
    if (this.launcherBtn && this.launcherBtn.parentNode) {
      this.launcherBtn.parentNode.removeChild(this.launcherBtn);
      this.launcherBtn = null;
    }
    this.eventHandlers.clear();
  }
}
