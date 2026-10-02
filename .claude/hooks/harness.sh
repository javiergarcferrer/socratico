#!/bin/bash
# ¿Sigue siendo cierto lo que el harness dice de sí mismo?
#
# Un archivo solo moldea una sesión si la sesión lo carga de verdad
# (docs/INFRAESTRUCTURA.md §12.1), y la prosa es la explicación de un pin de la
# máquina, no su sustituto. Esto es el pin. Comprueba las cuatro cosas que el harness
# afirma y que se rompen en silencio:
#
#   1. El techo de `CLAUDE.md`. Se inyecta entero en cada turno, así que su
#      longitud es el presupuesto más escaso del repositorio. Llegó a 441
#      líneas y 27.9 KB sin que nada avisara.
#   2. Que exista cada ruta del repositorio que `CLAUDE.md` nombra. Una tabla
#      que apunta a un archivo movido manda a la sesión a un sitio que no está.
#   3. Que cada `.claude/rules/*.md` nombre la página de `docs/` que describe
#      su zona y que esa página exista.
#   4. Que cada habilidad y agente tenga frontmatter utilizable: `name` y
#      `description` (la descripción **es** el disparador) y, en un agente,
#      `model` y `effort` — sin `effort`, un barrido de solo lectura hereda el
#      de la sesión.
#
# Imprime una línea por hallazgo; sale con 1 si hay alguno.
set -u
raiz="${1:-.}"
cd "$raiz" || exit 0
fallos=0
mal() { echo "$1"; fallos=$((fallos + 1)); }

# ---------------------------------------------------------------- 1. el techo
LIN_MAX=120
BYTES_MAX=12288
if [ -f CLAUDE.md ]; then
  lineas=$(wc -l < CLAUDE.md)
  bytes=$(wc -c < CLAUDE.md)
  [ "$lineas" -le "$LIN_MAX" ] || mal "CLAUDE.md: $lineas líneas > $LIN_MAX — se paga en cada turno; lo que crezca va a docs/INFRAESTRUCTURA.md (§12.2)"
  [ "$bytes" -le "$BYTES_MAX" ] || mal "CLAUDE.md: $bytes bytes > $BYTES_MAX — íd."
else
  mal "CLAUDE.md no existe"
fi

# ------------------------------------------------- 2. las rutas que se nombran
if [ -f CLAUDE.md ]; then
  grep -oE '`(app|lib|components|docs|scripts|public|supabase|\.claude)/[A-Za-z0-9_./*-]+`' CLAUDE.md \
    | tr -d '`' | sort -u | while read -r ruta; do
      case "$ruta" in *\**) continue ;; esac
      [ -e "$ruta" ] || echo "CLAUDE.md nombra '$ruta', que no existe"
    done > /tmp/.harness-rutas.$$ 2>/dev/null
  while read -r linea; do [ -n "$linea" ] && mal "$linea"; done < /tmp/.harness-rutas.$$
  rm -f /tmp/.harness-rutas.$$
fi

# --------------------------------- 2b. las secciones de CLAUDE.md que se citan
# Un `CLAUDE.md §"X"` en un hook, una habilidad o un script manda a la sesión a
# un epígrafe concreto. Al reescribir el archivo de arranque, cuatro de esas
# citas quedaron apuntando a secciones que ya no existían — y ninguna falla
# hasta que alguien va a buscarlas y no las encuentra.
if [ -f CLAUDE.md ]; then
  epigrafes="$(grep '^## ' CLAUDE.md | sed 's/^## //')"
  # Se excluye el comprobador, que cita la forma como ejemplo.
  grep -rhoE 'CLAUDE\.md §"[^"]+"' .claude scripts docs \
    --exclude=harness.sh 2>/dev/null | sort -u | while read -r cita; do
    titulo="${cita#*§\"}"; titulo="${titulo%\"}"
    printf '%s\n' "$epigrafes" | grep -qxF "$titulo" \
      || echo "se cita CLAUDE.md §\"$titulo\", que ya no es una sección"
  done > /tmp/.harness-sec.$$ 2>/dev/null
  while read -r linea; do [ -n "$linea" ] && mal "$linea"; done < /tmp/.harness-sec.$$
  rm -f /tmp/.harness-sec.$$
fi

# ------------------------------------------- 3. cada regla declara su dueña
for regla in .claude/rules/*.md; do
  [ -e "$regla" ] || continue
  duena="$(grep -oE '(docs/[A-Z-]+\.md|supabase/CLAUDE\.md)' "$regla" | head -1)"
  if [ -z "$duena" ]; then
    mal "$regla no nombra la página de docs/ que describe su zona (docs/INFRAESTRUCTURA.md §12.8)"
  elif [ ! -e "$duena" ]; then
    mal "$regla condensa '$duena', que no existe"
  fi
done

# --------------------------------- 4. frontmatter de habilidades y agentes
campo() { sed -n '2,/^---$/p' "$1" | grep -cE "^$2:" ; }
for hab in .claude/skills/*/SKILL.md; do
  [ -e "$hab" ] || continue
  head -1 "$hab" | grep -q '^---$' || { mal "$hab no abre con frontmatter"; continue; }
  [ "$(campo "$hab" name)" -ge 1 ] || mal "$hab sin 'name'"
  [ "$(campo "$hab" description)" -ge 1 ] || mal "$hab sin 'description' — la descripción ES el disparador"
done
for ag in .claude/agents/*.md; do
  [ -e "$ag" ] || continue
  head -1 "$ag" | grep -q '^---$' || { mal "$ag no abre con frontmatter"; continue; }
  [ "$(campo "$ag" name)" -ge 1 ] || mal "$ag sin 'name'"
  [ "$(campo "$ag" description)" -ge 1 ] || mal "$ag sin 'description'"
  [ "$(campo "$ag" model)" -ge 1 ] || mal "$ag sin 'model'"
  [ "$(campo "$ag" effort)" -ge 1 ] || mal "$ag sin 'effort' — sin él hereda el de la sesión (docs/INFRAESTRUCTURA.md §12.10)"
done

exit $([ "$fallos" -eq 0 ] && echo 0 || echo 1)
