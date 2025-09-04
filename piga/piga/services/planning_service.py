"""
Serviço para gerenciar a lógica de negócio de planejamento e colheita.
"""
from datetime import date
from typing import Dict, List, Optional

# Importa os modelos de dados
from ..models.fazenda import Fazenda
from ..models.talhao import Talhao
from ..models.variedade import Variedade
from ..models.plano_plantio import PlanoPlantio
from ..models.ordem_corte import OrdemCorte

class PlanningService:
    """
    Gerencia toda a lógica de negócio.

    Nesta implementação de MVP, simula um banco de dados em memória usando
    dicionários. Em um sistema de produção, isso seria substituído por
    uma conexão a um banco de dados real (ex: PostgreSQL, SQLite).
    """
    def __init__(self):
        # "Banco de dados" em memória
        self._fazendas: Dict[int, Fazenda] = {}
        self._talhoes: Dict[int, Talhao] = {}
        self._variedades: Dict[int, Variedade] = {}
        self._planos_plantio: Dict[int, PlanoPlantio] = {}
        self._ordens_corte: Dict[int, OrdemCorte] = {}

        # Contadores para simular IDs auto-incrementais
        self._next_fazenda_id = 1
        self._next_talhao_id = 1
        self._next_variedade_id = 1
        self._next_plano_id = 1
        self._next_ordem_id = 1

    def add_fazenda(self, nome: str, localizacao: str) -> Fazenda:
        fazenda = Fazenda(id=self._next_fazenda_id, nome=nome, localizacao=localizacao)
        self._fazendas[fazenda.id] = fazenda
        self._next_fazenda_id += 1
        print(f"Fazenda adicionada: {fazenda}")
        return fazenda

    def add_talhao(self, fazenda_id: int, area_hectares: float) -> Talhao:
        if fazenda_id not in self._fazendas:
            raise ValueError(f"ID de Fazenda não encontrado: {fazenda_id}")
        talhao = Talhao(id=self._next_talhao_id, fazenda_id=fazenda_id, area_hectares=area_hectares)
        self._talhoes[talhao.id] = talhao
        self._next_talhao_id += 1
        print(f"Talhão adicionado: {talhao}")
        return talhao

    def add_variedade(self, nome: str) -> Variedade:
        variedade = Variedade(id=self._next_variedade_id, nome=nome)
        self._variedades[variedade.id] = variedade
        self._next_variedade_id += 1
        print(f"Variedade adicionada: {variedade}")
        return variedade

    def create_plano_plantio(self, talhao_id: int, variedade_id: int, safra: str, data_plantio: date) -> PlanoPlantio:
        if talhao_id not in self._talhoes:
            raise ValueError(f"ID de Talhão não encontrado: {talhao_id}")
        if variedade_id not in self._variedades:
            raise ValueError(f"ID de Variedade não encontrada: {variedade_id}")

        plano = PlanoPlantio(
            id=self._next_plano_id,
            talhao_id=talhao_id,
            variedade_id=variedade_id,
            safra=safra,
            data_plantio=data_plantio
        )
        self._planos_plantio[plano.id] = plano
        self._next_plano_id += 1
        print(f"Plano de Plantio criado: {plano}")
        return plano

    def create_ordem_corte_manual(self, talhao_id: int, data_corte: date, quantidade_toneladas: float) -> OrdemCorte:
        if talhao_id not in self._talhoes:
            raise ValueError(f"ID de Talhão não encontrado: {talhao_id}")

        ordem = OrdemCorte(
            id=self._next_ordem_id,
            talhao_id=talhao_id,
            data_corte=data_corte,
            quantidade_toneladas=quantidade_toneladas
        )
        self._ordens_corte[ordem.id] = ordem
        self._next_ordem_id += 1
        print(f"Ordem de Corte criada: {ordem}")
        return ordem

    def update_ordem_corte_status(self, ordem_id: int, status: str) -> Optional[OrdemCorte]:
        """
        Atualiza o status de uma Ordem de Corte existente.
        """
        if ordem_id not in self._ordens_corte:
            print(f"Erro: Ordem de Corte com ID {ordem_id} não encontrada.")
            return None

        ordem = self._ordens_corte[ordem_id]
        ordem.status = status
        print(f"Status da Ordem de Corte {ordem_id} atualizado para '{status}'.")
        return ordem

    # Métodos "Get" para serem usados pelos relatórios
    def get_all_planos_plantio(self) -> List[PlanoPlantio]:
        return list(self._planos_plantio.values())

    def get_all_ordens_corte(self) -> List[OrdemCorte]:
        return list(self._ordens_corte.values())

    def get_talhao_by_id(self, id: int) -> Optional[Talhao]:
        return self._talhoes.get(id)

    def get_variedade_by_id(self, id: int) -> Optional[Variedade]:
        return self._variedades.get(id)

    def get_fazenda_by_id(self, id: int) -> Optional[Fazenda]:
        return self._fazendas.get(id)
