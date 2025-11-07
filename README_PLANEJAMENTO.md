# Documentação do Módulo de Planejamento e Execução Aérea

## 1. Visão Geral

Este documento detalha a estrutura e o funcionamento do novo módulo de **Planejamento e Execução de Instalação de Armadilhas**, que evolui a funcionalidade de "Monitoramento Aéreo" existente. O desenvolvimento foi realizado de forma incremental e não-invasiva, preservando 100% da funcionalidade original do sistema.

O módulo completo abrange três fases principais:
1.  **Planejamento (Parte 1):** Criação de pontos de instalação planejados diretamente no mapa.
2.  **Ordem de Serviço (Parte 2):** Agrupamento de pontos planejados em Ordens de Serviço (OS) transacionais.
3.  **Execução (Parte 3):** Registro da instalação em campo, com captura de fotos e integração com a base de armadilhas existente.

## 2. Estrutura de Dados no Firestore

Para suportar o novo fluxo, as seguintes coleções foram adicionadas ao Firestore. Nenhuma coleção existente foi modificada.

### `instalacaoPlanejamentos`

Armazena os planejamentos macro. Um planejamento pode agrupar múltiplos pontos.

| Campo | Tipo | Descrição |
| :--- | :--- | :--- |
| `id` | `string` | ID automático gerado pelo Firestore. |
| `nome` | `string` | (Opcional) Nome descritivo para o planejamento. |
| `fazendaId` | `string` | ID da fazenda associada. |
| `talhaoId` | `string` | ID do talhão associado. |
| `criadoPorUserId`| `string` | ID do usuário que criou o planejamento. |
| `criadoEm` | `Timestamp` | Data/hora (UTC) da criação. |
| `status` | `string` | Status do planejamento: "Planejado" ou "Cancelado". |
| `meta` | `number` | (Opcional) Meta numérica para o planejamento. |
| `syncStatus` | `string` | Status de sincronização para operações offline. |

---

### `instalacaoPontos`

Armazena cada ponto de instalação individual, criado durante a fase de planejamento.

| Campo | Tipo | Descrição |
| :--- | :--- | :--- |
| `id` | `string` | ID automático gerado pelo Firestore. |
| `planejamentoId`| `string` | ID do `instalacaoPlanejamentos` ao qual o ponto pertence. |
| `osId` | `string` | ID da `instalacaoOrdensDeServico` após o ponto ser incluído em uma OS. |
| `armadilhaId` | `string` | ID da `armadilhas` após a execução. |
| `fazendaId` | `string` | ID da fazenda onde o ponto está localizado. |
| `talhaoId` | `string` | ID do talhão onde o ponto está localizado. |
| `coordenadas` | `map` | Objeto com `{ lat: number, lng: number }`. |
| `dataPrevistaInstalacao`| `date` | Data prevista para a instalação. |
| `responsavelId`| `string` | ID do usuário responsável (pode ser sobrescrito pela OS). |
| `status` | `string` | Ciclo de vida: "Planejado" -> "Em OS" -> "Instalado" / "Cancelado". |
| `criadoPorUserId`| `string` | ID do usuário que criou o ponto. |
| `criadoEm` | `Timestamp` | Data/hora (UTC) da criação. |
| `updatedEm` | `Timestamp` | Data/hora (UTC) da última atualização. |
| `fotoURLs` | `array` | (Pós-execução) Lista de URLs das fotos da instalação. |
| `dataInstalacao`| `Timestamp` | (Pós-execução) Data/hora real da instalação. |
| `concluidoPorUserId` | `string` | (Pós-execução) ID do usuário que executou a instalação. |
| `syncStatus` | `string` | Status de sincronização para operações offline. |

---

### `instalacaoOrdensDeServico`

Documento transacional que agrupa um ou mais `instalacaoPontos` para execução.

| Campo | Tipo | Descrição |
| :--- | :--- | :--- |
| `id` | `string` | ID automático gerado pelo Firestore. |
| `numeroOS` | `string` | Número único e sequencial no formato `OS-AAAA-NNN`. |
| `ano` | `number` | Ano da OS, para o contador sequencial. |
| `sequencial` | `number` | Sequencial numérico da OS dentro do ano. |
| `pontosIds` | `array` | Lista de IDs dos `instalacaoPontos` incluídos nesta OS. |
| `responsavelOSId`| `string` | ID do usuário responsável pela execução de todos os pontos da OS. |
| `dataCriacao` | `Timestamp` | Data/hora (UTC) da criação da OS. |
| `prazoExecucao`| `date` | (Opcional) Prazo para conclusão da OS. |
| `status` | `string` | Ciclo de vida: "Planejada" -> "Em Execução" -> "Concluída" / "Atrasada" / "Cancelada". |
| `observacoes` | `string` | Observações gerais sobre a OS. |
| `criadoPorUserId`| `string` | ID do usuário que gerou a OS. |
| `criadoEm` | `Timestamp` | Data/hora (UTC) da geração. |
| `syncStatus` | `string` | Status de sincronização para operações offline. |

---

### `osCounters`

Coleção auxiliar para garantir a geração de números de OS únicos e sequenciais de forma atômica.

| Documento ID | Campo | Tipo | Descrição |
| :--- | :--- | :--- | :--- |
| `AAAA` (ano) | `lastSeq` | `number` | O último número sequencial usado para uma OS naquele ano. |

---

### `armadilhas` (Coleção Existente - Integração)

A coleção `armadilhas` existente é utilizada como o repositório canônico final. Durante a execução de um `instalacaoPontos`, o sistema realiza uma operação de "find-or-upsert":

1.  **Busca:** Procura por uma `armadilha` existente dentro de um raio de 5 metros das coordenadas do ponto.
2.  **Criação (se não encontrada):** Se nenhuma armadilha existir, um novo documento é criado em `armadilhas`.
3.  **Atualização (se encontrada):** Se uma armadilha for encontrada, um novo registro de instalação é adicionado ao seu histórico, preservando todos os dados anteriores.

O campo `installationRecords` (um `array`) dentro de um documento `armadilha` armazena o histórico de todas as instalações realizadas naquele ponto físico, garantindo rastreabilidade completa.
