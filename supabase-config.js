export const SUPABASE_URL = "https://hsahgureabomaahbikng.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY = "sb_publishable__mZN456uPQYcrLeWJFV1AQ_54Fadejn";

export const isSupabaseConfigured =
  SUPABASE_URL.startsWith("https://") &&
  !SUPABASE_URL.includes("YOUR_") &&
  !SUPABASE_PUBLISHABLE_KEY.includes("YOUR_");
