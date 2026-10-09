export type AssistantMessageRole = 'user' | 'assistant' | 'system';

export type AssistantMessageStatus = 'sending' | 'streaming' | 'complete' | 'error';

export interface AssistantMessage {
  id: string;
  role: AssistantMessageRole;
  content: string;
  thought?: string;
  status: AssistantMessageStatus;
  createdAt: string;
  error?: string;
}

export interface AssistantRunInfo {
  version: string;
  mode: string;
  agents: Record<string, {
    name: string;
    description: string;
    className: string;
  }>;
  audioFileTranscriptionEnabled: boolean;
  threadEndpoints: {
    list: boolean;
    inspect: boolean;
    mutations: boolean;
    realtimeMetadata: boolean;
  };
  suggestions: boolean;
  a2uiEnabled: boolean;
  openGenerativeUIEnabled: boolean;
  telemetryDisabled: boolean;
}
