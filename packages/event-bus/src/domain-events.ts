/**
 * Well-known in-process domain event names.
 * These are fired within the same process — for cross-instance events use broker Events.
 */
export const DomainEvents = {
  // Auth
  USER_REGISTERED:    'auth.user.registered',
  USER_LOGIN:         'auth.user.login',
  USER_LOGOUT:        'auth.user.logout',
  PASSWORD_CHANGED:   'auth.password.changed',
  OTP_REQUESTED:      'auth.otp.requested',
  OTP_VERIFIED:       'auth.otp.verified',

  // Users
  USER_PROFILE_UPDATED:   'users.profile.updated',
  USER_SUSPENDED:         'users.user.suspended',
  USER_DELETED:           'users.user.deleted',

  // Tenancy
  TENANT_CREATED:         'tenancy.tenant.created',
  TENANT_MEMBER_JOINED:   'tenancy.member.joined',
  TENANT_MEMBER_INVITED:  'tenancy.member.invited',
  TENANT_MEMBER_REMOVED:  'tenancy.member.removed',

  // Billing
  SUBSCRIPTION_STARTED:   'billing.subscription.started',
  SUBSCRIPTION_CANCELLED: 'billing.subscription.cancelled',
  INVOICE_PAID:           'billing.invoice.paid',
  PAYMENT_FAILED:         'billing.payment.failed',

  // Notifications
  NOTIFICATION_CREATED:   'notifications.notification.created',

  // Storage
  FILE_UPLOADED:          'storage.file.uploaded',
  FILE_DELETED:           'storage.file.deleted',
} as const;

export type DomainEventName = typeof DomainEvents[keyof typeof DomainEvents];
