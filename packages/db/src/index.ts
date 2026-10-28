// Everything that talks to Supabase: the kyc_sessions table and the private
// media bucket. Server-only (it uses the service-role key).
export { supabase } from "./client";
export * from "./sessions";
export * from "./media";
