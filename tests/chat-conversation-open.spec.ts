import { describe, expect, it } from 'vitest';

import { isConversationOpen } from '../src/api/messaging.api';

/**
 * The web chat rendered "Khung trò chuyện đã đóng" on every conversation,
 * including brand new ones, and the feature read as unbuilt.
 *
 * Nothing was unbuilt. The thread asked `status === 'ACTIVE'` while the wire
 * carries `"status": "active"`, so the comparison was false for every open
 * conversation. The backend had already answered the same question correctly
 * in `canSend`, and the mobile app reads that field alone - which is exactly
 * why mobile worked and the web did not.
 *
 * Verified against the running backend before the fix:
 *   GET /conversations -> {"status": "active", ..., "canSend": true}
 */
describe('isConversationOpen', () => {
  it('accepts the lowercase the backend actually sends', () => {
    expect(isConversationOpen('active')).toBe(true);
  });

  it('accepts uppercase too, so a later backend change cannot close the chat', () => {
    expect(isConversationOpen('ACTIVE')).toBe(true);
  });

  it('is closed for a read-only or closed conversation, in either spelling', () => {
    expect(isConversationOpen('closed')).toBe(false);
    expect(isConversationOpen('CLOSED')).toBe(false);
    expect(isConversationOpen('read_only')).toBe(false);
    expect(isConversationOpen('READ_ONLY')).toBe(false);
  });

  it('treats a missing status as closed rather than throwing', () => {
    expect(isConversationOpen(null)).toBe(false);
    expect(isConversationOpen(undefined)).toBe(false);
  });
});
