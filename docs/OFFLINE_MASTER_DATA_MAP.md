# Offline Master Data Coverage (AgroVetor)

## Cadastros-base mapeados

| Cadastro | Onde é usado (módulos/telas) | Campo chave (id) | Campos de exibição | Relacionamentos / filtros |
|---|---|---|---|---|
| `fazendas` | Qualidade de Plantio, Planejamento/OS, Registro de Aplicação, relatórios e seletores de fazenda | `id` | `code`, `name` | `companyId`, `types`, `talhoes[]` |
| `talhoes` (embutido em `fazendas.talhoes`) | Combos dependentes Fazenda → Talhão em Qualidade/OS/Aplicação/Planejamento | `talhoes[].id` | `talhoes[].name`, `variedade`, `corte` | `fazendaId` (por contexto da fazenda), `ativo/status` |
| `personnel` | Colaboradores/operadores em KM/Frotas e formulários com matrícula | `id` | `name`, `matricula` | `companyId`, `matricula` |
| `frentesDePlantio` | Qualidade de Plantio e módulos de plantio | `id` | `name`, `providerType` | `companyId`, `ativo` |
| `tipos_servico` | Ordem de Serviço / Aplicação (tipo de serviço) | `id` | `descricao` | `companyId`, `ativo` |
| `operacoes` | Registro de Aplicação e regras de operação | `id` | `descricao` | `companyId`, `ativo` |
| `produtos` | Registro de Aplicação / cadastros auxiliares | `id` | `descricao`, `nome` | `companyId`, `ativo` |
| `operacao_produtos` | Relação operação × produto em formulários de aplicação | `id` | `operacao_id`, `produto_id` | `companyId`, `operacao_id`, `produto_id`, `ativo` |
| `ordens_servico` | Fluxos de O.S. manual/escritório e painéis | `id` | `numero`, `status` | `companyId`, `fazendaId`, `talhaoId` |
| `frota` | Gestão de frota e Controle KM | `id` | `codigo`, `placa`, `tipo` | `companyId`, `status` |
| `armadilhas` | Monitoramento aéreo/mapa (markers e detalhe) | `id` | `fazendaNome`, `talhaoNome`, `codigo` | `companyId`, `fazendaId`, `talhaoId`, datas |

## Causa raiz identificada

1. O app tinha listeners online (`onSnapshot`) para várias coleções, porém os cadastros-base não eram persistidos em store dedicada de master data por `companyId`.
2. Ao abrir sem rede/reabrir app offline, os estados de combos dependiam da memória do runtime e/ou do Firestore local sem fallback padronizado para leitura por coleção.
3. Relações como Fazenda → Talhão ficavam vazias quando o snapshot remoto falhava e não havia fallback local explícito com logs diagnósticos.

## Estratégia aplicada

- Persistência local de cadastros-base em `master_data` (IndexedDB), chaveada por `collection:companyId`, com `updatedAt` e `count`.
- Fallback automático em `subscribeTo`:
  - remoto com snapshot quando online;
  - local (`master_data`) em modo offline e em erro de snapshot.
- Pré-carga/sincronização online (`syncMasterData`) para garantir base local atualizada no login/abertura.
- Helper de resolução local para dependências de IDs (`resolveFazendaName`, `resolveTalhaoName`, `getTalhoesByFazenda`).
