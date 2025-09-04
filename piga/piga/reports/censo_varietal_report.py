"""
Módulo para geração do relatório de Censo Varietal.
"""
from collections import defaultdict
from piga.services.planning_service import PlanningService

def generate_censo_varietal_report(service: PlanningService):
    """
    Gera e imprime o relatório de Censo Varietal.
    Este relatório mostra a área total plantada para cada variedade.
    """
    print("\n\n--- Relatório: Censo Varietal ---")

    planos = service.get_all_planos_plantio()
    if not planos:
        print("Nenhum plano de plantio encontrado para gerar o relatório.")
        return

    # Dicionário para agrupar a área por nome da variedade
    area_por_variedade = defaultdict(float)
    for plano in planos:
        talhao = service.get_talhao_by_id(plano.talhao_id)
        variedade = service.get_variedade_by_id(plano.variedade_id)

        if talhao and variedade:
            area_por_variedade[variedade.nome] += talhao.area_hectares

    print("\n{:<20} | {:>15}".format("Variedade", "Área Total (ha)"))
    print("-" * 38)

    total_area = 0
    # Ordena pelo nome da variedade para um relatório consistente
    for nome_variedade, area in sorted(area_por_variedade.items()):
        print("{:<20} | {:>15.2f}".format(nome_variedade, area))
        total_area += area

    print("-" * 38)
    print("{:<20} | {:>15.2f}".format("ÁREA TOTAL PLANTADA", total_area))
    print("-" * 38)
