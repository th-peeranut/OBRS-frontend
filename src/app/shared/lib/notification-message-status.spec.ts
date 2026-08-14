import {
  notificationMessageStatusChipClass,
  notificationMessageStatusLabelKey,
} from './notification-message-status';

describe('notificationMessageStatusChipClass', () => {
  it('maps each known status to a distinct chip class', () => {
    expect(notificationMessageStatusChipClass('PENDING')).toBe('is-warning');
    expect(notificationMessageStatusChipClass('APPROVED')).toBe('is-success');
    expect(notificationMessageStatusChipClass('REJECTED')).toBe('is-danger');
  });

  it('falls back to is-neutral for NONE and any unrecognized status', () => {
    expect(notificationMessageStatusChipClass('NONE')).toBe('is-neutral');
    expect(notificationMessageStatusChipClass('SUPERSEDED')).toBe('is-neutral');
    expect(notificationMessageStatusChipClass('anything-else')).toBe('is-neutral');
  });
});

describe('notificationMessageStatusLabelKey', () => {
  it('maps each known status to its i18n key', () => {
    expect(notificationMessageStatusLabelKey('PENDING')).toBe('ADMIN.NOTIFICATION_MESSAGES.STATUS.PENDING');
    expect(notificationMessageStatusLabelKey('APPROVED')).toBe('ADMIN.NOTIFICATION_MESSAGES.STATUS.APPROVED');
    expect(notificationMessageStatusLabelKey('REJECTED')).toBe('ADMIN.NOTIFICATION_MESSAGES.STATUS.REJECTED');
  });

  it('falls back to the NONE key for anything else', () => {
    expect(notificationMessageStatusLabelKey('NONE')).toBe('ADMIN.NOTIFICATION_MESSAGES.STATUS.NONE');
    expect(notificationMessageStatusLabelKey('SUPERSEDED')).toBe('ADMIN.NOTIFICATION_MESSAGES.STATUS.NONE');
  });
});
