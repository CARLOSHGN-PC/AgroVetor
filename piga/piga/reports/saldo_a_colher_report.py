"""
Módulo para geração do relatório de Saldo a Colher.
"""
from piga.services.planning_service import PlanningService

def generate_saldo_a_colher_report(service: PlanningService):
    """
    Gera e imprime o relatório de Saldo a Colher.
    Este relatório detalha as ordens de corte com status 'Pendente'.
    """
    print("\n\n--- Relatório: Saldo a Colher ---")

    ordens = service.get_all_ordens_corte()
    if not ordens:
        print("Nenhuma ordem de corte encontrada para gerar o relatório.")
        return

    # Filtra apenas as ordens que não estão 'Concluída'
    ordens_pendentes = [o for o in ordens if o.status != "Concluída"]

    print("\nDetalhes das Ordens de Corte Pendentes:")
    print("{:<10} | {:<25} | {:<15} | {:>20}".format("Talhão ID", "Fazenda", "Data de Corte", "Qtd. Pendente (ton)"))
    print("-" * 80)

    total_toneladas_pendente = 0
    if not ordens_pendentes:
        print("Nenhuma ordem de corte pendente encontrada.")
    else:
        # Ordena pela data de corte para melhor visualização
        for ordem in sorted(ordens_pendentes, key=lambda o: o.data_corte):
            talhao = service.get_talhao_by_id(ordem.talhao_id)
            if talhao:
                fazenda = service.get_fazenda_by_id(talhao.fazenda_id)
                nome_fazenda = fazenda.nome if fazenda else "Fazenda não encontrada"

                print("{:<10} | {:<25} | {:<15} | {:>20.2f}".format(
                    f"ID {talhao.id}",
                    nome_fazenda,
                    ordem.data_corte.strftime('%d/%m/%Y'),
                    ordem.quantidade_toneladas
                ))
                total_toneladas_pendente += ordem.quantidade_toneladas

    print("-" * 80)
    print("{:<53} | {:>20.2f}".format("SALDO TOTAL A COLHER (toneladas)", total_toneladas_pendente))
    print("-" * 80)
