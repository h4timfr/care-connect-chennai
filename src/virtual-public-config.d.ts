declare module "virtual:careconnect-public-config" {
  const config: import("./lib/supabase/config").SupabaseConfigResult;
  export default config;
}
