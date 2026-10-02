# w3id.org — los IRIs persistentes de Socrático

- **Para:** los mantenedores de w3id.org (W3C Permanent Identifier Community Group)
- **Vía:** un *pull request* al repositorio público https://github.com/perma-id/w3id.org, desde la cuenta de GitHub del dueño (`javiergarcferrer`)
- **Fundamento:** decisión del dueño del 2026-10-01 (docs/PLAN-GRAFO.md §4.1): los IRIs del vocabulario y, desde la fase F1, los de cada nodo, viven en `https://w3id.org/socratico/…` y no en el dominio del despliegue
- **Estado:** preparado, sin enviar. Una sesión no puede abrirlo: no tiene escritura en `perma-id/w3id.org` ni puede hacer *fork* en la cuenta del dueño (comprobado el 2026-10-02). `ids/socratico` estaba libre ese día. **La ontología 2.0.0 ya usa estos IRIs**: hasta que el pull request se acepte, `https://w3id.org/socratico/def/core#Persona` no resuelve (los documentos de la ontología se siguen sirviendo en `/ontologia`)

---

## Qué se añade al repositorio de w3id

Una carpeta `ids/socratico/` con dos archivos (la convención vigente de su README: cada identificador va bajo `ids/`, con su `.htaccess` y un `README.md` con el contacto; ejemplos en `ids/examples`).

### `ids/socratico/.htaccess`

```apache
# Socrático.do — herramienta independiente y no oficial sobre datos del Estado dominicano
# https://socratico.vercel.app
# Mantenedor: Javier García Ferrer (GitHub: javiergarcferrer)
#
# Todo https://w3id.org/socratico/<ruta> va a https://socratico.vercel.app/<ruta>,
# que resuelve /def/core, /def/do (el vocabulario, por Accept: HTML, Turtle,
# JSON-LD o N-Triples), /def/formas (SHACL), /def/fabric (perfil para Fabric IQ)
# y, más adelante, /id/… (cada nodo).
# Si el sitio cambia de dominio, solo cambia esta línea.
Options +FollowSymLinks
RewriteEngine on
RewriteRule ^(.*)$ https://socratico.vercel.app/$1 [R=302,L]
```

Un solo redireccionamiento para todo: las reglas de qué ruta da qué documento viven en el sitio (`next.config.ts`, `redirects()`), así que cambiarlas no exige otro pull request. 302 y no 301, para que un cambio de dominio no quede guardado en las cachés.

### `ids/socratico/README.md`

```markdown
# Socrático.do

Persistent identifiers for the Socrático.do knowledge graph: an independent,
unofficial platform over public data of the Dominican Republic.

- Vocabulary: https://w3id.org/socratico/def/core (country-neutral core, `soc:`)
  and https://w3id.org/socratico/def/do (Dominican Republic module, `do:`)
- SHACL shapes: https://w3id.org/socratico/def/formas
- Microsoft Fabric IQ profile: https://w3id.org/socratico/def/fabric
- Instances (planned): https://w3id.org/socratico/id/…

All paths redirect to https://socratico.vercel.app/<path>.

Maintainer: Javier García Ferrer (GitHub: @javiergarcferrer)
```

## Por terminal, de una vez (con `gh` iniciado como el dueño)

Una sesión no puede: su acceso a GitHub se limita a `javiergarcferrer/socratico`, y crear el *fork* o empujar a `perma-id/w3id.org` se rechaza (comprobado el 2026-10-02). Desde la máquina del dueño, con [GitHub CLI](https://cli.github.com) (`gh auth login` una vez), esto hace los pasos 1–4 de abajo:

```bash
set -euo pipefail
gh repo fork perma-id/w3id.org --clone=false
# Solo la carpeta nueva: el repositorio de w3id es grande.
git clone --depth 1 --filter=blob:none --sparse https://github.com/javiergarcferrer/w3id.org /tmp/w3id-socratico
cd /tmp/w3id-socratico
git sparse-checkout set ids/socratico
git checkout -b socratico
mkdir -p ids/socratico
cat > ids/socratico/.htaccess <<'FIN'
# Socrático.do — herramienta independiente y no oficial sobre datos del Estado dominicano
# https://socratico.vercel.app
# Mantenedor: Javier García Ferrer (GitHub: javiergarcferrer)
#
# Todo https://w3id.org/socratico/<ruta> va a https://socratico.vercel.app/<ruta>,
# que resuelve /def/core, /def/do (el vocabulario, por Accept: HTML, Turtle,
# JSON-LD o N-Triples), /def/formas (SHACL), /def/fabric (perfil para Fabric IQ)
# y, más adelante, /id/… (cada nodo).
# Si el sitio cambia de dominio, solo cambia esta línea.
Options +FollowSymLinks
RewriteEngine on
RewriteRule ^(.*)$ https://socratico.vercel.app/$1 [R=302,L]
FIN
cat > ids/socratico/README.md <<'FIN'
# Socrático.do

Persistent identifiers for the Socrático.do knowledge graph: an independent,
unofficial platform over public data of the Dominican Republic.

- Vocabulary: https://w3id.org/socratico/def/core (country-neutral core, `soc:`)
  and https://w3id.org/socratico/def/do (Dominican Republic module, `do:`)
- SHACL shapes: https://w3id.org/socratico/def/formas
- Microsoft Fabric IQ profile: https://w3id.org/socratico/def/fabric
- Instances (planned): https://w3id.org/socratico/id/…

All paths redirect to https://socratico.vercel.app/<path>.

Maintainer: Javier García Ferrer (GitHub: @javiergarcferrer)
FIN
git add ids/socratico
git commit -m "Add socratico"
git push -u origin socratico
gh pr create --repo perma-id/w3id.org --base master --head javiergarcferrer:socratico \
  --title "Add socratico" \
  --body "Persistent identifiers for the Socrático.do knowledge graph (vocabulary at /def/, instances at /id/). Redirects to https://socratico.vercel.app. Maintainer: @javiergarcferrer."
```

Imprime la dirección del pull request. Después, el paso 5 de abajo.

## Pasos (unos dos minutos, en el navegador)

1. En https://github.com/perma-id/w3id.org, botón **Fork** → *Create fork* (queda en `javiergarcferrer/w3id.org`).
2. En el fork, **Add file → Create new file**. Nombre: `ids/socratico/.htaccess`. Pegar el bloque de arriba tal cual. Abajo, *Commit changes*, mensaje `socratico: add .htaccess`, en una rama nueva `socratico` (*Create a new branch*).
3. En la misma rama `socratico`, **Add file → Create new file**: `ids/socratico/README.md`, con el bloque de arriba. Mensaje `socratico: add README`.
4. GitHub ofrece **Compare & pull request** hacia `perma-id/w3id.org`, rama `master`. Título: `Add socratico`. Descripción: «Persistent identifiers for the Socrático.do knowledge graph (vocabulary at /def/, instances at /id/). Redirects to https://socratico.vercel.app. Maintainer: @javiergarcferrer.» *Create pull request*.
5. Cuando lo acepten (suele tardar de días a un par de semanas), comprobar:
   - `curl -sIL https://w3id.org/socratico/def/core` → 302 a `https://socratico.vercel.app/def/core`, luego 303 a `/ontologia` y 200;
   - `curl -sIL -H "Accept: text/turtle" https://w3id.org/socratico/def/do` → termina en `/ontologia.ttl` (200, `text/turtle`).
6. Anotar en este archivo y en `docs/gestiones/README.md` la fecha de aceptación, y quitar los avisos de que los IRIs aún no resuelven: `docs/ARQUITECTURA.md` §Grafo semántico y la página `/ontologia` (`app/ontologia/page.tsx`).
