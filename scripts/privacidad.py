"""Lo que un script de instantáneas no escribe nunca (docs/DECISIONES.md).

La cédula de una persona. Un título oficial puede traerla («Cédula de
Identidad y Electoral Núm. 001-0000000-0»; una sentencia del TC, el «RNC núm.»
de una persona): se cambia por «[omitida]» antes de escribir la
instantánea, que se sirve tal cual desde `public/data`. Es la misma regla que
`sinCedula` en `lib/padron.ts`, que la aplica también al leer.

Once cifras juntas no cuentan: así se escriben también números de sentencia,
parcelas y matrículas.
"""

import re

CEDULA = re.compile(r"(?<![\d-])\d{3}-\d{7}-\d(?![\d-])")


def sin_cedula(texto):
    """El texto sin cédulas, con la marca en mayúsculas si el texto lo está."""
    if not isinstance(texto, str) or not CEDULA.search(texto):
        return texto
    marca = "[OMITIDA]" if texto == texto.upper() else "[omitida]"
    return CEDULA.sub(marca, texto)
