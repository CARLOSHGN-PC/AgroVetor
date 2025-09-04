"""
Define a classe OrdemCorte, que representa uma ordem de corte para a colheita.
"""
from datetime import date

class OrdemCorte:
    """
    Representa uma ordem de corte para um talhão, com data e quantidade planejada.
    """
    def __init__(self, id: int, talhao_id: int, data_corte: date, quantidade_toneladas: float, status: str = "Pendente"):
        self.id = id
        self.talhao_id = talhao_id
        self.data_corte = data_corte
        self.quantidade_toneladas = quantidade_toneladas
        self.status = status  # Ex: "Pendente", "Concluída", "Cancelada"

    def __repr__(self) -> str:
        return f"OrdemCorte(id={self.id}, talhao_id={self.talhao_id}, status='{self.status}')"
