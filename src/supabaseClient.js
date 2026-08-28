import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    "Supabase sozlamalari topilmadi. .env faylida VITE_SUPABASE_URL va VITE_SUPABASE_ANON_KEY ni to'ldiring."
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

export const MANAGE_USERS_FN_URL = `${supabaseUrl}/functions/v1/manage-users`;

export const ALLOWED_ROLES = [
  { value: "super_admin", label: "Super admin" },
  { value: "aparat_hodimi", label: "Apparat hodimi" },
  { value: "direktor", label: "Direktor" },
  { value: "markaz_hodimi", label: "Markaz hodimi" },
  { value: "togarak_rahbari", label: "To'garak rahbari" },
  { value: "maktab_maslahatchisi", label: "Maktab maslahatchisi" },
  { value: "oddiy_hodim", label: "Oddiy hodim" },
];

export const ROLES_WITHOUT_TUMAN = ["super_admin", "aparat_hodimi"];
