# Poder Judicial · cadena del certificado TLS incompleta

- **Para:** Poder Judicial, Dirección de Tecnologías de la Información (o el área que administra poderjudicial.gob.do).
- **Vía:** canal propio del Poder Judicial: su área de tecnología (confirmarlo en su portal).
- **Fundamento:** aviso técnico de cooperación. No es una solicitud de la Ley 200-04 ni un fallo de seguridad. La solicitud de la relación de sentencias de la SCJ va aparte (`scj.md`).
- **Estado:** borrador, sin enviar.

---

«[Fecha]»

Señores
Poder Judicial
Dirección de Tecnologías de la Información

Asunto: el servidor de poderjudicial.gob.do no envía su certificado intermedio

Distinguidos señores:

Le escribe «[Nombre completo]», responsable de Socrático.do (https://socratico.vercel.app), una plataforma gratuita, independiente y no oficial que reúne los datos abiertos del Estado dominicano y dice, junto a cada cifra, de dónde sale y de qué fecha es. Es una plataforma para todos, no contra nadie. Usa varias publicaciones del Poder Judicial, siempre con enlace a su sitio: la composición de la Suprema Corte y del Consejo del Poder Judicial, las estadísticas judiciales mensuales y la nómina de servidores fijos.

Qué pasa. El servidor de poderjudicial.gob.do (y de www.poderjudicial.gob.do) entrega su certificado sin el certificado intermedio que lo une a la autoridad raíz: «Sectigo Public Server Authentication CA OV R36». Muchos navegadores de escritorio lo completan por su cuenta, pero otros clientes no (programas, integraciones y algunos dispositivos) y fallan con un error del tipo «unable to get local issuer certificate». Parece un bloqueo y no lo es.

Cómo corregirlo: configurar el servidor para que envíe la cadena completa, es decir, el certificado del sitio seguido de ese intermedio (el archivo de cadena completa que entrega Sectigo). Una prueba pública de configuración TLS, como la de SSL Labs, lo confirma en minutos.

Mientras tanto, la plataforma incluye ese intermedio, bajado de la dirección oficial de Sectigo, y lee con la verificación encendida: no desactiva ninguna comprobación. Con la cadena completa ya no haría falta.

Quedo a su disposición en «[Correo para notificaciones]».

Atentamente,

«[Nombre completo]»
Socrático.do
