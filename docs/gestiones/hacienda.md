# Ministerio de Hacienda y Economía · la API de datos abiertos del SIGEF

- **Para:** Ministerio de Hacienda y Economía, Responsable de Acceso a la Información (con copia, si se puede, al área que administra la API de datos abiertos del SIGEF).
- **Vía:** Portal SAIP (https://saip.gob.do) o la Oficina de Acceso a la Información del Ministerio.
- **Fundamento:** Ley 200-04 General de Libre Acceso a la Información Pública (arts. 7 y 8) y su Reglamento (Decreto 130-05) para los puntos 1 y 2; el punto 3 es cooperación técnica.
- **Estado:** borrador, sin enviar.

---

«[Fecha]»

Señores
Ministerio de Hacienda y Economía
Oficina de Acceso a la Información Pública

Asunto: solicitud de información pública (Ley 200-04): ejecución presupuestaria del SIGEF en descarga abierta y documentación de su API

Distinguidos señores:

Quien suscribe, «[Nombre completo]», con cédula de identidad y electoral núm. «[Cédula]» y domicilio en «[Domicilio]», responsable de la plataforma Socrático.do, solicita, al amparo de la Ley 200-04 General de Libre Acceso a la Información Pública y de su Reglamento de aplicación (Decreto 130-05), lo siguiente:

1. La ejecución del Presupuesto General del Estado por institución (capítulo) y por mes, de las tres secciones (administración central; descentralizadas y autónomas no financieras; seguridad social), con los campos que ya sirve la interfaz de datos abiertos del SIGEF (su API): presupuesto inicial, vigente, preventivo, compromiso, devengado y pagado; y las transferencias por institución receptora. Período: de 2015 a la fecha, y cada mes nuevo en cuanto se cierre. Una descarga completa por año, en CSV o JSON, sería lo más liviano para los dos lados: hoy el año en curso tarda entre 20 y 97 segundos por consulta.
2. La documentación de esa API: los tipos y archivos disponibles, sus parámetros, el catálogo vigente de capítulos (el que la plataforma tomó del formulario del Portal de Transparencia Fiscal no coincide ya con el Clasificador Institucional), el diccionario de datos (por ejemplo, que el presupuesto vigente llega como variación mensual y no como saldo) y si es un servicio oficial y estable.
3. Que la API (api-sigef.hacienda.gob.do) vuelva a admitir la lectura identificada. Desde el 29 de septiembre de 2026 su cortafuegos (Cloudflare) responde 403 a la plataforma, hasta en el robots.txt (identificador de Cloudflare «Ray» a42e3ec13ca2b58e). La plataforma hace unas once consultas al mes: tres de ejecución, una por sección, y una por año del subsidio eléctrico desde 2019, con los User-Agent «Socratico-Inteligencia/1.0 (instantanea de ejecucion presupuestaria; herramienta independiente)» y «Socratico-Inteligencia/1.0 (subsidio electrico del SIGEF; herramienta independiente)». Solo lectura; la plataforma no rodea bloqueos.

Lo que no pido: ningún dato de personas.

Motivo: Socrático.do (https://socratico.vercel.app) es una plataforma gratuita, independiente y no oficial que reúne los datos abiertos del Estado dominicano y dice, junto a cada cifra, de dónde sale y de qué fecha es. Es una plataforma para todos, no contra nadie. Su sección de finanzas públicas muestra, institución por institución y mes a mes, cuánto se presupuestó, se comprometió, se devengó y se pagó, con la fecha de corte a la vista y el SIGEF como fuente. El 29 de septiembre esa copia no se pudo renovar y la plataforma sirve la anterior, con su fecha. La entrega mensual del punto 1 cabe en el derecho a estar informado periódicamente que reconoce el artículo 2 de la ley.

Si alguna parte de lo pedido no existe en esa forma, les agradezco entregar lo que exista, en el formato en que lo tengan, e indicarme qué falta. Recibiré las notificaciones en «[Correo para notificaciones]». Esta solicitud reúne los requisitos del artículo 7 de la Ley 200-04; quedo a la espera de su respuesta en el plazo de su artículo 8.

Atentamente,

«[Nombre completo]»
Socrático.do
