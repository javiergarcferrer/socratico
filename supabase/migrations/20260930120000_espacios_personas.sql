-- Guardar y seguir personas con cargo público, entidades financieras y empresas.
--
-- Las fichas de la cuarta pasada (`/funcionarios/[slug]`, `/banca/[slug]`,
-- `/empresas/[rnc]`) comparten y enlazan, pero no se podían guardar en un
-- proyecto ni seguir: `espacios.tipo_valido` (el `check` de `entradas.tipo`) y
-- el `check` de `seguimientos.tipo` no las conocían. Solo se amplían las dos
-- listas: una entrada sigue siendo una referencia (tipo, ref, título, ruta) y
-- ningún dato del Estado entra a la base.

create or replace function espacios.tipo_valido(t text)
returns boolean language sql immutable set search_path = '' as $$
  select t in (
    'institucion', 'proveedor', 'proceso', 'norma', 'proyecto', 'expediente-senado',
    'legislador', 'sentencia', 'obra', 'capitulo', 'documento', 'dato', 'cargo', 'busqueda',
    'funcionario', 'entidad-financiera', 'empresa'
  );
$$;

alter table espacios.seguimientos drop constraint if exists seguimientos_tipo_check;
alter table espacios.seguimientos add constraint seguimientos_tipo_check check (tipo in (
  'proceso', 'proyecto', 'expediente-senado', 'proveedor', 'institucion', 'norma',
  'funcionario', 'entidad-financiera', 'empresa'
));
