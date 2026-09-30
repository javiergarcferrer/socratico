#!/usr/bin/env bash
# Aplica al proyecto de Supabase lo que el panel de Auth pide a mano:
# Site URL de producción, la lista de redirecciones y las dos plantillas de
# correo (Magic Link y Confirm signup) desde supabase/templates/.
#
# Es una **acción del dueño**: cambia la
# configuración del proyecto en vivo. El token no se guarda en ningún sitio,
# se lee del entorno y muere con el proceso.
#
#   SUPABASE_ACCESS_TOKEN=sbp_… ./scripts/aplicar-auth-supabase.sh
#
# El token sale de https://supabase.com/dashboard/account/tokens y manda sobre
# TODOS los proyectos de la cuenta: úsalo y revócalo.
set -euo pipefail

REF="${SUPABASE_PROJECT_REF:-amuyclnyjyhigeyhuufs}"
SITIO="${SITIO:-https://socratico.vercel.app}"
RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [ -z "${SUPABASE_ACCESS_TOKEN:-}" ]; then
  echo "Falta SUPABASE_ACCESS_TOKEN (https://supabase.com/dashboard/account/tokens)" >&2
  exit 1
fi

cuerpo="$(SITIO="$SITIO" RAIZ="$RAIZ" python3 - <<'PY'
import json, os, pathlib
raiz = pathlib.Path(os.environ["RAIZ"])
sitio = os.environ["SITIO"]
lee = lambda n: (raiz / "supabase" / "templates" / n).read_text(encoding="utf-8")
print(json.dumps({
    "site_url": sitio,
    # El Site URL siempre vale; la lista añade el resto de destinos posibles.
    "uri_allow_list": ",".join([f"{sitio}/**", "http://localhost:3000/**"]),
    "mailer_subjects_magic_link": "Tu código para entrar a Socrático",
    "mailer_templates_magic_link_content": lee("magic-link.html"),
    "mailer_subjects_confirmation": "Tu código para crear tu cuenta en Socrático",
    "mailer_templates_confirmation_content": lee("confirm-signup.html"),
}))
PY
)"

echo "→ PATCH config/auth de $REF (Site URL: $SITIO)"
respuesta="$(curl -sS -X PATCH "https://api.supabase.com/v1/projects/$REF/config/auth" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$cuerpo")"

python3 - "$respuesta" <<'PY'
import json, sys
try:
    d = json.loads(sys.argv[1])
except Exception:
    print("Respuesta no-JSON:", sys.argv[1][:400])
    sys.exit(1)
if d.get("message") or d.get("error"):
    print("✗", d.get("message") or d.get("error"))
    sys.exit(1)
tiene = lambda k: "{{ .Token }}" in (d.get(k) or "")
print("✓ site_url            :", d.get("site_url"))
print("✓ uri_allow_list      :", d.get("uri_allow_list"))
print("✓ asunto magic link   :", d.get("mailer_subjects_magic_link"))
print("✓ asunto confirmation :", d.get("mailer_subjects_confirmation"))
print("✓ código en magic_link  :", tiene("mailer_templates_magic_link_content"))
print("✓ código en confirmation:", tiene("mailer_templates_confirmation_content"))
PY
