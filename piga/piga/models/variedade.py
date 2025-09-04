"""
Define a classe Variedade, que representa uma variedade de cultura.
"""

class Variedade:
    """Representa uma variedade de cultura com um nome."""
    def __init__(self, id: int, nome: str):
        self.id = id
        self.nome = nome

    def __repr__(self) -> str:
        return f"Variedade(id={self.id}, nome='{self.nome}')"
