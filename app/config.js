// Global leaderboard. Leave both blank to keep scores on each player's own
// device. To share one leaderboard between everyone, create a free Supabase
// project, run tools/leaderboard.sql in its SQL editor, then paste the
// project URL and the "anon public" API key below (Settings -> API).
// The anon key is designed to be public; the SQL's row-level security rules
// allow reading and adding scores, and nothing else.
//
// NEVER paste the service_role / secret key here. Everything in this file is
// public, and that key bypasses all protection. The app refuses to use it.
export const LEADERBOARD = {
  url: 'https://iqccveionwlafmvsinsk.supabase.co',
  key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlxY2N2ZWlvbndsYWZtdnNpbnNrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA4NDQzMjQsImV4cCI6MjEwNjQyMDMyNH0.IqtYlI9hQSxzP2tehCGQwhSt4dxqJlUC1N7aiVj34sA', // anon public key (safe to publish)
};
