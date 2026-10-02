#!/usr/bin/env python3
"""Consolida la nómina pública en una foto transversal por institución.

Cada institución del Estado publica su nómina bajo el estándar de transparencia
(Ley 200-04) en formatos que solo coinciden en el concepto: cambian el
delimitador (`,`/`;`), la codificación (UTF-8/cp1252/cp850), y los nombres de
columna (CARGO/FUNCIÓN/RANGO, DEPARTAMENTO/OFICINA/ÁREA/LUGAR, SUELDO
BRUTO/INGRESO BRUTO/SUELDO BASE…). Este script normaliza todo eso y emite
`public/data/nomina.json` con **el último mes publicado por cada institución**
(no meses futuros: hay filas mal fechadas), que es lo que mantiene el archivo
acotado: cobertura ancha en instituciones, un mes de profundidad.

No se ingieren nombres de personas ni género: cada fila queda como
(institución, área, cargo, sueldo bruto).

Uso:
    python3 scripts/build-nomina.py --descargar   # baja las fuentes del manifiesto
    python3 scripts/build-nomina.py               # usa scripts/fuentes-nomina/*.csv

Para sumar una institución: añadirla a MANIFEST con la URL de su CSV de nómina
(la mayoría aparece buscando su dataset en datos.gob.do) y regenerar. El parser
tolera los formatos conocidos; si uno nuevo no mapea, lo dirá.
"""
import csv
import datetime
import json
import os
import re
import sys
import unicodedata
import urllib.parse
import urllib.request

DIR = os.path.join(os.path.dirname(__file__), "fuentes-nomina")
OUT = os.path.join(os.path.dirname(__file__), "..", "public", "data", "nomina.json")
UA = "Socratico-Inteligencia/1.0 (consolidacion de nominas publicas; herramienta independiente)"

MONTHS = {m: i + 1 for i, m in enumerate(
    ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto",
     "septiembre", "octubre", "noviembre", "diciembre"])}
MONTH_NAMES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio",
               "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"]

# codigo -> (nombre mostrable, URL oficial del CSV; None = solo archivo local)
MANIFEST = {
    "CESAC": ("Cuerpo Especializado en Seguridad Aeroportuaria (CESAC)", None),
    "MSP": ("Ministerio de Salud Pública",
            "https://www.msp.gob.do/web/Transparencia/documentos_oai/748/nomina-de-empleados-del-msp/34685/nomina-de-empleados-mispas-2017-2026-2.csv"),
    "MESCYT": ("Ministerio de Educación Superior, Ciencia y Tecnología",
               "https://mescyt.gob.do/transparencia/download/3954/nomina-de-empleados-fijos/15746/da-nomina-de-empleados-fijos-mescyt-2018-2025-en-cvs.csv"),
    "MINC": ("Ministerio de Cultura",
             "https://cultura.gob.do/wp-content/uploads/2026/08/Nomina-de-Empleados-MINC-2019-2026.csv"),
    "MEM": ("Ministerio de Energía y Minas",
            "https://mem.gob.do/datosabiertos/nomina/NOMINA-DATOS-ABIERTOS-JULIO-2026.csv"),
    "DIGEIG": ("Dir. Gral. de Ética e Integridad Gubernamental",
               "https://digeig.gob.do/wp-content/uploads/2026/08/Nomina-Empleados-Fijos-Contratados-2017-2026.csv"),
    "CND": ("Consejo Nacional de Drogas",
            "https://consejodedrogasrd.gob.do/wp-content/uploads/2023/06/Nomina-personal-civil-anos-2017-2026-6.csv"),
    "DEFCIVIL": ("Defensa Civil",
                 "https://defensacivil.gob.do/transparencia/images/docs/datos-abiertos/2026/Actualizado%20j/NewFolder/NOMINA-de-Empleados-Fijo-DC-2018-2026_1NOMINA-de-Empleados-Fijo_1.csv"),
    "CCDF": ("Consejo del Café Dominicano (CCDF)",
             "https://ccdf.gob.do/wp-content/uploads/2024/09/Nomina-de-empleados-CCDF-2020-%E2%80%93-2026.CSV-6.csv"),
    "JAC": ("Junta de Aviación Civil",
            "https://jac.gob.do/wp-content/uploads/2026/04/Nomina-personal-fijo-y-contratado-2026.csv"),
    "ICM": ("Instituto Cartográfico Militar",
            "https://datos.gob.do/dataset/de850f20-9770-4409-88d6-32d78fe1098b/resource/9847ec68-e7c4-40af-acbf-2c95206eabec/download/nomina-fija-icm-202"),
    # Ampliación del 2026-09-23 (docs/INFRAESTRUCTURA.md §5.8): enlaces
    # directos sacados de las fichas HTML de datos.gob.do (su /api/ lo veta el
    # robots), bajados con el UA de arriba. Probados y descartados ese día:
    # Migración y Ayuntamiento de Santiago (403), UNADE (202 con página HTML),
    # TSE (CSV sin cabecera), IDECOOP (sin mes ni año) y CDC (mes y año en una
    # sola columna «Mes / año»).
    "DGCP": ("Dirección General de Contrataciones Públicas",
             "https://www.dgcp.gob.do/new_dgcp/documentos/da/N%C3%B3mina%20de%20Empleados,%20DGCP,%202022%20-%202026.csv"),
    "IDEICE": ("Instituto Dominicano de Evaluación e Investigación de la Calidad Educativa",
               "https://ideice.gob.do/descargas/datos-abiertos/nomina-de-empleados.csv"),
    "IAD": ("Instituto Agrario Dominicano",
            "https://iad.gob.do/wp-content/uploads/2026/08/Nomina-de-Empleados-IAD-2020-2026-Formato-CSV.csv"),
    "CGR": ("Contraloría General de la República",
            "https://contraloria.gob.do/wp-content/uploads/2025/09/Nomina-empleados-fijos-y-contratados-CSV-2018-%E2%80%93-2026-9.csv"),
    "TSS": ("Tesorería de la Seguridad Social",
            "https://tss.gob.do/descargar/2046/nominas-de-empleados-2017-2026/17730/nominas-de-empleados-2017-2026-2.csv"),
    "MIREX": ("Ministerio de Relaciones Exteriores (personal pagado en pesos)",
              "https://mirex.gob.do/transparencia/descargar/335/2018-2026/19579/nomina-personal-mirex-2018-2026.csv"),
    "PJ": ("Poder Judicial (servidores fijos)",
           "https://transparencia.poderjudicial.gob.do/documentos/DatosAbiertos/DA_NominaServidoresFijos.csv"),
    "S911": ("Sistema Nacional de Atención a Emergencias y Seguridad 9-1-1",
             "https://911.gob.do/wp-content/uploads/2026/09/Nomina-de-Empleados-Sistema911-2017-2026.csv"),
    "INABIMA": ("Instituto Nacional de Bienestar Magisterial",
                "https://transparencia.inabima.gob.do/Descarga/Datos%20Abiertos/N%C3%B3mina%20de%20Empleados,%202018%20-%202025/N%C3%B3mina%20de%20Empleados,%20INABIMA,%202018%20-%202025.csv"),
    "SVSP": ("Superintendencia de Vigilancia y Seguridad Privada",
             "https://datos.gob.do/dataset/ffbef324-a8b7-4c4c-9455-94567087df79/resource/5e008605-81f8-4e9c-90e0-fd05cc6cc774/download/nomina-de-sueldo-por-cargo-2025-2026-act.csv"),
    "DIGEPRES": ("Dirección General de Presupuesto",
                 "https://digepres.gob.do/transparencia/wp-content/uploads/2026/09/NOMINA-DATOS-ABIERTOS-2018-2026.xlsxf_.csv"),
    "LOTERIA": ("Lotería Nacional",
                "https://loterianacional.gob.do/transparencia/archivos/datos-abiertos/archivo/Nomina%20de%20Empleados,%20Agosto%202026.csv"),
    # Ampliación del 2026-09-24 (docs/INFRAESTRUCTURA.md §5.8): 64 fuentes más, del catálogo
    # completo de datos.gob.do (public/data/catalogo.json: 1,065 conjuntos, 126
    # candidatos de nómina fuera de los ya integrados) y de sus fichas HTML, con
    # el robots respetado. Cada archivo se leyó fila a fila (área, cargo,
    # sueldo) y su conteo se contrastó con la «Nómina Pública General del
    # Estado» del MAP de julio de 2026: MAP y ANAMAR coinciden al peso; DAEH,
    # Agricultura, OPRET (sus dos archivos), INTRANT y Bellas Artes, en ±2 %.
    # Agricultura sirve su CSV dentro de un ZIP; INAPA (por programa), OPRET
    # (vigilancia aparte) y Registro Inmobiliario (fijos y contratados)
    # publican varios archivos. Descartados ese día, con el porqué:
    # - Columnas cambiadas en las filas recientes sin cambiar la cabecera, y
    #   sanear() no lo ve: INDOTEL y Hospital Vinicio Calventi (área↔cargo),
    #   SGN y Cambio Climático (dependencias como cargo), CNC y APORDOM (el
    #   estatus como cargo).
    # - Sin puesto: Catastro (cargo vacío en los meses recientes), ProDominicana
    #   («Posición» es la dependencia), Ministerio de Trabajo, Ayuntamiento de
    #   La Romana.
    # - Solo sueldo neto: INDRHI, FARD, PROPEEP (honorarios + movilidad + neto).
    # - Sueldo partido o ambiguo: Ejército («SUELDO RANGO» + «SUELDO CARGO»;
    #   sumarlos es interpretar), SENPA (una columna «TOTAL»).
    # - Agregados, no una fila por plaza: Policía Nacional (16 filas, una por
    #   rango), COREPOL (cantidad por cargo), CESFRONT (una fila «CANT 477» es
    #   el 51 % de la masa), Ayuntamiento de Mella.
    # - Sin mes o sin año legible: Juventud (una «Fecha»), COAAROM, Efemérides
    #   Patrias (el año como nombre de columna), ONESVIE (cabecera «AÑ» en otra
    #   codificación que las filas), INABIE (fijos sin mes; contratados con
    #   12 % de plazas en RD$0).
    # - Desactualizadas (último mes antes de 2025): CONAPOFA 2024-12, Comisión
    #   Hípica 2024-11, DICOM 2022-12, INVI 2021-12, Ayuntamiento de Santo
    #   Domingo Este 2018-12.
    # - No son CSV: Acuario (ODS/XLS), Padre Billini y Tecnificación de Riego
    #   (ODS), FONDOMARENA (un XLS con nombre .csv), INAVI (informe con
    #   membrete), FODEARTE (presupuesto, no nómina), Dragas (sin formato).
    # - No se pudieron bajar: INAZUCAR (403 en SharePoint), INAFOCAM (el
    #   certificado TLS no valida; no se desactiva la verificación), IDSS,
    #   DIAPE, DIGECOOM y Comunidad Digna (el host no resuelve o no conecta),
    #   PROINDUSTRIA (conexión cortada), CORAABO (500), ayuntamientos de San
    #   Pedro de Macorís, Baní y San Cristóbal (503), Instituto Duartiano,
    #   Pasaportes, CODOPESCA y CPP (404), y COE, CONIAF, MIDEREC, DIGEV,
    #   INDOCAFE, CEA, Tribunal Constitucional e INCABIDE (el enlace lleva a
    #   una página, no al archivo).
    # La «Nómina Pública General del Estado» del MAP (492,488 plazas de 129
    # instituciones en julio de 2026, siete CSV mensuales) no entra aquí: foto
    # de ese tamaño cambia el contrato de nomina.json, que el explorador baja
    # entero. Decisión pendiente, docs/INFRAESTRUCTURA.md §5.8.
    "MA": ("Ministerio de Agricultura",
           "http://agricultura.gob.do/transparencia/wp-content/uploads/2026/09/Nomina-Empleados-Enero-2017-Agosto-2026_comprimida.zip"),
    "DAEH": ("Dirección de Servicios de Atención a Emergencias Extrahospitalarias (DAEH)",
             "https://daeh.gob.do/inicio/download/348/nomina-daeh/39971/nomina-daeh-2026.csv"),
    "INAPA": ("Instituto Nacional de Aguas Potables y Alcantarillados (INAPA)",
              (
               "https://inapa.gob.do/wp-content/uploads/2024/07/Nomina-MILITARES-Programa-01-INAPA-2025-1-1-1-1-2.csv",
               "https://inapa.gob.do/wp-content/uploads/2024/07/Nomina-SUELDO-FIJO-Programa-01-03-11-13-INAPA-2025-1-1-1-2-1.csv",
               "https://inapa.gob.do/wp-content/uploads/2024/07/Nomina-TEMPORALES-Programa-01-03-11-13-INAPA-2025-1-1-1-1-2.csv",
               "https://inapa.gob.do/wp-content/uploads/2024/07/Nomina-TRAMITE-DE-PENSION-Programa-01-INAPA-2025-1-1-1-1-1.csv",
              )),
    "CAASD": ("Corporación del Acueducto y Alcantarillado de Santo Domingo (CAASD)",
              "https://transparencia.caasd.gob.do/wp-content/uploads/2026/09/NOMINAS-PARA-DATOS-ABIERTOS-2016-2026-AGOSTO.csv"),
    "CEED": ("Comedores Económicos del Estado",
             "https://comedoreseconomicos.gob.do/wp-content/uploads/2024/04/Nomina-de-Empleados-Agosto-2026-CSV.csv"),
    "OMSA": ("Operadora Metropolitana de Servicios de Autobuses (OMSA)",
             "https://wp.omsa.gob.do/wp-content/uploads/2026/02/NOMINA-DE-EMPLEADO-AGOSTO-2018-2026-CVS.csv"),
    "OPRET": ("Oficina para el Reordenamiento del Transporte (OPRET)",
              (
               "https://www.opret.gob.do/Documentos/Datos%20Abiertos/N%C3%B3mina%20De%20Empleados%20Fijos%20y%20Contratados%20Opret.csv",
               "https://www.opret.gob.do/Documentos/Datos%20Abiertos/Personal%20De%20Vigilancia.csv",
              )),
    "MIVHED": ("Ministerio de la Vivienda, Hábitat y Edificaciones",
               "https://mivhed.gob.do/wp-content/uploads/2026/09/Nomina_de_Empleados_MIVHED_2022_2026_-.csv"),
    "ETED": ("Empresa de Transmisión Eléctrica Dominicana (ETED)",
             "https://eted.gob.do/transparencia/download/1154/nomina-de-empleados/11482/nomina-empleados-fijos-y-contratados-eted-2018-2025-3.csv"),
    "INESPRE": ("Instituto de Estabilización de Precios (INESPRE)",
                "https://www.inespre.gov.do/transparencia/download/datos_nomina-de-empleados-fijos-2017-2018-csv/?wpdmdl=4025"),
    "CESMET": ("Cuerpo Especializado para la Seguridad del Metro (CESMET)",
               "https://cesmet.mil.do/download/695/2026/4539/nomina-de-miembros-2026-marzo-3.csv"),
    "INTRANT": ("Instituto Nacional de Tránsito y Transporte Terrestre (INTRANT)",
                "https://intrant.gob.do/wp-content/uploads/2023/06/Historico-Nomina-de-empleados-INTRANT-2018-2026-5.csv"),
    "RI": ("Registro Inmobiliario (servidores administrativos)",
           (
            "https://ri.gob.do/wp-content/uploads/Transparencia/DatosAbiertos/DA_NominaServidoresFijos.csv",
            "https://ri.gob.do/wp-content/uploads/Transparencia/DatosAbiertos/DA_NominaServidoresContratados.csv",
           )),
    "DGBA": ("Dirección General de Bellas Artes",
             "https://bellasartesrd.gob.do/wp-content/uploads/2026/09/Nomina-Datos-Abiertos-2019-2026-AGOSTO-CSV.csv"),
    "PROMIPYME": ("Consejo Nacional de Promoción y Apoyo a la Micro, Pequeña y Mediana Empresa (PROMIPYME)",
                  "https://promipyme.gob.do/files/1180/Nomina-Empleados-Fijos/7018/Historico-De-Nomina-de-Empleados-2018-2026.csv"),
    "MEPYD": ("Ministerio de Economía, Planificación y Desarrollo",
              "https://mepyd.gob.do/download/17161/nomina-de-empleados/420963/nomina-de-empleados-mepyd-2018-2025-3.csv"),
    "AYTOMOCA": ("Ayuntamiento Municipal de Moca",
                 "https://ayuntamientomoca.gob.do/transparencia/wp-content/uploads/2025/04/Nominas-Octubre-Marzo-2025.csv"),
    "INPOSDOM": ("Instituto Postal Dominicano (INPOSDOM)",
                 "https://inposdom.gob.do/transparencia/transparencia%20files/409/2021/2727/nomina-empleados-inposdom-2021-3.csv"),
    "AYTOSFM": ("Ayuntamiento Municipal de San Francisco de Macorís",
                "https://ayuntamientosfm.gob.do/wp-content/uploads/2023/06/Nominas-de-empleados-ASFM-2021-2026-7.csv"),
    "FEDA": ("Fondo Especial para el Desarrollo Agropecuario (FEDA)",
             "https://feda.gob.do/transparencia/index.php?option=com_phocadownload&view=category&download=2220:nomina-dato-abierto-desde-enero-2022-hasta-julio-2026&id=517:nomina-dato-abierto&Itemid=405"),
    "INTABACO": ("Instituto del Tabaco de la República Dominicana (INTABACO)",
                 "https://intabaco.gob.do/wp-content/uploads/2025/01/Nomina-General-de-Empleados-INTABACO-2018-2026-3.csv"),
    "ONDP": ("Oficina Nacional de Defensa Pública",
             "https://www.defensapublica.gob.do/transparencia/index.php/datos-abiertos/category/822-nomina-empleados-fijos-contratados-y-probatorios-2018-2019?download=959:nomina-empleados-fijos-contratados-y-probatorio-2018-2019-2020-csv"),
    "CORAAPLATA": ("Corporación de Acueducto y Alcantarillado de Puerto Plata (CORAAPLATA)",
                   "https://coraapplata.gob.do/wp-content/uploads/2023/06/Nomina-de-Empleados-CORAAPPLATA-2017-2026-7.csv"),
    "HDSSD": ("Hospital Docente Semma Santo Domingo",
              "https://hdssd.gob.do/transparencia/index.php/datos-abiertos/category/1332-nomina-personal-fijo-2026?download=4889:nomina-personal-fijo-agosto-2025-2026"),
    "OGTIC": ("Oficina Gubernamental de Tecnologías de la Información y Comunicación (OGTIC)",
              "https://ogtic.gob.do/wp-content/uploads/2023/06/NOMINA-OGTIC-DATOS-ABIERTOS-ENERO-2018-JULIO-2026-csv.csv"),
    "MAPRE": ("Ministerio Administrativo de la Presidencia",
              "https://mapre.gob.do/transparencia/download/datos_abiertos/nomina/Nomina-Datos-Abiertos-2017-2026.csv"),
    "IDIAF": ("Instituto Dominicano de Investigaciones Agropecuarias y Forestales (IDIAF)",
              "https://idiaf.gob.do/transparencia/index.php/datos-abiertos/category/391-nomina-empleados-fijos-y-contratados-2018-2025?download=5549:nomina-de-empleados-idiaf-2018-2025"),
    "MAP": ("Ministerio de Administración Pública",
            "https://map.gob.do/datosabiertos/data/nomina_fijos_map/csv"),
    "IDOPPRIL": ("Instituto Dominicano de Prevención y Protección de Riesgos Laborales (IDOPPRIL)",
                 "https://idoppril.gob.do/download/nomina-enero2023-noviembre-2024-csv/?wpdmdl=16142&refresh=6970f7f47c4a11769011188"),
    "SISALRIL": ("Superintendencia de Salud y Riesgos Laborales (SISALRIL)",
                 "https://www.sisalril.gob.do/transparencia/wp/download/885/nomina-sisalril-2015-2026/987537600/nomina-de-empleados-2015-2026-csv-2.csv"),
    "MMUJER": ("Ministerio de la Mujer",
               "https://mujer.gob.do/transparencia/index.php/datos-abiertos/datos-abiertos/category/2593-2026?download=10954:datos-abiertos-nominas-empleados-enero-2017-a-mayo-2026-csv"),
    "DGMUSEOS": ("Dirección General de Museos",
                 "https://dgm.gob.do/transparencia/index.php/datos-abiertos/category/1288-agosto?download=1505:nominas-2023-2026-agosto-csv"),
    "DGDF": ("Dirección General de Desarrollo Fronterizo",
             "https://wp.dgdf.gob.do/wp-content/uploads/2023/06/Nomina-DGDF-2021-2026-07.csv"),
    "LMD": ("Liga Municipal Dominicana",
            "https://lmd.gob.do/transparencia/index.php/datos-abiertos/category/1088-nomina-empleados-2018-2026?download=1378:nomina-datos-abiertos-enero-2018-ago-2026-csv"),
    "DIGECOG": ("Dirección General de Contabilidad Gubernamental",
                "https://digecog.gob.do/wp-content/uploads/2024/03/Nomina-colaboradores-Junio-2026-datos-abiertos-DIGECOG.csv"),
    "DIECOM": ("Dirección de Estrategia y Comunicación Gubernamental (DIECOM)",
               "https://diecom.gob.do/transparencia/wp-content/uploads/datos_abiertos/nomina/N%C3%B3mina%20de%20Empleados%2C%20DIECOM%2C%202022-2026.csv?oiu"),
    "MINPRE": ("Ministerio de la Presidencia",
               "https://minpre.gob.do/wp-content/uploads/2026/06/NominasMINPRE-.csv"),
    "AGN": ("Archivo General de la Nación",
            "https://agn.gob.do/wp-content/uploads/2023/06/Nomina-de-Empleados-AGN-2019-2026-4.csv"),
    "ECO5RD": ("Unidad Ejecutora ECO5RD",
               "https://eco5rd.gob.do/download/909/nomina-personal-fijo/26726/nomina-personal-fijo-2024-2025-2.csv"),
    "TN": ("Tesorería Nacional",
           "https://www.tesoreria.gob.do/transparencia/index.php/datos-abrierto/category/145-nomina-empleados-fijos-y-contratados?download=3493:nmina-empleados-fijos-y-contratados"),
    "MERCADOM": ("Mercados Dominicanos de Abasto Agropecuario (MERCADOM)",
                 "https://mercadom.gob.do/transparencia/index.php/portal-datos-abiertos/category/848-nomina-empleados-fijos-y-contratados?download=2229:nomina-empleados-fijos-y-contratados"),
    "IIBI": ("Instituto de Innovación en Biotecnología e Industria (IIBI)",
             "https://iibi.gob.do/transparencia/index.php/portal-de-datos-abiertos/category/437-nomina-empleados-fijos-y-contratados-2018-3-documentos?download=1214:nomina-empleados-fijos-y-contratados-2018-2021"),
    "CEIZTUR": ("Comité Ejecutor de Infraestructuras en Zonas Turísticas (CEIZTUR)",
                "https://wp.ceiztur.gob.do/wp-content/uploads/2023/06/NOMINA-EMPLEADOS-FIJOS-Y-CONTRATADOS-A-JUNIO-2026.csv"),
    "ZOODOM": ("Parque Zoológico Nacional",
               "https://zoodom.gob.do/wp-content/uploads/2023/06/Nomina-Actualizada-Enero-Marzo-2026.csv"),
    "DGM": ("Dirección General de Minería",
            "https://mineria.gob.do/wp-content/uploads/2026/02/Historico-Nominas-Empleados-MINERIA-2022-2026-CSV-6.csv"),
    "DEFENSOR": ("Defensor del Pueblo",
                 "https://defensordelpueblo.gob.do/wp-content/uploads/2026/09/Nomina-de-Empleados-DP-2019-2026.8.3.csv"),
    "BNPHU": ("Biblioteca Nacional Pedro Henríquez Ureña",
              "https://bnphu.gob.do/wp-content/uploads/2025/03/Nomina-Empleados-Fijos-y-Contratados-hasta-Junio2026NEW.csv"),
    "INAGUJA": ("Industria Nacional de la Aguja (INAGUJA)",
                "https://inaguja.gob.do/transparencia/index.php/datos-abiertos/category/3174-agosto?download=3724:nomina-personal-fijo-agosto-2026-csv"),
    "INAP": ("Instituto Nacional de Administración Pública (INAP)",
             "https://inap.gob.do/download/18829/?tmstv=1738609577"),
    "CONADIS": ("Consejo Nacional de Discapacidad (CONADIS)",
                "https://conadis.gob.do/wp-content/uploads/2023/06/Nomina-empleados-CONADIS-2018-2026-1.csv"),
    "CORPHOTELS": ("Corporación de Fomento de la Industria Hotelera y Desarrollo del Turismo (CORPHOTELS)",
                   "https://corphotels.gob.do/transparencia/index.php/datos-abiertos/category/381-nomina-de-empleados?download=5409:nomina-empleados-corphotels-2018-2026-agosto"),
    "DGAPP": ("Dirección General de Alianzas Público Privadas (DGAPP)",
              "https://transparencia.dgapp.gob.do/index.php/datos-abiertos/category/562-nomina-empleados-fijos-y-contratados-2021-2022?download=4108:nmina-de-empleados-2021-2026-csv"),
    "CNSS": ("Consejo Nacional de Seguridad Social (personal fijo)",
             "https://cnss.gob.do/wp-content/uploads/2024/10/XLS-Nomina_desde_junio_2018_hasta_agosto_2026.csv"),
    "INESDYC": ("Instituto de Educación Superior en Formación Diplomática y Consular (INESDYC)",
                "https://www.inesdyc.edu.do/transparencia/download/181/nominas/29564/nomina-de-empleados-inesdyc-2023-2026-2.csv"),
    "PROCOMPETENCIA": ("Comisión Nacional de Defensa de la Competencia (PROCOMPETENCIA)",
                       "https://procompetencia.gob.do/transparencia/download/190/nomina-empleados/20706/nomina-empleados-2017-2026-24.csv"),
    "INM": ("Instituto Nacional de Migración (INM RD)",
            "https://inm.gob.do/wp-content/uploads/2025/09/Nomina-Empleados-INMRD-2019-2026-5.csv"),
    "ODAC": ("Organismo Dominicano de Acreditación (ODAC)",
             "https://odac.gob.do/transparencia/index.php/datos-abiertos/category/324-nomina-2018?download=367:nomina-csv"),
    "EGAEE": ("Escuela de Graduados de Altos Estudios Estratégicos (EGAEE)",
              "https://egae.mil.do/descargar/875/nomina-de-empleados-egaee/15579/datos-abiertos-nomina-de-empleados-egaee-2019-2025.csv"),
    "DIGERA": ("Dirección General de Riesgos Agropecuarios (DIGERA)",
               "https://digera.gob.do/wp-content/uploads/2023/06/Historico-de-Nomina-2018-%E2%80%93-2026-5.csv"),
    "HTDC": ("Hospital Traumatológico Dr. Darío Contreras (personal contratado)",
             "https://dariocontreras.gob.do/transparencia/index.php/datos-abiertos/category/988-nomina-2021-nomina-2026?download=4332:nomina-hdc-datosabiertos-abril-2021-hasta-agosto-2026"),
    "CONALECHE": ("Consejo Nacional para la Reglamentación y Fomento de la Industria Lechera (CONALECHE)",
                  "https://datos.gob.do/dataset/87545b6a-e54d-47f0-988c-3b0b900fb296/resource/a9257b14-3dc4-4030-8c5b-8d181aacc5ee/download/nomina-de-empleados-conaleche-2026.csv"),
    "IGN": ("Instituto Geográfico Nacional José Joaquín Hungría Morell",
            "https://ign.gob.do/transparencia/descargas/296/nomina-de-empleados/3310/nomina-de-empleados-ign-jjhm-3.csv"),
    "SIE": ("Superintendencia de Electricidad",
            "https://sie.gob.do/wp-content/uploads/2025/02/Copia-de-Reporte-de-Datos-Abiertos-csv-xls.csv"),
    "ANAMAR": ("Autoridad Nacional de Asuntos Marítimos (ANAMAR)",
               "https://anamar.gob.do/wp-content/uploads/2023/06/Nomina-Empleados-Fijos-y-Contratados-ANAMAR-2011-2026-csv.csv"),
}


def strip_accents(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", s)
                   if unicodedata.category(c) != "Mn")


def hkey(h: str) -> str:
    """Clave de cabecera tolerante a mojibake: solo letras/dígitos ASCII."""
    return re.sub(r"[^A-Z0-9]", "", strip_accents(h).upper())


def decode_best(raw: bytes) -> str:
    """La codificación que produzca el español más sano (ñ/acentos)."""
    best, score = "latin-1", -1
    for enc in ("utf-8-sig", "cp1252", "cp850", "latin-1"):
        try:
            t = raw.decode(enc)
        except Exception:
            continue
        s = sum(t.count(c) for c in "áéíóúñÁÉÍÓÚÑ") - t.count("�") * 5
        if s > score:
            best, score = enc, s
    return best


def parse_money(v: str) -> int:
    v = re.sub(r"[^\d.,-]", "", v or "").strip()
    if not v:
        return 0
    if "," in v and "." in v:
        dec = "," if v.rfind(",") > v.rfind(".") else "."
        v = v.replace("." if dec == "," else ",", "").replace(dec, ".")
    elif "," in v:
        v = v.replace(",", "." if re.search(r",\d{1,2}$", v) else "")
    try:
        return int(round(float(v)))
    except ValueError:
        return 0


def parse_month(v: str):
    v = strip_accents((v or "").strip().lower())
    if v in MONTHS:
        return MONTHS[v]
    if v.isdigit() and 1 <= int(v) <= 12:
        return int(v)
    return None


def col_map(header):
    m = dict.fromkeys(("sueldo", "cargo", "area", "mes", "anio"), None)
    for i, h in enumerate(header):
        k = hkey(h)
        # «FECHA DE INGRESO» (Poder Judicial) contiene «INGRESO» y va antes que
        # «SUELDO»: una fecha leída como sueldo daba 6.897 plazas en RD$0.
        # «F-INGRESO» (Registro Inmobiliario) es la fecha de ingreso abreviada:
        # sus números de serie (44522) pasaban por sueldos y ningún control lo
        # veía. Nada «NETO» es sueldo: la foto es de sueldo bruto, y una fuente
        # que solo publica el neto (INDRHI, FARD) queda fuera, no se mezcla.
        if m["sueldo"] is None and "APORT" not in k and "FECHA" not in k \
                and not k.startswith("FINGRESO") and "NETO" not in k and (
                "SUELDOBRUTO" in k or "INGRESOBRUTO" in k or "SUELDOFIJO" in k
                or "SUELDOBASE" in k or k in ("SUELDO", "SBASE")
                or k.startswith("SUELDO") or "INGRESO" in k
                or k in ("SALARIOBRUTO", "SALARIO", "SALARIOBASE")
                # Ampliación del 2026-09-24, cada una vista en su archivo:
                # «S. BRUTO» (INAPA), «Suedo bruto» (IDOPPRIL), «Total Bruto»
                # (Ayuntamiento de San Francisco de Macorís), «SALARIO BASE»
                # (Defensa Pública, gemelo de «SUELDO BASE»), y «MENSUAL»
                # (SISALRIL), comprobado fila a fila: MENSUAL − RETENCIONES =
                # NETO A PAGAR.
                or k in ("SBRUTO", "SUEDOBRUTO", "TOTALBRUTO", "MENSUAL")):
            m["sueldo"] = i
        # «PUESTO» / «NOMBRE DEL PUESTO»: DIGEPRES y Lotería Nacional (2026-09-23).
        # «LUGAR DE FUNCIONES» (Cultura) es un sitio, no un puesto.
        # «SUELDO CARGO» (Ejército) es un monto, no un puesto. «POSICIÓN» y
        # «PUESTO O DESIGNACIÓN» (OPRET, CESMET, CESFRONT, MAPRE, HDSSD) sí.
        if m["cargo"] is None and "LUGAR" not in k and "SUELDO" not in k \
                and "SALARIO" not in k and (
                "CARGO" in k or "FUNCI" in k or k == "RANGO"
                or k in ("PUESTO", "NOMBREDELPUESTO", "POSICION")
                or k.startswith("PUESTOODESIGNACI")):
            m["cargo"] = i
        if m["area"] is None and ("DEPARTAMENTO" in k or "OFICINA" in k
                or k == "AREA" or "NOMBREAREA" in k or "LUGAR" in k
                or k == "REGION" or "UNIDAD" in k or "DIRECCION" in k
                or k in ("DEPENDENCIA", "UBICACION")):
            m["area"] = i
        if m["mes"] is None and (k == "MES" or "PERIODOMES" in k or k.endswith("MES")):
            m["mes"] = i
        if m["anio"] is None and (k in ("ANO", "AO", "ANIO", "PERIODO") or "ANO" in k):
            m["anio"] = i
    # Una columna exacta de cargo gana a la primera que solo lo contenga.
    for i, h in enumerate(header):
        if hkey(h) in ("CARGO", "CARGOTITULAR"):
            m["cargo"] = i
            break
    # Una columna exacta de sueldo gana a la primera que solo lo contenga.
    for i, h in enumerate(header):
        if hkey(h) in ("SUELDO", "SUELDOBRUTO", "SALARIO", "SALARIOBRUTO"):
            m["sueldo"] = i
            break
    return m


def read_rows(path):
    raw = open(path, "rb").read()
    enc = decode_best(raw)
    lines = raw.decode(enc, errors="replace").splitlines()
    if not lines:
        return [], enc
    # El delimitador se decide sobre la primera línea con alguno, sin las
    # columnas vacías del final: CNSS parte la cabecera en varias líneas entre
    # comillas («"Reg.⏎No."») e INM empaqueta cada fila con «;» y la cierra
    # con «,,,,,,».
    sonda = next((l for l in lines[:5] if l.count(";") + l.count(",")), lines[0]).rstrip(",; \t")
    delim = ";" if sonda.count(";") > sonda.count(",") else ","
    reader = csv.reader(lines, delimiter=delim)
    header = next(reader, [])
    cm = col_map(header)
    faltan = [k for k in ("sueldo", "cargo", "mes", "anio") if cm[k] is None]
    if faltan:
        raise SystemExit(f"{path}: sin columnas {faltan} · header={header}")
    need = max(x for x in cm.values() if x is not None)
    rows = []
    for r in reader:
        if len(r) <= need:
            continue
        mes = parse_month(r[cm["mes"]])
        try:
            anio = int(re.sub(r"\D", "", r[cm["anio"]])[:4])
        except ValueError:
            anio = 0
        if not mes or anio < 2015 or anio > 2030:
            continue
        cargo = " ".join(r[cm["cargo"]].split()).strip() or "(sin cargo)"
        area = (" ".join(r[cm["area"]].split()).strip()
                if cm["area"] is not None else "")
        rows.append((anio, mes, area, cargo, parse_money(r[cm["sueldo"]])))
    return rows, enc


# Qué parece el nombre de una dependencia y no el de un puesto.
DEPENDENCIA = re.compile(
    r"^(DIRECCI|SUB-?DIRECCI|DEPARTAMENTO|DEPTO|DIVISI|SECCI|OFICINA|UNIDAD|"
    r"GERENCIA|VICEMINISTERIO|DESPACHO|REGIONAL|CONSULTOR[IÍ]A)", re.I)
TOTAL = re.compile(r"^(MONTO\s+)?TOTAL\b", re.I)
SEXO = {"M", "F", "MASCULINO", "FEMENINO"}
# Instituciones donde un sueldo 0 no es un error del parser sino otra moneda.
# MIREX paga en US$ al personal en el exterior (columna «SUELDO BRUTO US$»):
# no se mezclan monedas, así que esas plazas se dejan fuera y se declara.
SOLO_PESOS = {"MIREX"}
# Fuentes que no se pueden leer sin adivinar, con el porqué. Quedan fuera de
# la instantánea y lo dice /fuentes.
EXCLUIDAS = {
    # Escribe unos sueldos con decimales («13500») y otros sin el punto
    # («1335219» por 13,352.19): no hay forma segura de saber cuál es cuál.
    "ICM": "sueldos sin separador decimal, ilegibles sin adivinar",
}


def sanear(code, rows):
    """Arregla lo que la fuente cambió a mitad del archivo y falla si queda
    algo imposible. Cada regla viene de un defecto visto el 2026-09-23."""
    # La fila de total que algunas fuentes cuelan como una plaza (SVSP).
    rows = [r for r in rows if not (TOTAL.match(r[3]) or TOTAL.match(r[2]))]
    if code in SOLO_PESOS:
        rows = [r for r in rows if r[4] > 0]
    n = len(rows) or 1
    # Cargo y área cambiados de columna en los meses recientes (IAD, CGR): la
    # cabecera no cambió, las filas sí.
    cargo_dep = sum(1 for r in rows if DEPENDENCIA.match(r[3])) / n
    area_dep = sum(1 for r in rows if DEPENDENCIA.match(r[2])) / n
    if cargo_dep > 0.5 and area_dep < 0.2:
        rows = [(a, m, cargo, area, s) for (a, m, area, cargo, s) in rows]
        print(f"  ~ {code}: cargo y área venían cambiados; se corrigen")
    # Una columna de área que en realidad trae el sexo (INABIMA): se vacía.
    con_area = [r for r in rows if r[2]]
    if con_area and sum(1 for r in con_area if r[2].upper() in SEXO) / len(con_area) > 0.8:
        rows = [(a, m, "", c, s) for (a, m, _, c, s) in rows]
        print(f"  ~ {code}: el área traía el sexo; se descarta")
    # Controles: si fallan, la instantánea no se escribe.
    ceros = sum(1 for r in rows if r[4] <= 0) / n
    if ceros > 0.05:
        raise SystemExit(f"{code}: {ceros:.0%} de las plazas del mes en RD$0 — ¿columna de sueldo equivocada?")
    total = sum(r[4] for r in rows) or 1
    mayor = max(rows, key=lambda r: r[4]) if rows else None
    if mayor and len(rows) > 5 and mayor[4] / total > 0.4:
        raise SystemExit(f"{code}: una fila ({mayor[3]}) es el {mayor[4] / total:.0%} de la masa — ¿un total colado?")
    if len(rows) > 5:
        sueldos = sorted(r[4] for r in rows)
        mediana = sueldos[len(sueldos) // 2] or 1
        if sueldos[-1] / mediana > 40:
            raise SystemExit(f"{code}: un sueldo es {sueldos[-1] / mediana:.0f} veces la mediana — ¿decimales perdidos?")
    if sum(1 for r in rows if DEPENDENCIA.match(r[3])) / n > 0.5:
        raise SystemExit(f"{code}: la mayoría de los «cargos» parecen dependencias")
    # Sin puesto no hay foto de cargos: ProDominicana llama «Posición» a la
    # dependencia y, cambiadas las columnas, el cargo queda vacío.
    if sum(1 for r in rows if r[3] in ("", "(sin cargo)")) / n > 0.5:
        raise SystemExit(f"{code}: la mayoría de las plazas no tiene cargo")
    # Un «cargo» que es un número es una columna de montos leída como puesto
    # (el Ejército publica «SUELDO CARGO»). Control añadido el 2026-09-24.
    if sum(1 for r in rows if re.fullmatch(r"[\d.,$\s-]+", r[3])) / n > 0.05:
        raise SystemExit(f"{code}: los «cargos» son números — ¿columna de montos leída como puesto?")
    return rows


def ultimo_mes(rows):
    """El período más reciente que no esté en el futuro (hay filas mal fechadas)."""
    hoy = datetime.date.today()
    tope = hoy.year * 100 + hoy.month
    claves = [a * 100 + m for a, m, *_ in rows if a * 100 + m <= tope]
    if not claves:
        return None
    key = max(claves)
    return key // 100, key % 100, [r for r in rows if r[0] * 100 + r[1] == key]


def urls_de(urls):
    """Una fuente puede publicar su nómina en varios archivos (fijos aparte de
    contratados, o por programa): el manifiesto acepta una tupla."""
    if not urls:
        return []
    return [urls] if isinstance(urls, str) else list(urls)


def archivos(code):
    """Rutas locales de una fuente: CODE.csv, CODE-2.csv, CODE-3.csv…"""
    n = max(1, len(urls_de(MANIFEST[code][1])))
    return [os.path.join(DIR, f"{code}.csv" if i == 0 else f"{code}-{i + 1}.csv")
            for i in range(n)]


def descargar():
    """Baja cada CSV: UA identificable, un reintento, `content-type` validado
    (un 200 puede ser una página HTML) y, en datos.gob.do, la pausa de diez
    segundos que pide su `Crawl-Delay`."""
    import time
    os.makedirs(DIR, exist_ok=True)
    import io
    import zipfile
    ultimo = {}  # host -> instante de la última petición
    for code, (_, urls) in MANIFEST.items():
        for dest, url in zip(archivos(code), urls_de(urls)):
            host = urllib.parse.urlsplit(url).hostname or ""
            # datos.gob.do pide `Crawl-Delay: 10`; al resto, dos segundos.
            pausa = (10 if host.endswith("datos.gob.do") else 2) - (time.time() - ultimo.get(host, 0))
            if pausa > 0:
                time.sleep(pausa)
            print(f"  ↓ {code} ← {url[:80]}…")
            for intento in (1, 2):
                ultimo[host] = time.time()
                try:
                    req = urllib.request.Request(url, headers={"User-Agent": UA})
                    with urllib.request.urlopen(req, timeout=120) as r:
                        tipo = r.headers.get("Content-Type", "")
                        if "html" in tipo.lower():
                            raise ValueError(f"respondió {tipo}, no un CSV")
                        datos = r.read()
                    if datos[:2] == b"PK":
                        # Agricultura sirve su «CSV» dentro de un ZIP con un
                        # solo .csv; un ODS (también ZIP) no trae ninguno.
                        z = zipfile.ZipFile(io.BytesIO(datos))
                        csvs = [n for n in z.namelist() if n.lower().endswith(".csv")]
                        if len(csvs) != 1:
                            raise ValueError(f"ZIP sin un único CSV: {z.namelist()[:5]}")
                        datos = z.read(csvs[0])
                    if datos.lstrip()[:1] == b"<":
                        raise ValueError("el cuerpo es HTML, no un CSV")
                    with open(dest, "wb") as f:
                        f.write(datos)
                    break
                except Exception as err:  # noqa: BLE001 — se reporta y se sigue
                    if intento == 2:
                        print(f"  ! {code}: {err}")


def main():
    if "--descargar" in sys.argv:
        descargar()

    inst_meta, ai, ci = [], [], []
    di_a, di_c = {}, {}
    rows_out = []

    def idx(d, arr, v):
        if v not in d:
            d[v] = len(arr)
            arr.append(v)
        return d[v]

    for code, (nombre, _) in MANIFEST.items():
        if code in EXCLUIDAS:
            print(f"  - {code}: fuera — {EXCLUIDAS[code]}")
            continue
        paths = archivos(code)
        faltan = [p for p in paths if not os.path.exists(p)]
        if faltan:
            print(f"  ! {code}: falta {faltan[0]} (correr con --descargar)")
            continue
        rows, tope = [], None
        for path in paths:
            filas, enc = read_rows(path)
            rows += filas
            # Con varios archivos, el mes de la foto es el último que publican
            # todos: si uno va adelantado, la foto no sale con la mitad.
            lt1 = ultimo_mes(filas)
            if lt1:
                k1 = lt1[0] * 100 + lt1[1]
                tope = k1 if tope is None else min(tope, k1)
        lt = ultimo_mes([r for r in rows if tope and r[0] * 100 + r[1] <= tope])
        if not lt:
            print(f"  ! {code}: sin filas válidas")
            continue
        a, m, mrows = lt
        mrows = sanear(code, mrows)
        ii = len(inst_meta)
        masa = sum(r[4] for r in mrows)
        inst_meta.append({"codigo": code, "nombre": nombre, "anio": a, "mes": m,
                          "plazas": len(mrows), "masa": masa})
        for (_, _, area, cargo, sueldo) in mrows:
            rows_out.append([ii, idx(di_a, ai, area or "(sin área)"),
                             idx(di_c, ci, cargo), sueldo])
        print(f"  {code:9s} {nombre[:40]:42s} {a}-{m:02d} · {len(mrows):6,} plazas · {enc}")

    data = {
        "generatedAt": datetime.date.today().isoformat(),
        "esquema": "transversal-ultimo-mes",
        "currency": "DOP",
        "monthNames": MONTH_NAMES,
        "instituciones": inst_meta,
        "areas": ai,
        "cargos": ci,
        "rows": rows_out,
    }
    out = os.path.normpath(OUT)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    json.dump(data, open(out, "w", encoding="utf-8"),
              ensure_ascii=False, separators=(",", ":"))
    tot = sum(i["plazas"] for i in inst_meta)
    masa = sum(i["masa"] for i in inst_meta)
    print(f"\n{len(inst_meta)} instituciones · {tot:,} plazas · masa mensual "
          f"RD${masa:,.0f} · {len(ai)} áreas · {len(ci)} cargos "
          f"-> {out} ({os.path.getsize(out) / 1e6:.2f} MB)")


if __name__ == "__main__":
    main()
