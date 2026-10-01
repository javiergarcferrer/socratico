# w3id.org — los IRIs persistentes de Socrático

- **Para:** los mantenedores de w3id.org (W3C Permanent Identifier Community Group)
- **Vía:** un *pull request* al repositorio público https://github.com/perma-id/w3id.org, desde la cuenta de GitHub del dueño (`javiergarcferrer`)
- **Fundamento:** decisión del dueño del 2026-10-01 (docs/PLAN-GRAFO.md §4.1): los IRIs del vocabulario y, desde la fase F1, los de cada nodo, viven en `https://w3id.org/socratico/…` y no en el dominio del despliegue
- **Estado:** preparado, sin enviar. **La ontología 2.0.0 ya usa estos IRIs**: hasta que el pull request se acepte, `https://w3id.org/socratico/def/core#Persona` no resuelve (los documentos de la ontología se siguen sirviendo en `/ontologia`)

---

## Qué se añade al repositorio de w3id

Una carpeta `socratico/` con dos archivos.

### `socratico/.htaccess`

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

### `socratico/README.md`

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

## Pasos

1. Hacer *fork* de https://github.com/perma-id/w3id.org con la cuenta `javiergarcferrer`.
2. Crear la carpeta `socratico/` con los dos archivos de arriba, tal cual.
3. Abrir el *pull request* con el título `Add socratico` y, en la descripción, una línea: «Persistent identifiers for the Socrático.do knowledge graph (vocabulary at /def/, instances at /id/). Maintainer: @javiergarcferrer.»
4. Cuando lo acepten (suele tardar de días a un par de semanas), comprobar:
   - `curl -sIL https://w3id.org/socratico/def/core` → 302 a `https://socratico.vercel.app/def/core`, luego 303 a `/ontologia` y 200;
   - `curl -sIL -H "Accept: text/turtle" https://w3id.org/socratico/def/do` → termina en `/ontologia.ttl` (200, `text/turtle`).
5. Anotar en este archivo y en `docs/gestiones/README.md` la fecha de aceptación, y quitar los avisos de que los IRIs aún no resuelven: `docs/ARQUITECTURA.md` §Grafo semántico y la página `/ontologia` (`app/ontologia/page.tsx`).
