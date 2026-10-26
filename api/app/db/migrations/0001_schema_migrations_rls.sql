-- Supabase exposes tables in public through its Data API; RLS with no policies closes that.
ALTER TABLE schema_migrations ENABLE ROW LEVEL SECURITY;
