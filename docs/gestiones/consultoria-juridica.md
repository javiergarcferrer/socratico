# Consultoría Jurídica · que su cortafuegos admita la lectura identificada del buscador

- **Para:** Consultoría Jurídica del Poder Ejecutivo, Departamento de Tecnología de la Información (TIC).
- **Vía:** canal propio de la Consultoría: su área de tecnología o el contacto que publique su portal (confirmarlo antes de enviar).
- **Fundamento:** cooperación técnica. No es una solicitud de la Ley 200-04 y no corre plazo legal.
- **Estado:** borrador, sin enviar.

---

«[Fecha]»

Señores
Consultoría Jurídica del Poder Ejecutivo
Departamento de Tecnología de la Información

Asunto: lectura identificada del buscador de normas desde los servidores de Socrático.do

Distinguidos señores:

Le escribe «[Nombre completo]», responsable de Socrático.do (https://socratico.vercel.app), una plataforma gratuita, independiente y no oficial que reúne los datos abiertos del Estado dominicano y dice, junto a cada cifra, de dónde sale y de qué fecha es. Es una plataforma para todos, no contra nadie. Su sección de normativa muestra leyes, decretos, reglamentos, resoluciones y Gacetas Oficiales tal como los publica la Consultoría, y cada norma enlaza a su PDF en su portal.

Qué pasa. Desde septiembre de 2026 (comprobado el día 23), su cortafuegos (Cloudflare) responde 403 con un desafío (cf-mitigated: challenge) a las consultas que llegan de los servidores de la plataforma, mientras desde otras redes el mismo buscador responde con normalidad. La plataforma no rodea desafíos: mientras dure, muestra una copia semanal generada desde una red que su portal acepta, con su fecha a la vista, y el visor remite al PDF en su sitio.

Qué lee la plataforma, y cómo (solo lectura, en www.consultoria.gov.do):

- POST /api/consultas/search, siempre acotado por tipo y año o por número de norma;
- GET /api/documents?category=gacetas;
- GET /api/document/{DocId}, el PDF de una norma.
- Nombre con que se identifican sus peticiones (User-Agent): «Socratico-Inteligencia/1.0 (monitoreo normativo; herramienta independiente)» para las consultas y «Socratico-Inteligencia/1.0 (lectura de documento público; herramienta independiente)» para los PDF.
- Volumen: unas decenas de consultas por hora, con caché (una cita se guarda 24 horas).

Lo que pido: una regla de su cortafuegos que deje pasar las peticiones con User-Agent que empieza por «Socratico-Inteligencia/1.0» en esas tres rutas de solo lectura, con el tope de frecuencia que consideren. Sé que un User-Agent se puede imitar; por eso la regla puede limitarse a esas rutas, que solo sirven información pública.

Una alternativa: un archivo abierto y periódico (JSON o CSV) con lo que el buscador devuelve por tipo y año. Si lo publican, les sugiero dejar fuera el campo de cédula que hoy trae el buscador en algunos decretos; la plataforma lo descarta al leer y nunca lo guarda.

Quedo a su disposición para cualquier ajuste en «[Correo para notificaciones]».

Atentamente,

«[Nombre completo]»
Socrático.do
