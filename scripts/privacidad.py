"""Lo que un script de instantáneas no escribe nunca.

La cédula de una persona. Un título oficial puede traerla («Cédula de
Identidad y Electoral Núm. 001-0000000-0»; una sentencia del TC, el «RNC núm.»
de una persona): se cambia por «[omitida]» antes de escribir la instantánea,
que se sirve tal cual desde `public/data`. Es la misma regla que `sinCedula`
en `lib/padron.ts`, que la aplica también al leer; `.claude/hooks/cedulas.py`
comprueba con estas formas que ninguna instantánea la guarda.

Las formas, de la más común a la menos:
  - con guiones, en cualquier parte, también dentro del nombre de un archivo
    («DJ-001-0000000-0.pdf»); no el final de un número más largo;
  - con rayas u otros guiones tipográficos;
  - tras la palabra «cédula» (o «céd.»), con espacios, puntos o sin
    separadores: «cédula núm. 00100000000».
Once cifras juntas sin la palabra no cuentan: así se escriben también números
de sentencia, parcelas y matrículas.
"""

import re

GUIONES = re.compile(r"(?<!\d)(?<!\d-)\d{3}-\d{7}-\d(?![\d-])")
RAYAS = re.compile(r"(?<!\d)\d{3}[‐–]\d{7}[‐–]\d(?!\d)")
NOMBRADA = re.compile(r"(\bc[eé]d(?:ula)?\b\.?[^\d\t\n]{0,40}?)(\d{3}[ .‐–-]?\d{7}[ .‐–-]?\d)(?!\d)", re.I)


def sin_cedula(texto):
    """El texto sin cédulas, con la marca en mayúsculas si el texto lo está."""
    if not isinstance(texto, str) or not re.search(r"\d{7}", texto):
        return texto
    marca = "[OMITIDA]" if texto == texto.upper() else "[omitida]"
    texto = NOMBRADA.sub(lambda m: m.group(1) + marca, texto)
    return RAYAS.sub(marca, GUIONES.sub(marca, texto))


def cedulas_en(texto):
    """Cada cédula de un texto, con un poco de contexto: para el gate."""
    salida = []
    for patron in (GUIONES, RAYAS, NOMBRADA):
        for m in patron.finditer(texto):
            salida.append(texto[max(0, m.start() - 40):m.end() + 10].replace("\n", " "))
    return salida
