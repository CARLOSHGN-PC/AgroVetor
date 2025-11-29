import pytest
import requests

# Base URL do backend (ajuste conforme necessário para o ambiente de teste)
BASE_URL = "http://localhost:3001"

@pytest.mark.asyncio
async def test_endpoint_reports_requires_authentication():
    """
    Testa se o endpoint de relatórios rejeita requisições sem token de autenticação.

    Vulnerabilidade Identificada: Atualmente, os endpoints em server.js não validam
    o token JWT, permitindo acesso não autorizado (IDOR).

    Comportamento Esperado (Seguro): Status 401 Unauthorized ou 403 Forbidden.
    Comportamento Atual (Bug): Status 200 OK (ou 500 se faltar param, mas passa auth).
    """

    # Tenta acessar um relatório sem header Authorization
    # Passamos parâmetros mínimos para evitar erro 400 de validação de input, focando na auth.
    params = {
        "inicio": "2023-01-01",
        "fim": "2023-01-31",
        "companyId": "empresa_teste_qualquer"
    }

    try:
        response = requests.get(f"{BASE_URL}/reports/brocamento/pdf", params=params)

        # Se a segurança estivesse implementada, isso deveria ser 401 ou 403.
        # Se retornar 200 (sucesso) ou 500 (erro interno de proc), significa que passou pela camada de auth.

        # Para fins de demonstração do bug, vamos afirmar que esperamos um 401.
        # Este teste DEVE FALHAR se o bug existir.
        assert response.status_code in [401, 403], \
            f"FALHA DE SEGURANÇA: Endpoint acessível sem autenticação! Status: {response.status_code}"

    except requests.exceptions.ConnectionError:
        pytest.skip("Backend server not running at localhost:3001")

@pytest.mark.asyncio
async def test_endpoint_os_creation_requires_authentication():
    """
    Testa se a criação de O.S. exige autenticação.
    """
    payload = {
        "companyId": "empresa_teste",
        "farmId": "123",
        "farmName": "Fazenda Teste",
        "selectedPlots": ["T-01"],
        "totalArea": 10
    }

    try:
        response = requests.post(f"{BASE_URL}/api/os", json=payload)

        assert response.status_code in [401, 403], \
            f"FALHA DE SEGURANÇA: Criação de O.S. permitida sem autenticação! Status: {response.status_code}"

    except requests.exceptions.ConnectionError:
        pytest.skip("Backend server not running at localhost:3001")
