"""
Ponto de entrada principal para a simulação do sistema PIGA.
"""
from datetime import date
from piga.services.planning_service import PlanningService
from piga.reports.censo_varietal_report import generate_censo_varietal_report
from piga.reports.saldo_a_colher_report import generate_saldo_a_colher_report

def popular_dados(service: PlanningService):
    """
    Adiciona dados de exemplo ao sistema para simulação.
    """
    print("\n--- 2. Cadastros Básicos ---")
    # Adiciona fazendas
    fazenda1 = service.add_fazenda(nome="Fazenda Esperança", localizacao="Sul de Minas")
    fazenda2 = service.add_fazenda(nome="Fazenda Boa Vista", localizacao="Mato Grosso")

    # Adiciona variedades
    var1 = service.add_variedade(nome="CTC9001")
    var2 = service.add_variedade(nome="RB867515")
    var3 = service.add_variedade(nome="IACSP95-5000")

    # Adiciona talhões
    talhao1 = service.add_talhao(fazenda_id=fazenda1.id, area_hectares=50.0)
    talhao2 = service.add_talhao(fazenda_id=fazenda1.id, area_hectares=75.5)
    talhao3 = service.add_talhao(fazenda_id=fazenda2.id, area_hectares=120.0)

    print("\n--- 3. Planejamento de Plantio (Safra 2024/2025) ---")
    service.create_plano_plantio(
        talhao_id=talhao1.id,
        variedade_id=var1.id,
        safra="2024/2025",
        data_plantio=date(2024, 3, 15)
    )
    service.create_plano_plantio(
        talhao_id=talhao2.id,
        variedade_id=var2.id,
        safra="2024/2025",
        data_plantio=date(2024, 4, 1)
    )
    service.create_plano_plantio(
        talhao_id=talhao3.id,
        variedade_id=var1.id, # Plantando a mesma variedade em outra fazenda
        safra="2024/2025",
        data_plantio=date(2024, 4, 20)
    )

    print("\n--- 4. Emissão Manual de Ordens de Corte ---")
    # Ordem para o primeiro talhão, já concluída para o relatório de "saldo"
    ordem1 = service.create_ordem_corte_manual(
        talhao_id=talhao1.id,
        data_corte=date(2025, 8, 10),
        quantidade_toneladas=5000
    )
    # A forma correta de atualizar o status, usando o método do serviço
    service.update_ordem_corte_status(ordem_id=ordem1.id, status="Concluída")

    # Ordem para o segundo talhão, ainda pendente
    service.create_ordem_corte_manual(
        talhao_id=talhao2.id,
        data_corte=date(2025, 8, 25),
        quantidade_toneladas=7200
    )

def gerar_relatorios(service: PlanningService):
    """
    Chama as funções que geram todos os relatórios do sistema.
    """
    generate_censo_varietal_report(service)
    generate_saldo_a_colher_report(service)

def main():
    """
    Função principal que executa a simulação do PIGA.
    """
    print("--- Iniciando Sistema de Gestão Agrícola (PIGA) ---")

    # 1. Inicializa o serviço
    service = PlanningService()

    # 2. Popula com dados
    popular_dados(service)

    # 3. Gera Relatórios
    gerar_relatorios(service)

    print("\n\n--- Simulação e Geração de Relatórios Concluídas ---")

if __name__ == "__main__":
    main()
