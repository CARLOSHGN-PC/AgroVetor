"""
Define a classe PlanoPlantio, que representa o planejamento de plantio.
"""
from datetime import date

class PlanoPlantio:
    """
    Representa o plano de plantio, associando um talhão, uma variedade,
    uma safra e a data de plantio.
    """
    def __init__(self, id: int, talhao_id: int, variedade_id: int, safra: str, data_plantio: date):
        self.id = id
        self.talhao_id = talhao_id
        self.variedade_id = variedade_id
        self.safra = safra  # Ex: "2024/2025"
        self.data_plantio = data_plantio

    def __repr__(self) -> str:
        return f"PlanoPlantio(id={self.id}, talhao_id={self.talhao_id}, variedade_id={self.variedade_id})"
