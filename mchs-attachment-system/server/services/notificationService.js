const { supabaseAdmin } = require('../lib/supabase');

/**
 * Creates a notification card. Types map 1:1 to the `notification_type` enum:
 * allocation_generated | allocation_finalized | students_unallocated |
 * capacity_exceeded | duplicate_detected | manual_change
 */
async function notify({ type, title, message, relatedEntityType = null, relatedEntityId = null }) {
  const { error } = await supabaseAdmin.from('notifications').insert({
    type,
    title,
    message,
    related_entity_type: relatedEntityType,
    related_entity_id: relatedEntityId,
  });

  if (error) {
    // eslint-disable-next-line no-console
    console.error('[notifications] Failed to create notification:', error.message);
  }
}

module.exports = { notify };
