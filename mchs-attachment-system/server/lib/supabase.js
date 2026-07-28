const { createClient } = require('@supabase/supabase-js');

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  // eslint-disable-next-line no-console
  console.warn(
    '[supabase] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set. ' +
      'Copy server/.env.example to server/.env and fill in your project credentials.'
  );
}

// IMPORTANT: this client uses the SERVICE ROLE key and must never be
// exposed to the browser. All requests are gated by server/middleware/auth.js
// before reaching any route that touches this client.
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: { autoRefreshToken: false, persistSession: false },
  }
);

module.exports = { supabaseAdmin };
