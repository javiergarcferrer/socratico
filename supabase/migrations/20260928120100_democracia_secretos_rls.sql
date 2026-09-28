-- Segunda cerradura sobre el pepper de la cédula (`democracia.secretos`).
--
-- El asesor de seguridad de Supabase marca la tabla como «RLS desactivada».
-- No era alcanzable —desde 20260901043106 no tiene GRANT a `anon` ni a
-- `authenticated`—, pero RLS encendida y sin políticas es la segunda
-- cerradura si un GRANT se colara algún día.
--
-- Por qué no rompe el voto: `democracia.hash_cedula` y `democracia.hash_sujeto`
-- son SECURITY DEFINER y su dueño es el mismo rol dueño de la tabla
-- (`postgres`, comprobado en vivo el 2026-09-28), y RLS no alcanza al dueño de
-- la tabla mientras no haya `force row level security`. Comprobación después
-- de aplicar (docs/PLAN-ESPACIOS.md §5): como `authenticated`,
-- `select democracia.hash_cedula('00100000001') is not null` → true.
--
-- Va en su propia migración y no dentro de la de `espacios`: toca la otra
-- excepción, y se aplica, se comprueba y se revierte por separado.

alter table democracia.secretos enable row level security;
