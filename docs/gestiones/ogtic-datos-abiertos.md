# OGTIC · datos.gob.do, que el catálogo se pueda leer por máquina

- **Para:** Oficina Gubernamental de Tecnologías de la Información y Comunicación (OGTIC), equipo del Portal de Datos Abiertos (datos.gob.do).
- **Vía:** el canal de contacto del portal datos.gob.do (confirmarlo en el portal) o la Oficina de Acceso a la Información de la OGTIC.
- **Fundamento:** cooperación técnica. No es una solicitud de la Ley 200-04.
- **Estado:** borrador, sin enviar.

---

«[Fecha]»

Señores
Oficina Gubernamental de Tecnologías de la Información y Comunicación
Portal de Datos Abiertos (datos.gob.do)

Asunto: que el catálogo de datos.gob.do se pueda leer por su interfaz de programación

Distinguidos señores:

Le escribe «[Nombre completo]», responsable de Socrático.do (https://socratico.vercel.app), una plataforma gratuita, independiente y no oficial que reúne los datos abiertos del Estado dominicano y dice, junto a cada cifra, de dónde sale y de qué fecha es. Es una plataforma para todos, no contra nadie. La plataforma usa datos.gob.do como índice del Estado: de sus fichas salieron las nóminas de las 86 instituciones que consolida, y su sección de datos abiertos reúne el catálogo entero (1,065 conjuntos públicos) con enlace a cada ficha del portal.

Qué pasa. El robots.txt del portal veta /api/, que es justo la vía pensada para leer el catálogo por máquina, y pide diez segundos entre peticiones. La plataforma lo respeta: recorre la búsqueda en HTML (unas 55 páginas, unos diez minutos) y no lee las 1,065 fichas una por una, que serían unas tres horas y media. Sus peticiones se identifican con el User-Agent «Socratico-Inteligencia/1.0 (catalogo de datos abiertos; herramienta independiente)».

Lo que pido, cualquiera de las dos cosas:

1. Que el robots.txt permita leer las rutas de consulta del catálogo bajo /api/ (búsqueda y detalle de un conjunto), con la espera entre peticiones que consideren.
2. O una exportación completa y periódica del catálogo (JSON o CSV): cada conjunto con su organización, sus archivos (formato y enlace), periodicidad, fecha de última actualización y licencia.

Dos notas que pueden servirles. El rótulo de resultados dice la misma cifra busque lo que se busque («1199 resultados»); la real sale al paginar. Y algunas fichas enlazan una página en vez del archivo: la de la Maternidad enlaza una categoría de su sitio, la de SIUBEN repite el mismo identificador para el CSV y el ODS, y la de la PGR trae el enlace vacío.

Quedo a su disposición en «[Correo para notificaciones]».

Atentamente,

«[Nombre completo]»
Socrático.do
