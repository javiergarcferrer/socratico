# Socrático — identidad «El Contrasello»

Fuente de verdad del diseño. Si algo en la interfaz contradice este documento,
la interfaz está mal. Los tokens viven en `app/globals.css`; aquí está el
**porqué** y las reglas que no se negocian.

## La idea

En el país del sello y la firma, un sello que no aprueba nada: pregunta.
La identidad toma el vernáculo del documento oficial dominicano —el papel, la
tinta, el sello, la firma— y lo pone del lado del ciudadano. **Nada imita lo
oficial; todo lo interroga.**

De ahí sale la prohibición central: **la credibilidad viene del papel, no del
brillo**. Esta plataforma no se parece a una app; se parece a un expediente
bien compuesto.

## Prohibiciones (esto es lo que se incumplió antes)

1. **Sin degradados.** Ni de fondo, ni de texto, ni manchas difuminadas
   (`blur-3xl`, `bg-gradient-*`). Un panel oscuro es tinta plana.
2. **Sin sombras de vidrio.** El papel no flota. Las superficies que se
   **leen** se separan con **filete** (`border-hairline`), no con `shadow-*`.
   `shadow-card` y `shadow-soft` quedan reservados a lo que de verdad se
   superpone: menús, hojas modales, el botón flotante. Lo que se **pulsa**
   lleva canto —papel más hondo, sin difuminar—, que no es una sombra de
   vidrio sino el borde de una hoja: §Relieve.
3. **Esquinas contenidas.** `rounded-lg` (8px) como máximo en superficies;
   `rounded-full` solo en puntos, sellos y avatares. Nada de `rounded-2xl`
   ni `rounded-3xl`: una tarjeta con esquinas de app rompe la metáfora.
4. **Sin emoji** y sin iconos decorativos. Los iconos son de trazo, 16/20/24.
5. **Sin escudo ni bandera.** Somos independientes; parecer oficial sería
   mentir.
6. **Sin blanco de pantalla.** Sobre tinta y sobre relleno saturado el texto es
   `canvas` —papel, cálido—, nunca `white`. La primitiva `Accion` ya lo había
   decidido; el árbol había derivado a 71 usos de blanco contra 19 de papel.
7. **Nada de píldoras.** `rounded-full` con relleno horizontal real (`px-2` o
   más) es una marca o un botón vestidos de app. Un sello no tiene esquinas
   redondas: la marca va `rounded-md`, el botón `rounded-lg`, la barra de
   progreso `rounded-sm`. El punto, el sello, el avatar y la burbuja de conteo
   (`px-1`) se quedan redondos.

## Color — papel, tinta, sello, firma

| Token | Valor | Oficio |
|---|---|---|
| `marca` | `#0B2D6B` | El azul de la marca: la cabecera y el ícono. Nada más. |
| `marca-acento` | `#FF5A5F` | El acento del logotipo sobre el azul de la marca. |
| `canvas` | `#F7F3EA` | Papel de oficio. El fondo de todo. |
| `surface` | `#FDFBF5` | La hoja sobre el papel: tarjetas y paneles. |
| `ink` | `#171D2E` | Tinta de imprenta. Texto y bandas oscuras. |
| `ink-soft` | `#555B6B` | Grafito: texto secundario, anotación al margen. |
| `hairline` | `#DED6C6` | La raya del folio. Separa **todo**. |
| `brand-*` | `#35519C` y escala | **La firma**: azul de bolígrafo. Todo lo accionable. |
| `sello-*` | `#A63A2A` y escala | **El sello**: la marca. Escaso por definición. |
| `alerta-*` | ocre | Advertencia, plazo, perención. |
| `valido-*` | verde archivo | Lo ya cumplido: promulgada, vigente, adjudicado. |
| `v-*` | tintas apagadas | Matiz por vertical. Solo orienta, nunca colorea contenido. |

**Por qué `brand` es la firma y no el sello:** el token de marca colorea
enlaces, botones y estados activos — cientos de apariciones. Si fuera rojo, el
sello estaría en todas partes y dejaría de pesar. *El sello aparece poco, y por
eso pesa.*

Dónde sí va el sello: el acento del logotipo, el punto de la «¿», la vertical de compras,
lo que **deroga**, y el punto del rótulo. En ningún otro sitio sin motivo.

## Tipografía — tres familias, tres oficios

- **Geist** (`font-display`) — *la pregunta*. Titulares de página (h1) y de
  sección grande, a 600 y con −0,025 em de interletra (la base de
  `app/globals.css` lo pone en `h1`, `h2` y `.font-display`; no hace falta
  repetir peso). Desde el 2026-09-28 (decisión del dueño): la serif de antes
  se leía floja y anticuada.
- **Public Sans** (`font-sans`) — *la explicación*. Cuerpo, interfaz,
  etiquetas, botones. La letra del estándar web de gobierno, puesta a servir
  al ciudadano.
- **IBM Plex Mono** (`font-mono`) — *el registro*. Montos, códigos,
  expedientes, fechas, porcentajes: todo lo que se copia y se verifica. Y la
  clase `.rotulo`: versalitas espaciadas que encabezan una sección, como el
  epígrafe de un formulario.

Regla de reparto: **si es una pregunta o un titular, Geist; si es un dato que
se verifica, mono; todo lo demás, Public Sans.** Un título de panel pequeño
(14px) es Public Sans en negrita, no `font-display`: a ese tamaño dos
grotescas juntas no se distinguen y el titular pierde su oficio.

**La marca no es un oficio:** Instrument Serif (`font-marca`) dibuja solo la
palabra «socrático» y la «s» del ícono. Nada más la usa.

## La marca — «socrático», el acento es el sello

`components/marca.tsx`. Desde el 2026-09-24 (decisión del dueño) la marca es
una sola palabra en minúscula, **sin «.do»**: el nombre es Socrático.

- `Logotipo` — «socrático» en Instrument Serif (`font-marca`); **el acento de la «á» es el
  sello**, un trazo inclinado en `marca-acento`. **La palabra vive solo sobre el
  azul `marca`** (decisión del dueño, 2026-09-25): la cabecera, la placa azul
  del pie, la tarjeta para compartir. Nunca sobre blanco ni sobre papel; sobre
  papel la marca es la placa del ícono.
- `SelloCompacto` — la «s» con el mismo acento en una placa (SVG): en el
  favicon (`app/icon.svg`) y el ícono de la app, placa azul `marca` con el
  acento en `marca-acento`. **No va en la cabecera** (decisión del dueño,
  2026-09-28): ahí la marca es la palabra sola, a 26–30 px, y en pantallas
  anchas la acompaña «Pregúntale al Estado» en el registro mono.
- `Sello` — la circular con «¿» al centro y el aro «SOCRÁTICO · PREGÚNTALE AL
  ESTADO · REPÚBLICA DOMINICANA». Es el sello de firma (pie de página, tarjeta
  social), no el logotipo. Nunca por debajo de 72 px con aro. Sobre azul, trazo `papel` y el punto
  de la «¿» en `marca-acento`.

**La marca roja es el sello.** El acento del logotipo y del ícono, el punto de
la «¿» y el punto del rótulo van en rojo. Es la regla única y no admite
excepción. Lo patrio está en la paleta —azul de firma, rojo de sello, papel—, nunca
en la bandera ni el escudo: la herramienta es independiente y no oficial.

## Relieve — lo que se toca tiene canto

Desde el 2026-09-25 (decisión del dueño) la profundidad existe, y **es
semántica**: dice qué se puede hacer con cada cosa. Hay cuatro estados y
ninguno es decorativo.

| Estrato | Qué dice | Cómo se ve | Dónde |
|---|---|---|---|
| **Plano** | Se lee | Papel y filete. Sin sombra, sin fibra. | Todo el contenido: tarjetas informativas, tablas, textos. |
| **Relieve** | Se pulsa | Fibra de papel (`--grano`), luz de 1 px arriba y **canto** de 2 px abajo, sin difuminar. Al apuntar sube 1 px y el canto crece; al pulsar baja 2 px y el canto desaparece. | `Button` con caja (principal, secundario, filete, sello), la tarjeta que es un enlace. |
| **Hundido** | Está puesto | Sin canto, sombra por dentro. | El filtro que es la página actual (`aria-current`), «Siguiendo» (`aria-pressed`), la opción elegida de un conmutador, la bandeja del conmutador. |
| **Capa** | Se superpone | `shadow-pop`. | Menús, hojas, diálogos. |

**La cabecera es la tapa del expediente** (decisión del dueño, 2026-09-28):
azul `marca` con la fibra en papel (`--grano-claro`), luz de 1 px arriba y
canto duro de 2 px en `marca-canto`. Es la única superficie que lleva fibra
sin pulsarse, porque es la marca y no contenido. Al desplazarse se asienta
—la palabra al 88 %, el canto a 3 px— atada al desplazamiento, sin cambiar
de altura; sus puertas dibujan la raya de papel al apuntarlas (`.cabecera`,
`.cabecera-puerta` en `app/globals.css`).

La fila de una lista no tiene canto —la lista ya es una hoja—: se tiñe de
firma al apuntarla y se **hunde** al pulsarla.

Tres reglas que lo sostienen:

1. **El borde inferior no se mueve.** El relieve sube y baja dentro de su
   canto, así que nada de alrededor salta ni cambia de sitio.
2. **La semántica sale del marcado, no de una clase que haya que recordar.**
   El enlace que se estira sobre su hoja o su fila lleva `estira`
   (`app/globals.css`); con eso, el contenedor `relative` que lo recibe toma
   solo el relieve si es una `Card` o la respuesta de fila si no lo es. Una
   `Card` que es un `<a>` lo toma también. El foco dibuja el anillo alrededor
   del objetivo entero, no del renglón de texto.
3. **El estado no se dice solo con color.** Hundido contra en relieve se ve
   con el sol de frente y lo ve quien no distingue la firma del sello.

`--canto` y `--luz` se redefinen en un relleno saturado (la firma, el sello):
el canto es el mismo tono más hondo. La fibra es ruido fractal teñido de tinta
al 6 %, una tesela de 180 px que el navegador rasteriza una vez.

## Movimiento — el movimiento explica causa, nunca adorna

Los tokens viven en `app/globals.css`: cuatro curvas en `@theme` (Tailwind
genera `ease-firma`, `ease-sello`…) y cinco duraciones en `:root`.

| Curva | Oficio |
|---|---|
| `firma` | Un cambio en su sitio: color, relieve, estado. Es la de toda transición que no diga otra. |
| `sello` | Algo llega: frena al final, como el papel que se apoya. Capas, hojas, pliegues, barras. |
| `salida` | Algo se va: acelera y desaparece sin pedir atención. |
| `estampa` | El único rebote de la casa: el sello que cae cuando el lector **confirma algo suyo** (seguir una pieza). Nunca en otra cosa. |

| Duración | Valor | Para |
|---|---|---|
| `--dur-toque` | 90 ms | La respuesta al dedo. Por debajo de 100 ms causa y efecto se leen como una sola cosa. |
| `--dur-breve` | 150 ms | Color, relieve al apuntar, menús que abren. |
| `--dur-media` | 220 ms | Pliegues, velos, lo que sale de una hoja. |
| `--dur-hoja` | 280 ms | Una hoja entera que entra; la estampa. Techo de la interfaz. |
| `--dur-trazo` | 700 ms | Solo dibujar una barra de datos, que se lee cuando termina. |

Reglas:

1. **Solo se mueve lo que el lector movió** o lo que responde a él. Nada entra
   animado al cargar una página: el contenido está quieto porque se lee.
2. **Lo que sale va más rápido que lo que entra.** La atención ya está en lo
   siguiente.
3. **Las cifras no se animan.** Un número que cuenta hacia arriba es un número
   falso durante medio segundo, y alguien le hace captura. Las barras sí se
   dibujan —su final es el dato— y, donde el navegador sabe atarlas al
   desplazamiento (`animation-timeline: view()`), se dibujan al entrar en
   pantalla; la que ya está a la vista al llegar se pinta entera, quieta. Donde
   el navegador no sabe, se pintan quietas: nada de caer a una animación al
   cargar (`--dur-trazo` queda para un dibujo que el lector provoque).
4. **Movimiento reducido apaga el desplazamiento, no el significado.** Con
   `prefers-reduced-motion` no hay traslación ni animación, pero el relieve
   sigue cambiando —al instante— entre en reposo, apuntado y hundido.
5. **Nada se escribe a mano.** Una curva `cubic-bezier` en un componente, un
   `animate-bounce` o una duración por encima de 300 ms los rechaza el gate.

Lo nativo antes que la librería: `interpolate-size` y `animation-timeline`
donde el navegador los tiene, la altura que mide Radix para los pliegues, y
ninguna dependencia de animación.

## Gráficos — el sistema

Desde el 2026-09-26 (G3 de `docs/PLAN-ACCESO.md` §6 ter) todo gráfico se compone
con las primitivas de `components/graficos/`; ninguno se dibuja a mano en una
página. El método es el de la habilidad `dataviz` (forma → color → validar →
marcas → capa de lectura → accesibilidad → mirarlo), con los parámetros de esta
casa. **No hay modo oscuro**: la identidad es papel, así que cada paleta se
validó solo en claro, contra `canvas` (#F7F3EA) y `surface` (#FDFBF5).

### Qué forma para qué pregunta

| La pregunta del lector | La primitiva | Color |
|---|---|---|
| ¿Quién/qué tiene más? (ranking con nombre) | `BarrasHorizontales` (o `FilaBarra` en una lista que se pliega; `MarcaBarra` dentro de una fila compuesta) | una serie: la firma |
| ¿Cómo cambió un **flujo** (lo contratado, lo emitido) año a año? | `SerieTemporal forma="columnas"` | la firma |
| ¿Cómo cambió un **saldo o una tasa** (la deuda, la inflación, la matrícula)? | `SerieTemporal forma="linea"` | la firma, área al 10 % |
| Pocos períodos, cada uno con su cifra escrita (los meses de un año) | `BarrasHorizontales forma="periodo"`, en orden de calendario | la firma |
| ¿Cómo se reparte un todo? (estados, votos) | `BarraApilada` | estados de `lib/estados.ts` o la divergente |
| ¿Cuándo pasa en el año? (temporada) | `MatrizMensual` | secuencial |
| La misma medida partida por una faceta | `Multiples` + `maximoComun` | una serie por panel |
| Una proporción contra un límite (ejecución, avance, puntuación) | **no es un gráfico**: `Progress`, el medidor | el oficio del dato |
| Un solo número | **no es un gráfico**: `Cifra` con su ancla | — |

### Las paletas y lo que dijo el validador

Tokens en `app/globals.css` (`--color-grafico-*`); clases literales en
`components/graficos/paleta.ts`. Salida de
`node …/dataviz/scripts/validate_palette.js … --mode light --surface "#f7f3ea"`
(idéntica contra `#fdfbf5`):

- **Categórica** — orden fijo, nunca ciclado; una serie sola es la 1.
  `#35519C` firma · `#A0446E` ciruela · `#B97F2B` ocre · `#018E7D` verde azulado ·
  `#6F59A6` violeta. Los tres pasos nuevos salen de los matices de
  `v-finanzas`, `alerta` y `v-nomina`/`v-normativa`, subidos a la banda: los
  tintes de vertical tal cual **no pasaban** (`v-normativa` L 0.40 y C 0.08,
  `v-nomina` C 0.07, `valido-500` C 0.08), y el ocre de estado (`alerta-500`)
  se dejó fuera a propósito para que una serie no se haga pasar por un aviso.
  El sello no entra: es escaso por definición.
  ```
  [PASS] Lightness band      all 5 inside L 0.43–0.77
  [PASS] Chroma floor        all 5 >= 0.1
  [PASS] CVD separation      worst adjacent #a0446e↔#35519c ΔE 8.7 (protan) · tritan 12.7
  [PASS] Normal-vision floor worst adjacent #a0446e↔#35519c ΔE 19.0 (normal)
  [PASS] Contrast vs surface all 5 >= 3:1
  ```
  Con `--pairs all` (paneles, dispersión) pasan **las tres primeras**
  (ΔE 8.7 / 19.0). El orden salió de enumerar las 24 permutaciones: la de mejor
  vecindad (firma, verde azulado, violeta, ocre, ciruela: 11.9 / 19.8) fallaba
  el todos-contra-todos en sus tres primeras (firma ↔ violeta, ΔE 4.6), así que
  se eligió la que pasa las dos pruebas. Una sexta serie se pliega en «Otros»
  (`grafico-otros`, grafito) o se parte en paneles; nunca se genera un color.
- **Secuencial** — la firma de claro a oscuro: `brand-100, 200, 300, 400, 500,
  700`. Monótona y de un matiz (5°), saltos ≥ 0.06. El paso 1 no llega a 2:1
  (1.18:1) **a propósito**: en una escala continua es «casi cero» y puede
  fundirse con el papel. Como escala ordinal (tramos) se usan del 3 al 6, que
  pasan: `--ordinal` → ALL CHECKS PASS, extremo claro 2.36:1.
- **Divergente** — firma ↔ sello con el gris del papel (`canto`) en medio:
  `brand-500 · brand-300 · canto · sello-300 · sello-700`. Los polos a la misma
  luz (L 0.45 los dos: firma 500 y sello **700**, no 600) para que ninguno pese
  más — dirección no es valencia. Polos: PASS en todo (ΔE CVD 19.3, normal
  22.7). Cada brazo tenue → pleno: `--ordinal` PASS. El neutro falla banda y
  croma y queda a 1.76:1 **por diseño** (tiene que leerse «nada»); por eso la
  barra divergente lleva siempre sus cifras escritas al lado.
- **Estado** — no hay paleta nueva: son los puntos de `lib/estados.ts`. Lo único
  que añade el sistema es el orden en que se apilan, `ORDEN_TONOS` (contexto,
  aviso, anulado, accionable, cumplido): vecinos a ΔE CVD 12.3 y normal 17.2.
  En el orden del trámite la firma quedaba junto al grafito a ΔE 10.1, bajo el
  suelo de 15. El validador marca FAIL de croma en `contexto` (grafito, C 0.03)
  y `cumplido` (`valido-500`, C 0.08): el grafito es gris porque «no afirma
  nada»; el verde de archivo es apagado por identidad. Se deja así y se
  compensa como manda la habilidad para el estado: **nunca solo el color**, la
  leyenda escribe cada estado con su cifra. Subir el croma de `valido-500`
  cambiaría el verde de toda la plataforma y es decisión del dueño.

### Las reglas

1. **Un solo eje.** Dos medidas de escala distinta son dos gráficos o un índice
   común; nunca una segunda escala. La nómina tenía una serie de plazas contra
   gasto con dos escalas: se retiró.
2. **El color sigue a la entidad, no a su puesto.** Una sola serie es la firma
   en todas las barras; nunca más oscura la más grande. Los tintes de vertical
   (`v-*`) ya no pintan barras: orientan, no colorean contenido.
3. **La escala se escribe.** La serie rotula su máximo sobre su filete y su base
   es cero; un ranking escribe cada cifra en su fila; la matriz lleva su escala.
4. **Capa de lectura al apuntar o tocar**, con guía vertical que busca el punto
   más cercano y recorrido con flechas (`LecturaSerie`, la única parte de
   cliente). Enriquece, nunca esconde: todo valor está también escrito o en
   la tabla.
5. **Tabla equivalente o leyenda, nunca color solo.** `VerComoTabla` (el botón
   dice cuántas filas) o la tabla plegable propia de la tarjeta; con dos series
   o más, `Leyenda`, con el texto en tinta y la muestra al lado.
6. **Cada marca lleva a su nodo.** `href` por dato en todas las primitivas: la
   fila entera de un ranking (`estira`), la columna de una serie (clic; al
   tocar, la lectura trae un enlace de 44 px), la celda de la matriz, la
   entrada de la leyenda de una barra apilada.
7. **Marcas finas**: barra de 8 px (columna ≤ 24 px) con 4 px de esquina en el
   extremo del dato y cuadrada en la base, línea de 2 px, punto final de 8 px
   con anillo de papel, 2 px de papel entre segmentos, rejilla y base en
   filete macizo — nunca discontinuo.
8. **Nada se anima al cargar.** Las barras y columnas se dibujan al entrar en
   pantalla solo donde el navegador lo ata al desplazamiento; donde no, se
   pintan quietas (antes caían a 700 ms al cargar). Las cifras no cuentan.
9. **Cifras por `lib/format.ts`**: `formatPesos`, `formatMagnitud`,
   `formatMonto`, `formatFecha`; el mobiliario usa `formatearValor` sobre
   ellas. Nunca «MM» ni «K».

### Lo que la habilidad prohíbe y aquí ya pasó

- **Doble eje** — la serie de plazas contra gasto de `components/nomina/charts.tsx`
  (retirada; nadie la importaba).
- **Un medidor haciendo de ranking** — veinte `Progress` con carril al 100 %
  midiendo «contra el mayor»: el carril mentía la escala. Ahora son
  `BarrasHorizontales`; `Progress` queda para lo que es un medidor.
- **Color por panel** — dos rankings gemelos en `brand-500` y `brand-400`
  (`/contratos`), el tinte de cada vertical en las barras: el color no decía
  nada que el título no dijera.
- **Neutro invisible** — la abstención de una votación en `hairline` (1.3:1):
  el neutro divergente es `canto`.

## La voz

1. **Pregunta, no acusa.** Los titulares son preguntas; los datos responden.
   La conclusión la saca el lector. La pregunta vive en los titulares de
   página, no en la cabecera: desde el 2026-09-23 (decisión del dueño) la
   cabecera es un megamenú de sustantivos —Dinero público, Leyes, El Estado—
   donde cada destino lleva debajo una línea que dice qué hay (`lib/menu.ts`).
2. **Cita la fuente o no lo dice.** Cada cifra lleva origen y fecha. Lo que la
   fuente niega, se declara negado.
3. **Español llano primero.** «Perimió» se explica antes de usarse.
4. **El documento entero, siempre.** Nada se resume sin dejar el original al
   lado. Leer es el derecho; explicar es la ayuda.

## Ergonomía cognitiva

> La lente, prestada de la doctrina de UI de RosetSoft
> (`docs/engineering-lenses.md` §2): **¿qué tiene que sostener el lector en la
> cabeza que la aplicación podría haber sostenido por él?**
>
> El ciudadano no estudia esta plataforma: la *consulta*, en el teléfono, entre
> otras dos cosas. Cada unidad de memoria de trabajo que le gastamos es una que
> no tiene para lo que vino a hacer.

Cuando ciudadano y periodista quieren cosas opuestas, **manda el ciudadano**:
por defecto se muestra poco y explicado, y la densidad se despliega bajo
demanda. El periodista pierde dos toques; el ciudadano no se pierde.

### 1. Un número solo no significa nada; una comparación sí — y no puedes inventarla

«RD$1,986,088,830» es una cadena. «RD$1,986,088,830 en juego en 384 procesos
abiertos hoy» es un hecho sobre el que alguien puede actuar. La segunda mitad
de la regla pesa más que la primera: **si no tenemos el ancla, se muestra la
cifra sin ella y se dice por qué. Nunca se fabrica un contexto.**

`lib/cifras.ts` lo implementa y prohíbe los tres errores clásicos: crecer desde
cero no es un porcentaje (no hay `+∞ %` ni `+100 %`), la variación de un
porcentaje se mide en **puntos** y no en por ciento, y la dirección no es
valencia — que la deuda suba no es «bueno» porque el número creció.

### 2. Una lectura está acotada o está paginada, nunca ninguna de las dos — y una lectura truncada lo declara

Media plataforma lee por barrido: 6 páginas de la DGCP, 10 del SIL, el último
mes de cada nómina. Esas cifras **no pueden ser el denominador de nada**, y
mezclarlas con censos en la misma fila de tarjetas invita a dividir una por
otra. Cada cifra declara su base junto a la cifra, no en una nota al pie que
nadie asocia tres pantallas después. `Alcance` en `lib/cifras.ts` distingue
registro, muestra e instantánea.

### 3. Reconocer, no recordar

- **La jerga se traduce en el punto de uso**, no en un glosario que nadie abre.
  Primero lo que el término hace, después cómo se llama: «se archiva si no
  avanza», y *perime* detrás. `lib/glosario.ts`.
- **El estado del sistema se ve**, incluidos los filtros que vienen de fábrica.
  Un chip que solo aparece cuando difiere del valor por defecto deja invisibles
  justo los que más recortan: quien busca y ve «0 coincidencias» nunca se
  entera de que estaba mirando treinta días.
- **La magnitud viaja con el número.** «MM» se lee *millones* en el uso
  dominicano: abreviar así miles de millones se equivoca por tres órdenes de
  magnitud en la cifra más grande del sitio.
- **La antigüedad se calcula aquí, no en la cabeza del lector.** Una fecha
  absoluta obliga a restar; en una lista de veinte, nadie resta y se deja de
  comparar. `hace()` en `lib/format.ts`, y **siempre a través de
  `components/antiguedad.tsx`**: la regla existía y se cumplía solo en las
  fichas —donde hay una fecha y sobra espacio para pensarla—, mientras las
  filas de listado, que son justo donde se compara, imprimían «Creada 3 sept
  2026» veinte veces seguidas. Nada se pierde: la fecha exacta viaja en el
  `title` y en el `dateTime` de un `<time>` de verdad.

  Se cuenta en **días de calendario dominicano**, la misma regla de
  `formatFecha`: «ayer» es la fecha de ayer en Santo Domingo, no «entre 24 y 48
  horas atrás». Con el ancla anterior al mediodía UTC, una pieza depositada hoy
  salía como fecha futura durante media mañana de cada día.

### 4. El orden de los bloques es el orden en que se entiende

Qué es → en qué punto está → qué cambia del ordenamiento → el texto → opinar.
**Nadie debería opinar sobre una pieza que la interfaz no le dejó entender**, y
por eso el widget de voto va después del documento, nunca antes.

Corolario: **el agregado no se enseña antes de preguntar.** «68 % a favor»
visible antes de votar ancla la respuesta —el efecto mejor documentado en
votación pública— en una plataforma cuya voz dice que la conclusión la saca el
lector.

### 5. Revelación progresiva

Un historial de 33 trámites en bruto no informa: entierra el único que importa
bajo treinta y dos rutinarios. Se muestra el resumen que responde la pregunta y
el resto queda a un toque, sin perder nada. El botón dice **cuántos hay**, no
«ver más»: quien decide si abre necesita saber a qué se enfrenta.
`components/plegable.tsx`.

### 6. Un control apagado explica por qué antes de que lo pulses

Y «no hay resultados» y «la fuente no contestó» son dos pantallas distintas: la
segunda dice qué pasó, qué sigue en pie y ofrece la única acción útil.

### 7. Las etiquetas cambian de forma según cuánto tiempo tiene el ojo

- **Nav global (escritorio)** — preguntas. Hay espacio y el usuario está
  eligiendo a dónde ir: la pregunta informa más que el sustantivo.
- **Barra de sección y tab bar móvil** — sustantivos cortos. Ahí ya sabe dónde
  está y necesita reconocer, no leer.
- **Un color = un significado**, en toda la plataforma. Nunca se usa un color
  porque «queda bien». La tabla vive **una sola vez**, en `lib/estados.ts`, y
  sus tonos se nombran por lo que significan —`accionable`, `contexto`,
  `cumplido`, `aviso`, `anulado`—, nunca por el estado concreto de una fuente:
  cada fuente **traduce** su vocabulario a esos cinco.

  Que estuviera centralizada no bastó. `iniciativa-card.tsx` mantenía una
  segunda tabla, con un comentario que la declaraba «alineada con
  lib/estados.ts», y estaba **invertida** en los dos colores que más pesan: el
  verde de archivo —*ya se cumplió*— marcaba una pieza recién **depositada**, y
  el azul de la firma —*se puede actuar*— marcaba una ley ya **promulgada**. A
  dos clics de distancia el mismo verde decía «terminado» y «acaba de
  empezar», y un listado del Senado entero en verde se leía como un archivo
  cerrado. La lección no es «centralizar»: es que **un comentario que afirma
  una alineación no la produce**, y que una segunda tabla es la forma concreta
  en que esta regla se rompe.

### 8. El teléfono es la pantalla, no una adaptación

«El ciudadano no estudia esta plataforma: la *consulta*, en el teléfono, entre
otras dos cosas.» Eso obliga a cosas concretas, y todas están ya en las
primitivas: lo que sigue se hereda, no se repite en cada página.

- **44 px es la medida de lo que se pulsa** en teléfono —la que recomiendan las
  guías de iOS y Android—, y 40 desde `sm`, donde hay puntero. Botón, campo,
  selector, opción y pestaña llevan los mismos saltos, así que un botón junto a
  un campo se alinea solo. Un control de 36 px solo es legítimo dentro de una
  fila, y entonces necesita 8 px de aire alrededor.
- **Un campo se escribe a 16 px.** Por debajo, Safari en iOS hace zoom al
  enfocarlo y la página se queda desplazada al soltarlo.
- **Prefiere la fila entera al enlace de tres palabras.** Una tarjeta o una fila
  de listado que lleva a un solo sitio se estira con un `::after`: el objetivo
  pasa de 320 × 20 px a la hoja completa. Lo que quede dentro y sea otro
  destino se eleva con `z-10`.
- **Un dedo no tiene `hover`.** La respuesta al toque es el `active`; el `hover`
  es un refuerzo para quien tiene puntero y nunca la única señal.
- **El texto esencial no baja de 12 px**, y la lectura principal va a 15.
  El único texto más pequeño de la casa es el `.rotulo`, que va en versalitas
  espaciadas para compensarlo.
- **Nada se lee en una tabla ancha**: por debajo de `sm` un cuadro de datos se
  apila en fichas y vuelve a ser cuadro desde `sm`.
- **Un enlace dentro de una frase es la excepción** y se queda a la altura de su
  línea: darle altura de mando rompería el párrafo.
- **Lo que flota se reparte el borde inferior.** Tab bar, barra de acciones de
  una ficha y aviso de instalación se pisaban entre sí; ahora la barra marca
  la raíz con `data-barra-acciones` y el aviso sube por encima. Cualquier
  pieza nueva que flote abajo se suma a ese reparto, no se inventa el suyo.
  El botón de volver arriba aparece tras tres pantallas. Desde `lg` flota
  siempre en la esquina. En el teléfono, en las cuatro raíces de la tab bar
  no se pinta —tapaba los títulos de las tarjetas— y sube al principio tocar
  la pestaña encendida; en cualquier otra ruta (fichas, vistas internas,
  páginas de «Más») ninguna pestaña es la página actual, así que el botón
  vuelve, por encima de la tab bar y de la barra de acciones si la hay.
- **El chrome fijo no pasa de un quinto de la pantalla.** Cabecera, barra de
  filtros y tab bar llegaron a sumar el 28 % a 390 × 844. Una barra pegajosa
  de página es una fila de 48 px, se aparta al bajar y vuelve al subir (sin
  animar con movimiento reducido).
- **La cabecera busca siempre lo mismo.** «Buscar» abre la paleta en todas
  las páginas; la búsqueda con alcance de una vertical vive dentro de su
  página, con el alcance escrito debajo. Un mismo sitio del chrome que busca
  cosas distintas según la página es una trampa.
- **Una silueta de carga miente si no mide lo que va a llegar.** Se calibra con
  la altura real medida a 390 px, donde ninguna pregunta de esta plataforma cabe
  en un solo renglón.

### 9. Dónde vive el sistema

Desde la pasada de **shadcn/ui**, en dos capas:

- **`components/ui/*`** — las piezas genéricas: `Card`, `Button`, `Badge`,
  `Input`, `Textarea`, `Label`, `Checkbox`, `Select`, `Tabs`, `ToggleGroup`,
  `Drawer`, `Dialog`, `Command`, `Breadcrumb`, `Popover`, `Collapsible`,
  `Table`, `Progress`, `Skeleton` y `Alert`.
  Es código del repositorio —no una dependencia de componentes—, con Radix por
  debajo. **Entraron por el teclado y el foco, no por el aspecto**: foco
  atrapado en una hoja modal, recorrido con flechas, Escape, y el foco de vuelta
  al disparador al cerrar.

  Están **las que se usan y solo esas**. Una pieza que nadie importa no es
  neutral: invita a usarla donde ya manda una regla de la casa —un `Accordion`
  donde `Plegable` obliga a decir cuántos hay—. La siguiente se copia de
  ui.shadcn.com cuando haga falta, y se viste con los tokens de aquí.

  Sus colores son los de esta página: el puente de tokens al final de `@theme`
  en `app/globals.css` ata el vocabulario de shadcn al de aquí —`background` es
  `canvas`, `primary` es la firma, `destructive` es el sello, `border` es el
  filete—. **No hay una segunda paleta**; hay los mismos hexadecimales con los
  nombres que espera la librería. Un color nuevo se añade arriba, en los tokens,
  y baja solo.

- **Lo que ninguna librería puede traer**, porque es doctrina y no aspecto:
  `components/papel.tsx` (`Rotulo`, `Cifra`, `TiraDeCifras`),
  `components/portada.tsx`, `components/estado-vacio.tsx`,
  `components/marca-estado.tsx`, `components/campo-busqueda.tsx`,
  `components/nav-filtros.tsx`, `components/marca.tsx`,
  `components/plegable.tsx`, `components/antiguedad.tsx`,
  `components/paleta.tsx`, `components/ruta.tsx`, `components/paginador.tsx`,
  `components/esqueleto.tsx`, `components/graficos/*` (§Gráficos),
  `lib/estados.ts`, `lib/cifras.ts`,
  `lib/glosario.ts` y `components/termino.tsx` —el término del Estado
  subrayado con puntos que, al tocarlo, abre su definición llana en un
  `Popover`; es la forma de cumplir «la jerga se traduce en el punto de uso»
  (§3), y hereda el color de su frase para vivir igual sobre tinta que sobre
  papel—.

`Hoja`, `CabeceraHoja`, `Marca` y `Accion` **ya no existen**: son `Card`,
`CardHeader`, `Badge` y `Button`. No se envolvieron con su nombre viejo a
propósito — dos nombres para una misma cosa es la «segunda tabla» que
`lib/estados.ts` documenta como la forma concreta en que un sistema se rompe.

### 10. Cómo se sostiene esto

> «Un rojo aquí es un problema de enrutamiento, no de regla. Subir un piso,
> ampliar una lista de excepciones o relajar un emparejador **registra** el
> hallazgo en vez de arreglarlo.» — RosetSoft, `design-system.md` §14

Las jugadas legales son tres: usar la primitiva, añadir el token, o extraer el
hermano. Y la causa raíz de que esta identidad se diluyera dos veces está
diagnosticada en la misma doctrina: **donde existe una primitiva compartida la
adopción es alta; donde no existe, la idea se reimplementa en cada sitio.** La
pasada de shadcn/ui lo confirmó midiéndolo: `papel.tsx` existía y lo importaban
**dos** archivos, mientras el resto del árbol dibujaba a mano cuatro campos de
búsqueda con tres alturas, seis pantallas de «la fuente no contestó», dos marcas
de estado sobre la misma tabla de colores y siete portadas con dos tamaños de
titular. Por eso el sistema vive en las dos capas de §9 y no en cuarenta
archivos que hay que acertar uno por uno.

Y por eso una pieza nueva se añade **donde ya está su familia**: si es genérica,
a `components/ui/`; si lleva una regla de esta casa, a `components/` con su
porqué en la cabecera. Un componente suelto en una página es la primera línea de
la próxima dilución.

Y porque una regla que solo vive en un documento se vuelve a diluir, tres
clases de infracción que esta pasada encontró a mano las busca ahora el gate
(`.claude/hooks/lib.sh` y `.claude/hooks/sin-efecto.py`): el blanco de
pantalla, la píldora, y el **control mudo** —un `hover:` cuyo valor repite el
que el elemento ya tiene, o un color de anillo sin ancho de anillo, de modo que
el anillo no se pinta nunca—. El tercero no es cuestión de estilo: el control
*parece* interactivo y no responde, que es «un control apagado explica por qué»
fallando en silencio. Uno de los tres era la llamada a la acción principal del
panorama.

### 11. Heurísticas ergonómicas — y dónde se cumplen

Una heurística que no apunta a un sitio del código es un deseo. Cada una de
estas tiene dueño:

| Heurística | La regla aquí | Dónde vive |
|---|---|---|
| **Fitts** — el objetivo grande y cerca se acierta antes | 44 px en teléfono; la fila entera es el enlace; lo principal abajo, donde llega el pulgar. | `Button`, `estira`, tab bar, `data-barra-acciones` |
| **Hick** — más opciones, más tiempo para elegir | Tres puertas en el menú, seis tareas en la paleta; la densidad se despliega bajo demanda. | `lib/menu.ts`, `lib/tareas.ts`, `Plegable` |
| **Doherty** — por debajo de 400 ms el diálogo no se rompe | Respuesta al toque en 90 ms; ninguna transición pasa de 280 ms; una silueta medida mientras la fuente contesta. | `--dur-*`, `components/esqueleto.tsx` |
| **Affordance** — la forma dice qué se hace | Plano se lee, relieve se pulsa, hundido está puesto. | §Relieve |
| **Miller** — la memoria de trabajo es corta | La magnitud viaja con el número; la antigüedad se calcula aquí; el ancla va junto a la cifra. | `lib/cifras.ts`, `Antiguedad` |
| **Reconocer, no recordar** (Nielsen) | La jerga se traduce en el punto de uso; los filtros de fábrica se ven. | `Termino`, `nav-filtros` |
| **Postel** — tolerante en lo que se acepta | Un RNC, una cédula o una cita «Ley 47-20» en cualquier forma lleva a su sitio. | `/buscar`, `lib/buscar.ts` |
| **Tesler** — la complejidad no desaparece, alguien la carga | La carga la plataforma: el cruce de instituciones, el cálculo de variaciones, el alcance de cada búsqueda. | `lib/instituciones.ts`, `BUSQUEDAS` |
| **Von Restorff** — lo distinto se recuerda | Un solo rojo por pieza; el sello escaso. | §Color, §La marca |
| **Zeigarnik** — lo pendiente pide volver | «Qué cambió desde tu última visita» en lo que sigues. | `/seguimiento`, `lib/seguimiento.ts` |
| **Jakob** — el lector trae hábitos de otros sitios | ⌘K y «/» buscan; Escape cierra; el foco vuelve al disparador. | `components/paleta.tsx`, `components/ui/*` |
| **Proximidad** (Gestalt) | La fuente y la fecha junto a la cifra, no en una nota al pie. | `Rotulo`, `Cifra` |

### 12. El índice: dos ejes, un solo sitio

Toda la plataforma se ordena en dos ejes, y los dos salen de un solo archivo:

- **Tema** — de qué trata: el dinero, las leyes, el Estado, y dentro sus
  columnas. Es como se **explora**: el megamenú y la hoja «Más».
- **Tarea** — qué viene a hacer el lector: *ver qué pasa ahora*, *encontrar a
  alguien*, *medir y comparar*, *leer lo decidido*, *seguir y opinar*,
  *entender cómo funciona*. Es como se **llega con prisa**: la paleta agrupa
  por tarea, y teclear «votar» o «comparar» encuentra aunque no sea el nombre
  de nada.

Cada enlace de `lib/menu.ts` declara su tarea (el tipo la exige);
`lib/indice.ts` deriva de ahí el índice que leen la paleta y el mapa del sitio.
Había tres listas de destinos y no coincidían —la paleta no conocía «El país
en cifras» ni «Cortes de luz»—, que es la «segunda tabla» de §7. Una página
nueva entra en el menú con su tarea o en `FUERA_DEL_INDICE` con su motivo; si
no, el gate la rechaza como huérfana.
