/**
 * Configuración pública de Supabase para la vertical `/democracia`.
 *
 * Ambos valores son **publicables por diseño** (la clave `sb_publishable_…`
 * está pensada para viajar en el bundle del navegador; la protección real es
 * RLS en la base). Van con fallback literal para que producción funcione sin
 * configurar nada en Vercel; las env vars, si existen, mandan. El material
 * sensible (el pepper del hash de cédula) vive dentro de Postgres y jamás
 * pasa por aquí — ver docs/INFRAESTRUCTURA.md §10.
 */

export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://amuyclnyjyhigeyhuufs.supabase.co";

export const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "sb_publishable_m-khm-YrBUPGj54RGRfCQA_dr38rS4D";
