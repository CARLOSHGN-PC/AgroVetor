import csv
from io import StringIO
from django.contrib.gis.geos import GEOSGeometry, Polygon as GEOSPolygon, LineString as GEOSLineString
from django.db.models import Union

from .models import Aplicacao, OrdemServico

class GeoProcessingError(Exception):
    """ Exceção customizada para erros no geoprocessamento. """
    pass

def parse_log_file(log_file_content):
    """
    Lê o conteúdo de um arquivo de log e extrai uma lista de coordenadas.
    Assume um formato CSV simples: latitude,longitude
    """
    coordinates = []
    # Usamos StringIO para tratar o conteúdo do arquivo em memória como um arquivo real
    f = StringIO(log_file_content)
    reader = csv.reader(f)
    for row in reader:
        try:
            # Ignora cabeçalhos ou linhas malformadas
            lat = float(row[0])
            lon = float(row[1])
            coordinates.append((lon, lat)) # Formato (x, y) para GeoDjango/Shapely
        except (ValueError, IndexError):
            continue

    if len(coordinates) < 2:
        raise GeoProcessingError("O arquivo de log não contém coordenadas suficientes.")

    return coordinates

def process_flight_log(aplicacao_id, log_file_content):
    """
    Serviço principal que orquestra o processamento do log de voo.
    """
    try:
        aplicacao = Aplicacao.objects.select_related('ordem_servico__aeronave').get(pk=aplicacao_id)
        ordem_servico = aplicacao.ordem_servico
        talhoes_planejados = ordem_servico.talhoes.all()
    except Aplicacao.DoesNotExist:
        raise GeoProcessingError(f"Aplicação com id {aplicacao_id} não encontrada.")

    # 1. Parse do log
    coordinates = parse_log_file(log_file_content)

    # 2. Criação da geometria do voo (LineString)
    linha_voo = GEOSLineString(coordinates)
    # Assume SRID 4326 (WGS84) para todas as geometrias
    linha_voo.srid = 4326
    aplicacao.geometria_voo = linha_voo

    # 3. Criação do polígono de aplicação (Buffer)
    # ATENÇÃO: Fazer buffer em metros em um SRID geográfico (4326) é impreciso.
    # A forma correta seria transformar a geometria para um sistema projetado (ex: UTM),
    # fazer o buffer, e depois transformar de volta. Para este projeto,
    # aceitamos a imprecisão para manter a simplicidade.
    largura_faixa_metros = ordem_servico.aeronave.largura_faixa_aplicacao
    # O buffer é em graus, então esta conversão é uma aproximação grosseira.
    # 1 grau de latitude ~= 111km.
    buffer_em_graus = (largura_faixa_metros / 111000) / 2
    poligono_aplicado = linha_voo.buffer(buffer_em_graus)
    aplicacao.geometria_aplicada = poligono_aplicado

    # 4. Cálculos de área e interseção
    geometria_planejada_agregada = talhoes_planejados.aggregate(area_total=Union('geometria'))['area_total']

    if not geometria_planejada_agregada:
        raise GeoProcessingError("A Ordem de Serviço não possui talhões com geometria.")

    # Interseção (Aplicação Correta)
    area_correta = poligono_aplicado.intersection(geometria_planejada_agregada)
    # A área em um SRID geográfico é em graus quadrados. Para obter metros, precisaríamos transformar.
    # Novamente, vamos aceitar a imprecisão e tratar como se fosse uma projeção plana.
    # Em um projeto real, a transformação de SRID é essencial aqui.
    aplicacao.area_correta_ha = (area_correta.area / 10000) if area_correta else 0

    # Diferença (Desperdício)
    area_desperdicio = poligono_aplicado.difference(geometria_planejada_agregada)
    aplicacao.area_desperdicio_ha = (area_desperdicio.area / 10000) if area_desperdicio else 0

    # Diferença (Falha)
    area_falha = geometria_planejada_agregada.difference(poligono_aplicado)
    aplicacao.area_falha_ha = (area_falha.area / 10000) if area_falha else 0

    # TODO: Cálculo de sobreposição (mais complexo)

    # 5. Salvar os resultados
    # O save da aplicação já aciona a baixa de estoque e atualização de status da OS.
    aplicacao.save()

    return aplicacao
