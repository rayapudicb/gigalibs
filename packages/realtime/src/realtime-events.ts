/**
 * Well-known Socket.IO event names used across the platform.
 * Client and server both import from this file to stay in sync.
 */
export const RealtimeEvents = {
  // Connection lifecycle
  CONNECT:             'connect',
  DISCONNECT:          'disconnect',
  ERROR:               'error',

  // Chat — 2-way human
  CHAT_MESSAGE:        'chat:message',
  CHAT_TYPING_START:   'chat:typing:start',
  CHAT_TYPING_STOP:    'chat:typing:stop',
  CHAT_READ:           'chat:read',
  CHAT_REACTION:       'chat:reaction',
  CHAT_MESSAGE_EDITED: 'chat:message:edited',
  CHAT_MESSAGE_DELETED:'chat:message:deleted',

  // AI Chat — human-to-LLM
  AI_CHAT_STREAM_START: 'ai:stream:start',
  AI_CHAT_STREAM_TOKEN: 'ai:stream:token',
  AI_CHAT_STREAM_END:   'ai:stream:end',
  AI_CHAT_STREAM_ERROR: 'ai:stream:error',

  // Presence
  PRESENCE_ONLINE:     'presence:online',
  PRESENCE_OFFLINE:    'presence:offline',
  PRESENCE_AWAY:       'presence:away',
  PRESENCE_UPDATE:     'presence:update',

  // Notifications
  NOTIFICATION_NEW:    'notification:new',
  NOTIFICATION_READ:   'notification:read',

  // Comments (live updates)
  COMMENT_ADDED:       'comment:added',
  COMMENT_DELETED:     'comment:deleted',

  // Collaboration
  CURSOR_MOVE:         'collab:cursor:move',
  ENTITY_UPDATED:      'collab:entity:updated',
} as const;

export type RealtimeEvent = typeof RealtimeEvents[keyof typeof RealtimeEvents];
