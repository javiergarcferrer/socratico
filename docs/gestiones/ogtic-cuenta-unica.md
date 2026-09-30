# OGTIC · cliente de Cuenta Única para Socrático.do

- **Para:** Oficina Gubernamental de Tecnologías de la Información y Comunicación (OGTIC), equipo de Cuenta Única.
- **Vía:** el canal que la OGTIC indique para integrar Cuenta Única (confirmarlo en cuentaunica.gob.do o con su mesa de ayuda).
- **Fundamento:** solicitud de servicio (cooperación). No es una solicitud de la Ley 200-04. Base: el borrador de `docs/PLAN-DEMOCRACIA.md` §9.4, con las direcciones de vuelta de §9.5. El aviso de seguridad del 311 va aparte.
- **Estado:** borrador, sin enviar. Cuando llegue el identificador del cliente, los pasos siguientes son los de `docs/PLAN-DEMOCRACIA.md` §9.5.

---

«[Fecha]»

Señores
Oficina Gubernamental de Tecnologías de la Información y Comunicación
Equipo de Cuenta Única

Asunto: solicitud de un cliente OAuth2 (OpenID Connect) de Cuenta Única para Socrático.do

Distinguidos señores:

Le escribe «[Nombre completo]», responsable de Socrático.do (https://socratico.vercel.app), una plataforma gratuita, independiente y no oficial que lee en vivo fuentes públicas del Estado (DGCP, SIGEF, Congreso, Consultoría Jurídica, Crédito Público) y corre un piloto de opinión ciudadana sobre las iniciativas legislativas. Es una plataforma para todos, no contra nadie. Queremos que cada voto de ese piloto provenga de una persona real y única sin guardar cédulas: solo una huella con clave (HMAC) del identificador que entregue Cuenta Única.

Lo que pido: un cliente público, con estos datos:

- tipo: público, con PKCE S256 y token_endpoint_auth_method «none» (sin secreto);
- grant_types: authorization_code; response_types: code; scope: openid;
- redirect_uris: https://socratico.vercel.app/democracia/cuenta-unica/callback y https://socratico.do/democracia/cuenta-unica/callback.

Dos preguntas:

1. ¿Qué datos (claims) entrega el ID token o /userinfo a un cliente externo? En particular, ¿preferred_username es la cédula?
2. ¿Se conserva el identificador de una persona (sub) después de que recupera su cuenta?

Compromisos: minimización de datos conforme a la Ley 172-13 (la plataforma no ve ni guarda la cédula en claro); un expediente público de seguridad en https://socratico.vercel.app/democracia/seguridad; el aviso de herramienta no oficial visible en cada pantalla; y código auditable. La integración ya está construida y apagada: se enciende cuando exista el cliente.

Quedo a su disposición para coordinar en «[Correo para notificaciones]».

Atentamente,

«[Nombre completo]»
Socrático.do
