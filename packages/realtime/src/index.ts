/**
 * @gigalibs/realtime
 *
 * Socket.IO server setup for NestJS.
 * Tenant-namespaced rooms. JWT auth handshake. Redis adapter for multi-instance.
 *
 * @module
 */

export * from './gateway.js';
export * from './realtime-events.js';
export * from './room-manager.js';
