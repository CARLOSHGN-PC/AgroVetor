"""
Define a classe Fazenda, que representa uma fazenda no sistema.
"""

class Fazenda:
    """Representa uma fazenda com seus atributos."""
    def __init__(self, id: int, nome: str, localizacao: str):
        self.id = id
        self.nome = nome
        self.localizacao = localizacao

    def __repr__(self) -> str:
        return f"Fazenda(id={self.id}, nome='{self.nome}')"
