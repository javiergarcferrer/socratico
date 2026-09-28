# PLAN — Democracia Legislativa

Plan de implementación del piloto de **voto ciudadano sobre legislación**:
la ciudadanía marca 👍/👎 sobre las iniciativas de Diputados y Senado que la
plataforma ya integra, con registro por cédula y medidas de seguridad de nivel
institucional. Producto de la fase QRSPI (Questions → Recon → Spike → Plan →
Implementación); las tres primeras fases ya corrieron y sus hallazgos están
abajo.

> **Marco, sin ambigüedad.** Esto es un **piloto ciudadano independiente y no
> oficial**. No es un canal formal de participación del Estado, sus resultados
> no obligan a nadie, y la UI lo dice en cada superficie. La credibilidad ante
> OGTIC/gobierno se construye demostrando estándares de seguridad y minimización
> de datos — nunca aparentando ser el Estado.

---

## 0. Decisiones tomadas (fase Q)

| Pregunta | Decisión |
|---|---|
| Persistencia | **Supabase**, proyecto existente `Transac` (`amuyclnyjyhigeyhuufs`) |
| Identidad v1 | **Cédula válida (Luhn) + OTP a email**; un voto por cédula |
| Identidad v2 | **Cuenta Única (OGTIC)** como verificación encima de la sesión; recon hecha, bloqueada por el cliente OAuth2 (§9) |
| Ubicación | **Vertical `/democracia`** dentro de Socrático.do |

Esto **rompe deliberadamente** las dos reglas fundacionales de la plataforma
(«sin base de datos, sin variables de entorno»). La excepción queda acotada,
documentada aquí y enmendada en `CLAUDE.md`: solo este vertical toca la BD, y el
resto de la plataforma sigue siendo lectura en vivo sin estado.

---

## 1. Hallazgos de Recon / Spike

- **Supabase `Transac`**: Postgres 17, us-east-1, `ACTIVE_HEALTHY`. ⚠️ Comparte
  el pool de **Auth con otra app** (27 usuarios) y ya tiene `public.profiles`.
  **Implicación de diseño:** todo lo nuestro va a un **schema `democracia`**
  aislado, y **votar exige un registro `democracia.votantes`** creado solo por
  el flujo de cédula — un usuario ajeno autenticado no puede votar sin
  registrarse. Recomendación para producción: proyecto dedicado (el dossier lo
  dirá).
- **Cédula dominicana**: 11 dígitos, verificador **Luhn** (pesos 1,2 alternos,
  restar 9 si el producto supera 9, mód-10). Verificado: auto-consistente al
  100% y detecta el 100% de los errores de un dígito. Algoritmo público — sirve
  para rechazar tipeos y cédulas inventadas, **no** para probar identidad real
  (eso exige el padrón JCE; ver §6).
- **Deuda — Crédito Público** (Auditoría Fase 1): el XLSX
  `08Saldo Evolución Deuda del Sector Público No Financiero.xlsx` tiene la hoja
  `Saldo-Evolución {Mes-AA}`; la fila **«Deuda Pública Total del …»** trae en
  la columna C el saldo (millones US$) y el desglose Externa/Interna en las dos
  filas siguientes. URL:
  `/Content/estadisticas/anual/{año}/{NN}{Mes}/08Saldo…xlsx`. Sin clave.
- **Normativa — Consultoría Jurídica** (Auditoría Fase 2): `GET /consulta/` da
  el token antiforgery; `POST /Consulta/Home/Search` con `DocumentTypeCode`
  (3=Decretos, 1=Leyes, 1014=Gaceta) + campos de
  `/Consulta/Home/LoadForms?formType=` devuelve una **tabla HTML** (Tipo·
  Número· Título· Gaceta· Fecha) en ~2 s **si la consulta va acotada**; sin
  filtro cuelga (renderiza todo el histórico 1926–2026 sin paginar).

---

## 2. Arquitectura

```
Next.js (Vercel)                         Supabase (proyecto Transac)
┌───────────────────────────┐            ┌────────────────────────────────┐
│ /democracia  (server)     │            │ schema  democracia             │
│ /democracia/registro (cli)│  anon key  │  · votantes  (cedula_hash)     │
│ widget de voto (cliente)  │──────────▶ │  · votos     (RLS por dueño)   │
│ lib/supabase.ts (browser) │  auth OTP  │  · iniciativas (denormalizado) │
│ lib/democracia.ts (server)│            │  vista agregados_publicos      │
└───────────────────────────┘            │  RPC registrar_votante() SECDEF│
        │  solo claves publicables               · secretos.pepper (locked)│
        ▼                                └────────────────────────────────┘
  El app NUNCA guarda la cédula ni el pepper: la cédula es argumento
  transitorio de un RPC; el pepper vive en una tabla que solo el
  SECURITY DEFINER puede leer. El navegador solo lleva URL + anon key.
```

### Variables de entorno (la excepción, mínima)
- `NEXT_PUBLIC_SUPABASE_URL` — público.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` (clave **publicable**) — público por diseño;
  RLS protege los datos.
- **No hay secreto de aplicación.** El material sensible (pepper del hash de
  cédula) vive dentro de Postgres, no en el entorno del app. Es el punto fuerte
  del dossier.

---

## 3. Modelo de datos (schema `democracia`)

```sql
-- votante: una fila por cédula registrada. NO guarda la cédula, solo su hash.
votantes(
  id          uuid primary key references auth.users,   -- identidad = sesión
  cedula_hash text unique not null,                      -- HMAC-SHA256(cédula, pepper)
  creado      timestamptz default now()
)

-- iniciativa: espejo denormalizado para que el ranking no reconsulte el SIL.
iniciativas(
  camara      text check (camara in ('diputados','senado')),
  ref         text not null,             -- id Diputados | "{cuatrienio}:{id}" Senado
  numero      text, titulo text, grupo text,
  primary key (camara, ref)
)

-- voto: uno por votante × iniciativa, cambiable (upsert).
votos(
  votante_id  uuid references votantes on delete cascade,
  camara text, ref text,
  valor       smallint check (valor in (-1, 1)),  -- 👎 / 👍
  creado timestamptz default now(), actualizado timestamptz default now(),
  primary key (votante_id, camara, ref),
  foreign key (camara, ref) references iniciativas
)
```

**Vista pública de agregados** (`agregados_publicos`): `(camara, ref, a_favor,
en_contra, total)` — solo conteos, jamás quién votó. Es lo único que `anon`
puede leer de la cadena de votos.

---

## 4. Seguridad — medidas de nivel institucional

Inspiradas en el dossier de `proveedores` y en NORTIC A2 (seguridad web) / E1
(datos abiertos), y en la Ley 172-13 de protección de datos:

1. **Minimización de datos.** Se guarda el *hash* de la cédula, nunca la cédula;
   ningún nombre; el email solo lo administra Supabase Auth para el OTP.
2. **Cédula con pepper server-side.** `cedula_hash = HMAC-SHA256(cédula,
   pepper)`. El pepper vive en `democracia.secretos`, sin `GRANT` a
   `anon`/`authenticated`; solo lo lee la función `registrar_votante`
   (`SECURITY DEFINER`). Un volcado de la tabla `votantes` no revela cédulas ni
   permite fuerza bruta sin el pepper.
3. **RLS en cada tabla.** `votantes` y `votos`: el usuario ve y modifica **solo
   lo suyo** (`auth.uid()`). `iniciativas`: lectura pública, escritura solo por
   el flujo de voto. Nada expone el voto individual de otro.
4. **Privacidad del voto.** El agregado es público; el voto nominal es privado y
   protegido a nivel de base de datos, no de aplicación.
5. **Un voto por cédula.** Garantizado por `cedula_hash unique` + PK de `votos`
   por votante.
6. **Validación server-side.** El Luhn y la unicidad se comprueban en el RPC;
   el cliente valida solo para dar feedback, nunca como control.
7. **Rate limiting.** OTP y registro limitados (Auth de Supabase + guardas del
   app) para frenar enumeración de cédulas.
8. **Derecho al olvido (172-13).** RPC `eliminar_votante()` borra el votante y
   sus votos en cascada.
9. **Trazabilidad.** `creado`/`actualizado` en cada fila; sin PII en logs.
10. **Superficie mínima del app.** El front solo porta claves publicables;
    ninguna operación sensible ocurre fuera de Postgres.
11. **Marco no oficial** visible en cada vista; enlace a `/fuentes` y al aviso
    legal.

El **dossier de seguridad** (`/democracia/seguridad`, página pública) explica
todo esto en lenguaje llano — es el artefacto que construye credibilidad para
trabajo futuro con el gobierno.

---

## 5. UI

- **`/democracia`** — landing del piloto + **ranking**: iniciativas por apoyo
  ciudadano (más votadas, más a favor, más divididas). Explica qué es y enlaza
  al registro y al dossier.
- **`/democracia/registro`** — cédula + email → OTP → alta de votante.
- **`/democracia/seguridad`** — el dossier (medidas §4 en llano).
- **Widget de voto** 👍/👎 embebido en las fichas de iniciativa
  (`/congreso/[id]` y `/congreso/senado/[cuatrienio]/[id]`): muestra el agregado
  en vivo y, si hay sesión, el voto propio; si no, invita a registrarse.
- Nueva sección en `lib/secciones.ts` (matiz propio) → nav, barra, tab bar, pie.

### 5.1 La vuelta del OTP — medido contra el proyecto (2026-09-04)

El correo de verificación puede volver de **tres formas distintas**, y el
registro tiene que aceptar las tres mientras el Site URL del proyecto siga en
`http://localhost:3000` (decisión abierta del dueño). Lo comprobado, con
`User-Agent` identificable y sin tocar el panel:

| Prueba | Resultado |
|---|---|
| `GET /auth/v1/verify?token=…&type=magiclink&redirect_to=https://brillo-soft.vercel.app/democracia/registro` | `303 → http://localhost:3000#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired` |
| `POST /auth/v1/otp?redirect_to=https://brillo-soft.vercel.app/democracia/registro` (usuario inexistente, `create_user:false`) | `422 otp_disabled` — o sea, **pasó** la validación de redirección |
| `GET /auth/v1/settings` | `email:true`, `disable_signup:false`, `mailer_autoconfirm:true` (✅ `false` desde el 2026-09-28, docs/DECISIONES.md) |

Tres conclusiones, y las tres están en el código:

1. ✅ **GoTrue no rechaza una redirección fuera de la lista: la sustituye por el
   Site URL.** Por eso `signInWithOtp` **sí** manda `emailRedirectTo` al propio
   origen: hoy no cambia nada —el enlace aterriza igual en el Site URL— y el día
   que el dominio entre en la lista de redirecciones, el enlace vuelve a
   `/democracia/registro` y el registro se completa **solo**, sin pegar nada.
2. ✅ **La respuesta viaja siempre en el fragmento** (`#`), no en la query, y el
   flujo es implícito: en el éxito trae `access_token` + `refresh_token`, no un
   `code`.
3. ⚠️ **Pulsar el enlace gasta el token.** Quien lo pulsa desde el móvil llega a
   una página que no carga y, si vuelve a la pestaña del registro y pega la
   dirección del correo, ya no vale: el `token` está consumido. **Pero la barra
   de direcciones donde quedó varado trae la sesión hecha.** Ése es el camino
   que faltaba y el que rescata el caso real.

`leerEntrada()` en `app/democracia/registro/registro.tsx` reconoce, por eso,
cinco formas: los seis dígitos (`{{ .Token }}`), el enlace sin pulsar
(`token`/`token_hash`, con su `type`), la barra de direcciones tras pulsarlo
(`#access_token`+`refresh_token` → `setSession`), un `?code=` por si el proyecto
pasa a PKCE, y el fragmento de error (`error_code=otp_expired`), que se traduce
en vez de decir «código inválido». Los parámetros se leen tanto de la query como
del fragmento, se acepta el correo pegado entero y se deshacen las entidades
`&amp;` del HTML. La misma función corre **al cargar la página**, así que una
vuelta buena del enlace se consume sola.

Lo que sigue siendo acción de panel (no de código): poner el dominio de
producción como Site URL, añadirlo a la lista de redirecciones y meter
`{{ .Token }}` en las plantillas de correo para que traigan los seis dígitos.
Con eso, dos de los cinco caminos dejan de hacer falta.

**Las plantillas están escritas**, en la identidad de la plataforma y sin
enlace —solo el código—, listas para pegar en el panel:
`supabase/templates/magic-link.html` y `supabase/templates/confirm-signup.html`.
Son **dos** porque GoTrue usa una u otra según el caso: comprobado en los logs
de Auth del proyecto, una petición de quien ya existe sale como
`mail_type: magic_link`; un correo nuevo entra por el alta y sale con la
plantilla de confirmación. Cambiar solo una deja al primer registro de cada
persona con el comportamiento viejo.

Sin enlace a propósito: el enlace se gasta al pulsarlo, y los escáneres de
correo corporativos lo pulsan solos antes que el destinatario. Seis dígitos no
se gastan por accidente. Si algún día el Site URL apunta a producción y se
quiere el enlace de vuelta, es una línea:
`<a href="{{ .ConfirmationURL }}">Entrar directamente</a>`.

El panel no es la única vía: `scripts/aplicar-auth-supabase.sh` hace las cuatro
cosas de una (Site URL, lista de redirecciones y las dos plantillas con su
asunto) contra `PATCH /v1/projects/{ref}/config/auth` de la Management API, y
verifica la respuesta. Sigue siendo **acción del dueño**: pide un token
personal `sbp_…`, que manda sobre todos los proyectos de la cuenta y no se
guarda en ningún sitio. El MCP de Supabase **no** sirve para esto —expone
lectura, SQL, migraciones y funciones, pero ninguna escritura de configuración
de Auth—, así que o el panel o este script.

⚠️ **El remitente sigue siendo el SMTP por defecto de Supabase**
(`noreply@mail.app.supabase.io`, medido en los logs), que Supabase limita a
unos pocos correos por hora y declara no apto para producción. Antes de abrir
el piloto hay que poner SMTP propio en el panel — es otra acción del dueño.

---

## 6. Fuera del v1 (va al pitch, no al código)

- **Verificación contra el padrón JCE.** Prueba identidad real (que la cédula
  sea tuya y estés vivo/habilitado). Hoy imposible sin acuerdo: la JCE no tiene
  API pública y la DGII responde 403. Es exactamente la clase de integración que
  este piloto **justifica solicitar**: un dossier de seguridad ya construido +
  un piloto funcionando es el argumento para pedir acceso al padrón.
  **Actualización 2026-09-02:** la vía no es el padrón sino **Cuenta Única**,
  que ya lo consulta por nosotros; ver §9.
- Firma digital / cédula electrónica, verificación biométrica, apelación de
  votos, delegación temática.

---

## 7. Fases de implementación

1. **Esquema + RLS + RPC** (migraciones Supabase): tablas, vista de agregados,
   `registrar_votante`, `emitir_voto`, `eliminar_votante`, pepper. Probar RLS.
2. **Capa de datos** `lib/supabase.ts` (cliente navegador) + `lib/democracia.ts`
   (helpers server: agregados, ranking) + `lib/cedula.ts` (Luhn compartido).
3. **Auth + registro**: `/democracia/registro` con OTP email y el RPC de alta.
4. **Voto**: widget en las fichas, con estado optimista y agregados en vivo.
5. **Ranking + landing + dossier**: `/democracia`, `/democracia/seguridad`;
   sección en la IA.
6. **Config**: `@supabase/supabase-js`, env en Vercel, `CLAUDE.md` enmendado.

---

## 8. En paralelo — lo que salió de la auditoría del Estado

Pedido junto a Democracia; se integran con el patrón de siempre (lib + vista):

- **Fase 1 — Deuda pública** (`lib/deuda.ts` + tarjeta en el panorama y
  `/fuentes`): saldo del SPNF desde el XLSX de Crédito Público (§1).
- **Fase 2 — Normativa del Ejecutivo** (`lib/normativa.ts` + vertical
  `/normativa`): decretos, leyes y Gaceta vía el token+POST de la Consultoría
  (§1), con consultas acotadas.

Estas dos **no tocan la BD** ni la excepción de secretos: siguen siendo lectura
en vivo con caché.

---

## 9. Identidad v2 — Cuenta Única (recon 2026-09-02)

**Q.** ¿Puede el voto probar que detrás hay un ciudadano real y único, sin
que Socrático vea jamás la cédula? Sí: con **Cuenta Única**, la identidad
digital ciudadana de la OGTIC. Su registro ya exige cédula contra el padrón de
la JCE, prueba de vida (Rekognition) con cotejo contra la foto de la cédula y
correo verificado, y admite **una cuenta por cédula**. Es exactamente la
verificación que §6 daba por imposible sin acuerdo — y existe como servicio,
con código público: `github.com/ogticrd/cuenta-unica-registry` (MIT, Next.js
16, Ory Kratos + Hydra).

### 9.1 Recon verificada (User-Agent identificable, solo GET, 2 peticiones al emisor)

- ✅ **`https://auth.cuentaunica.gob.do/.well-known/openid-configuration`**
  responde: es Ory Hydra. `authorization_endpoint` `/oauth2/auth`,
  `token_endpoint` `/oauth2/token`, `userinfo_endpoint` `/userinfo`,
  `jwks_uri` `/.well-known/jwks.json` (2 claves RSA, RS256), `revocation` y
  `end_session`. PKCE **`S256`**; `token_endpoint_auth_methods_supported`
  incluye **`none`** → un cliente público sin secreto es válido. Scopes:
  `openid`, `offline`, `offline_access`. `subject_types_supported: public` →
  el `sub` es estable entre clientes. `require_request_uri_registration:
  true`. **No hay `registration_endpoint`**: el `client_id` lo emite la OGTIC
  a mano, no hay alta dinámica.
- ✅ `cuentaunica.gob.do` (portal, Next.js) y `mi.cuentaunica.gob.do/ui/login`
  (UI de Kratos) responden. `/robots.txt` → 404 en ambos hosts: sin
  restricción declarada.
- ⚠️ **Qué claims recibe un tercero** no se puede verificar sin cliente. El
  discovery declara solo `sub`. El código del registro obtiene la cédula de
  `traits.cedula`/`username` por la API *admin* de Kratos (no disponible a
  terceros) y cae a `preferred_username` en `/userinfo`: sugiere que la
  cédula puede viajar, no lo prueba. Se pregunta en la solicitud (§9.4).
- ⚠️ **Flujo VID** (`docs/vid-flow.md` del registro): el socio redirige a
  `/{lang}/vid?client_id&redirect_uri&access_token&state`, Cuenta Única
  repite la prueba de vida contra la foto de la JCE y devuelve al
  `redirect_uri?state=…`. **La vuelta no trae aserción firmada alguna** —
  solo el `state`. La prueba de identidad del socio es el token OIDC que ya
  tenía; VID añade «está vivo ahora», no identidad. Para el piloto sobra: el
  alta de la cuenta ya exigió prueba de vida.
- ⚠️ **Recuperación de cuenta** (`deleteIdentityByCedula` en el registro):
  recuperar borra la identidad y crea otra, así que **el `sub` cambia**. Si
  la clave de unicidad fuera `sub`, quien recupere su cuenta podría
  registrarse dos veces. Si la cédula viaja en el token, la clave sigue
  siendo `cedula_hash` y el problema no existe; si no, se acepta el límite y
  se declara en `/democracia/seguridad`.
- ❌ **Supabase Auth no acepta emisores OIDC genéricos.** Su «third-party
  auth» cubre solo Clerk, Firebase, Auth0, Cognito y WorkOS; el proveedor
  Keycloak exige cliente *confidencial* con `client_secret`, lo que rompería
  «sin secreto en el app». Conclusión: Cuenta Única **no sustituye** la sesión
  de Supabase; **se acopla encima** como verificación.
- ⚠️ `socratico.do` aún no resuelve en DNS (ENOTFOUND el 2026-09-02). La
  `redirect_uri` a registrar debe incluir `socratico.vercel.app` hasta que
  el dominio apunte.

### 9.2 Arquitectura propuesta — respeta §2 y §4 íntegros

```
Navegador (cliente público PKCE S256, sin secreto)
  1. Sesión Supabase por OTP de correo (v1, sin cambios).
  2. /democracia/registro → «Verificar con Cuenta Única»
     → auth.cuentaunica.gob.do/oauth2/auth
       (client_id público, redirect_uri registrada, code_challenge, nonce)
  3. Callback → /oauth2/token (auth `none`) → id_token RS256.
  4. supabase.functions.invoke('vincular-cuenta-unica', { id_token })
     con la sesión del votante.

Edge Function (vive dentro de Supabase, como el pepper)
  Verifica firma contra el JWKS, `iss`, `aud` = client_id, `exp`, `nonce`.
  sujeto = claim de cédula si existe; si no, `sub`.
  Llama democracia.vincular_identidad(uid, sujeto, origen)  [SECURITY DEFINER]
    → HMAC(sujeto, pepper) → votantes.sujeto_hash UNIQUE, origen = 'cuenta_unica'
```

Invariantes que se mantienen:
- **El app sigue con claves publicables.** Un `client_id` de OAuth es público
  por diseño; va con fallback literal como la `anon key`. Ni `client_secret`
  (no hace falta: auth `none`) ni clave de servicio en Vercel.
- **La verificación criptográfica y la clave de servicio viven en Supabase**,
  no en el app — el mismo principio que el pepper.
- **Minimización mejora:** si solo llega `sub`, Socrático **nunca ve la
  cédula**. Se guarda únicamente el HMAC con pepper del sujeto, jamás el
  `sub` ni la cédula en claro.
- RLS intacto; una persona = un voto por unicidad del hash.

Esquema (borrador; **no es migración** hasta que exista el cliente):
`votantes.origen text not null default 'declarada' check (origen in
('declarada','cuenta_unica'))`; `cedula_hash` pasa a llamarse
`sujeto_hash` (o se añade la columna); `agregados_publicos` suma
`verificados` para que la vista pueda decir cuántos votos vienen de
identidad verificada. UI: segundo camino en el registro y, en el widget,
«voto con identidad verificada» — sin escudo, sin sello, marco no oficial.

### 9.3 Qué hace falta del dueño, en orden

1. **Solicitar a la OGTIC un cliente OAuth2** para Socrático.do (§9.4). Sin
   él no se construye nada: no hay alta dinámica de clientes.
2. Aplicar la migración y desplegar la Edge Function (acciones de panel/CLI,
   fuera del alcance de una sesión).
3. Registrar las `redirect_uri` en el cliente:
   `https://socratico.do/democracia/cuenta-unica/callback` y la equivalente
   en `socratico.vercel.app` mientras el dominio no resuelva.

### 9.4 Borrador de solicitud a la OGTIC

> **Asunto:** Solicitud de cliente OAuth2 (OpenID Connect) de Cuenta Única
> para Socrático.do
>
> Socrático.do es una herramienta ciudadana independiente y no oficial que
> lee en vivo fuentes públicas del Estado (DGCP, SIGEF, Congreso, Consultoría
> Jurídica, Crédito Público) y corre un piloto de opinión ciudadana sobre las
> iniciativas legislativas. Queremos que cada voto provenga de una persona
> real y única **sin almacenar cédulas**: solo un HMAC del sujeto que entrega
> Cuenta Única.
>
> Solicitamos un cliente **público** (PKCE `S256`,
> `token_endpoint_auth_method: none`), `grant_types: authorization_code`,
> `response_types: code`, scope `openid`, con estas `redirect_uris`: […].
>
> Preguntas: (1) qué claims entrega el ID token o `/userinfo` a clientes
> externos (¿`preferred_username` es la cédula?); (2) si el `sub` se conserva
> tras una recuperación de cuenta.
>
> Compromisos: minimización de datos (Ley 172-13), dossier público de
> seguridad en `/democracia/seguridad`, marco no oficial visible en cada
> pantalla, código auditable.

### 9.5 Implementación (2026-09-02) — construida, inerte hasta que exista el cliente

El dueño decidió construir antes de tener el `client_id`. Todo queda apagado
mientras `NEXT_PUBLIC_CUENTA_UNICA_CLIENT_ID` esté vacío: la interfaz no
ofrece la vía, la ruta de canje responde 503 y la Edge Function 503.

| Pieza | Archivo | Qué hace |
|---|---|---|
| Cliente público | `app/democracia/cuenta-unica/cliente.ts` | Endpoints verificados (§9.1), `client_id` público, PKCE S256, `state` en `localStorage` (10 min, un solo uso); el `nonce` es el hash del id de sesión del votante |
| Canje | `app/democracia/cuenta-unica/token/route.ts` | `POST {code, code_verifier, redirect_uri}` → token endpoint (auth `none`) → devuelve **solo** `id_token`. Transporte, no confianza |
| Vuelta | `app/democracia/cuenta-unica/callback/` | Valida `state`, exige sesión de votante, canjea, invoca la Edge Function; cada fallo dice qué pasó |
| Frontera de confianza | `supabase/functions/vincular-cuenta-unica/index.ts` | Verifica firma RS256 (JWKS), `iss`, `aud` = client, `exp` y edad ≤ 15 min; `getUser` con el JWT del votante y exige `nonce` = hash de su id (un ID token robado no sirve con otra sesión); llama al RPC con la clave de servicio |
| Esquema | `supabase/migrations/20260902120000_democracia_cuenta_unica.sql` | USAGE del esquema al rol de servicio; cierra el oráculo de `hash_cedula` (v1 dejaba EXECUTE a PUBLIC); `votantes.origen` (`declarada`/`cuenta_unica`) y `verificado`; `hash_sujeto` (pepper + prefijo de espacio de nombres); RPC `vincular_identidad` concedido solo al rol de servicio; `agregados_publicos.verificados` |
| UI | `registro.tsx`, `seguridad/page.tsx`, `voto-widget.tsx` | «Verificar con Cuenta Única» con sesión abierta; estado «Identidad verificada»; totales con «N con identidad verificada» |

Decisiones tomadas al construir:
- **La clave sigue siendo `cedula_hash`.** Si el ID token trae un claim
  `cedula` (11 dígitos y Luhn), se hashea igual que en v1 y quien la declaró
  bien conserva su fila; si no, se hashea `'cuenta_unica:' || sub`. Un `sub`
  jamás colisiona con una cédula. Solo se lee `cedula`: qué claims llegan a
  un tercero no está verificado (§9.1) y un `preferred_username` de once
  dígitos podría no ser una cédula.
- **Colisión con una cédula declarada.** Si la cédula que Cuenta Única
  confirma ya la tecleó otra cuenta sin verificar, el RPC devuelve
  `cedula_declarada_en_uso` y no desplaza a nadie. **Decisión pendiente del
  dueño:** si una identidad verificada debe desplazar a la declaración sin
  verificar (borrando esa fila y sus votos). Hoy gana quien llegó primero,
  y la persona verificada recibe la explicación exacta.
- **La ruta de canje no tiene límite de tasa.** Solo acepta la
  `redirect_uri` de su propio origen, pero es un relé abierto hacia el
  endpoint de token de Cuenta Única; Hydra rechaza códigos inválidos y el
  coste es una petición. Si se abusa, el límite va en Vercel (WAF), no en
  memoria de una función.
- **Sin cliente no hay botón apagado**: la vía se omite. Un control que no
  puede llevar a ningún sitio no se enseña deshabilitado.
- La ruta de canje solo acepta la `redirect_uri` de su propio origen
  (`/democracia/cuenta-unica/callback`, HTTPS o localhost) y devuelve el
  código de error de OAuth, nunca el cuerpo del emisor.
- `supabase/config.toml` fija `verify_jwt = false` para la función (la sesión
  se verifica dentro) y el `project_id` de `Transac`, para que el despliegue
  no dependa de recordar una bandera.
- `tsconfig.json` excluye `supabase/functions` (Deno) del typecheck de Next.

Pasos del dueño, en orden (ninguno lo hace una sesión):
1. Solicitar el cliente a la OGTIC (§9.4) con `redirect_uris`
   `https://socratico.vercel.app/democracia/cuenta-unica/callback` y
   `https://socratico.do/democracia/cuenta-unica/callback`.
2. ✅ Aplicar la migración `20260902120000` al proyecto `Transac` — hecho el
   2026-09-26 a pedido del dueño (`apply_migration`, contenido idéntico al
   archivo). Antes: 3 votos, 1 votante, `hash_cedula` ejecutable por `anon`
   y `authenticated` —el oráculo del pepper estaba abierto por REST—, sin USAGE
   del rol de servicio. Después: los mismos 3 votos y 1 votante (`origen` =
   `declarada`), la vista con `verificados` = 0 y los totales intactos,
   `hash_cedula`, `hash_sujeto` y `vincular_identidad` negados a `anon` y
   `authenticated` (REST responde 401 `permission denied`),
   `vincular_identidad` solo para `service_role`, y USAGE del esquema para
   `service_role`. Los avisos de seguridad del proyecto no suman nada nuevo en
   `democracia` (sigue el `search_path` mutable de `cedula_valida`, previo).
3. Desplegar la función: `supabase functions deploy vincular-cuenta-unica`
   (con `supabase link` hecho; `config.toml` ya desactiva la verificación de
   JWT en la puerta de enlace porque la sesión se verifica dentro).
4. Fijar el secreto de función `CUENTA_UNICA_CLIENT_ID` (panel → Edge
   Functions → Secrets) con el UUID que emita la OGTIC.
5. Fijar en Vercel `NEXT_PUBLIC_CUENTA_UNICA_CLIENT_ID` con el mismo UUID y
   redesplegar. Ese es el interruptor: al existir, la vía aparece.
6. Probar de punta a punta con una Cuenta Única real y anotar aquí qué
   claims llegaron (resuelve el ⚠️ de §9.1); si la cédula viaja bajo otro
   nombre, ampliar `cedulaDe` en la función. Comprobaciones útiles en SQL:
   `select has_schema_privilege('service_role','democracia','usage');` y
   `select has_function_privilege('anon','democracia.hash_cedula(text)','execute');`
   (debe ser `false`).
