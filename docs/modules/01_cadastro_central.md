# Módulo 1: Cadastro Central (Core)

## 1. Propósito

Este módulo é a fundação de todo o sistema. Ele é responsável por gerenciar as entidades centrais que são utilizadas por todos os outros módulos. A consistência e a correta estruturação dos dados aqui são cruciais para o funcionamento de todo o FMIS.

## 2. Entidades Principais e Modelo de Dados

*   **Fazenda:**
    *   `id`: Identificador único
    *   `nome`: Nome da fazenda (ex: "Fazenda São João")
    *   `cnpj_cpf`: Documento do proprietário
    *   `endereco`: Endereço da sede
    *   `cidade`: Cidade
    *   `estado`: Estado
    *   `area_total_ha`: Área total em hectares

*   **Talhão (Lote):**
    *   `id`: Identificador único
    *   `fazenda_id`: Chave estrangeira para a Fazenda
    *   `nome_identificador`: Nome ou número do talhão (ex: "Talhão 05A")
    *   `area_ha`: Área do talhão em hectares
    *   `geometria`: Campo para armazenar dados de georreferenciamento (polígono, formato GeoJSON).

*   **Cultura:**
    *   `id`: Identificador único
    *   `nome_popular`: Nome da cultura (ex: "Soja")
    *   `nome_cientifico`: Nome científico (ex: "Glycine max")
    *   `variedades`: Lista de variedades possíveis (ex: "BMX Potência", "Monsoy 6410")

*   **Safra:**
    *   `id`: Identificador único
    *   `nome`: Nome da safra (ex: "Safra 2023/2024", "Safrinha Milho 2024")
    *   `data_inicio`: Data de início do período da safra
    *   `data_fim`: Data de fim do período da safra
    *   `cultura_id`: Chave estrangeira para a Cultura principal da safra

## 3. Funcionalidades Chave

*   CRUD (Create, Read, Update, Delete) completo para todas as entidades acima.
*   Interface de mapa para visualização e desenho/edição dos polígonos dos talhões.
*   Validações para garantir que a soma das áreas dos talhões não ultrapasse a área total da fazenda.
*   API RESTful com endpoints para cada entidade (ex: `/api/fazendas`, `/api/talhoes`).
