# Superintendencia de Bancos · que su cortafuegos admita la lectura identificada

- **Para:** Superintendencia de Bancos de la República Dominicana (SB), Dirección de Tecnología de la Información (o el área que administra sb.gob.do).
- **Vía:** canal propio de la SB: su área de tecnología o el contacto que publique su portal (confirmarlo antes de enviar).
- **Fundamento:** cooperación técnica. No es una solicitud de la Ley 200-04 y no corre plazo legal. Si la SB prefiere la descarga abierta, se puede pedir luego por esa ley.
- **Estado:** borrador, sin enviar. Hay además un aviso de seguridad para la SB, que va aparte y no vive en este repositorio.

---

«[Fecha]»

Señores
Superintendencia de Bancos de la República Dominicana
Dirección de Tecnología de la Información

Asunto: lectura identificada de las fichas públicas de entidades supervisadas

Distinguidos señores:

Le escribe «[Nombre completo]», responsable de Socrático.do (https://socratico.vercel.app), una plataforma gratuita, independiente y no oficial que reúne los datos abiertos del Estado dominicano y dice, junto a cada cifra, de dónde sale y de qué fecha es. Es una plataforma para todos, no contra nadie. Su sección de bancos y financieras muestra, con la fuente y la fecha de cada dato, lo que la Superintendencia publica en sus fichas de entidades supervisadas.

Qué pasó. El 29 de septiembre de 2026, leyendo esas páginas públicas a una petición por segundo, su cortafuegos (Sucuri) respondió después de unas 70 con su desafío de JavaScript (HTTP 307, «You are being redirected…»). La plataforma no resuelve ni rodea esos desafíos. Reconozco que, tras el primero, nuestro programa hizo dos reintentos espaciados; no debió hacerlo y ya no ocurre: ahora espera diez segundos entre peticiones y se detiene en el primer desafío. Por eso quedaron sin leer las entidades cambiarias, las fiduciarias, las sociedades de información crediticia y las oficinas de representación.

Qué lee la plataforma, y cómo:

- Nombre con que se identifican sus peticiones (User-Agent): «Socratico-Inteligencia/1.0 (registro de entidades financieras; herramienta independiente)».
- Solo GET, en sb.gob.do: el robots.txt; los listados /supervisados/{categoría}/?page=1&size=100 de cinco categorías (entidades-de-intermediacion-financiera, entidades-de-intermediacion-cambiaria, fiduciarias, sociedades-de-informacion-crediticia y oficinas-de-representacion); la ficha /supervisados/{categoría}/{entidad}/ de cada entidad (alrededor de cien); /supervisados/subagentes/ (solo el total), y el archivo /media/4g4nrdxa/listado-de-entidades-autorizadas-a-operar-2018-2026.csv. Nunca /umbraco/, que su robots.txt reserva.
- Unas 110 peticiones por corrida, a diez segundos una de otra (unos 20 minutos), y no más de una corrida por semana. Si prefieren otro horario o frecuencia, se ajusta.
- No copia teléfonos, correos ni direcciones; los estados financieros y memorias en PDF se enlazan, no se descargan.

Lo que pido: una regla de su cortafuegos que deje pasar ese User-Agent en esas rutas de solo lectura, con el tope de frecuencia que consideren. Sé que un User-Agent se puede imitar; por eso basta con limitar la regla a esas rutas, que solo sirven información pública.

Una alternativa que además les ahorraría carga: publicar en datos abiertos, como ya hacen con el listado mensual de entidades autorizadas, un archivo (CSV o JSON) con lo que hoy muestran las fichas: registro en la SB, razón social, RNC, tipo, estatus, activos, participación, empleados, oficinas, cajeros, subagentes, número de accionistas, calificación de riesgo y calificadora, consejo y principales funcionarios (nombre y cargo) y fecha de actualización. Con ese archivo, la plataforma dejaría de leer las fichas una a una. Ayudaría también sumar el RNC y el número de registro al listado mensual que ya publican.

Aparte, la plataforma lee cada día cuatro gráficos del tablero público SIMBAD (morosidad, cartera, solvencia y tasa de los préstamos nuevos) con el User-Agent «Socratico-Inteligencia/1.0 (banca y subastas; herramienta independiente)». Sobre SIMBAD les escribo por separado.

Quedo a su disposición para cualquier ajuste en «[Correo para notificaciones]».

Atentamente,

«[Nombre completo]»
Socrático.do
