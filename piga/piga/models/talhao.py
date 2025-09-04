"""
Define a classe Talhao, que representa uma área de plantio (talhão).
"""

class Talhao:
    """Representa um talhão, com sua área e a fazenda a que pertence."""
    def __init__(self, id: int, fazenda_id: int, area_hectares: float):
        self.id = id
        self.fazenda_id = fazenda_id
        self.area_hectares = area_hectares

    def __repr__(self) -> str:
        return f"Talhao(id={self.id}, fazenda_id={self.fazenda_id}, area={self.area_hectares}ha)"
