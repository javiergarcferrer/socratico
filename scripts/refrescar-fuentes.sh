#!/bin/bash
# El refresco de las instantáneas con red (docs/INFRAESTRUCTURA.md §6, «Orden»),
# como lo corre el flujo `.github/workflows/refrescar.yml` y como puede correrlo
# una persona con una red que los orígenes acepten.
#
# Cada script corre con su plazo y deja su instantánea como estaba si falla:
# todos se niegan a escribir un resultado parcial o inverosímil (§6, «Contrato
# común»). Un fallo no detiene a los demás. La primera etapa corre en paralelo
# solo entre instituciones distintas: los scripts que leen el mismo origen
# (la Consultoría, la DGCP, Crédito Público, el SIGEF, el SIL) van uno tras
# otro en su grupo, para que ningún host reciba dos lectores a la vez.
#
# Imprime una línea por script (ok o FALLO, segundos y el final de su
# registro) y, si existe, el mismo resumen en $GITHUB_STEP_SUMMARY. Los
# registros completos quedan en .cache/refrescar/ (ignorado por git).
# Sale con 0 aunque haya fallos: lo que decide si algo se publica es el gate.
set -u
cd "$(dirname "$0")/.." || exit 1
LOGS=".cache/refrescar"
mkdir -p "$LOGS"
RESUMEN="$LOGS/resumen.txt"
: > "$RESUMEN"

correr() {
  local nombre="$1" plazo="$2"
  shift 2
  local t0=$SECONDS linea
  if timeout "$plazo" "$@" >"$LOGS/$nombre.log" 2>&1; then
    linea="$(printf 'ok     %-16s %5ss' "$nombre" $((SECONDS - t0)))"
  else
    linea="$(printf 'FALLO  %-16s %5ss  %s' "$nombre" $((SECONDS - t0)) "$(tail -c 300 "$LOGS/$nombre.log" | tr '\n' ' ')")"
  fi
  echo "$linea" | tee -a "$RESUMEN"
}
py() { correr "$1" "$2" python3 "scripts/build-$1.py" "${@:3}"; }

# 1. Sin otras instantáneas. Un grupo por origen; los grupos, en paralelo.
( py normativa 1800; py leyes 1800; py decretos 7200 ) &
( py procesos 3600; py historico 3600; py rnc 3600; py empresas 3600; py sanciones 1800 ) &
( py deuda 1800; py subastas 1800; py tenedores 1800 ) &
( py fiscal 1800; py subsidio 1800 ) &
( py congreso 3600; py votaciones 9000 ) &
( py bcrd 900; py justicia 900; py sentencias 1800; py mapa 900 ) &
( py banca 3600; py sociedad 1800; py catalogo 3600 ) &
( py documentos 5400; py nomina 3600 --descargar ) &
wait

# 2–5. Las que leen otras instantáneas, en su orden.
py instituciones 1800
py obras 1800
py sismap 900
py auditorias 900
py nomina-general 1800
py funcionarios 7200
py declaraciones 1800
py wikidata 900
py historico-rnc 900

fallos="$(grep -c '^FALLO' "$RESUMEN")"
echo "fuentes: $(grep -c '^ok' "$RESUMEN") al día, $fallos fallaron (registros en $LOGS/)"
if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  { echo "### Fuentes"; echo '```'; cat "$RESUMEN"; echo '```'; } >> "$GITHUB_STEP_SUMMARY"
fi
exit 0
