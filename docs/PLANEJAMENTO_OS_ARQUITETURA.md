# Planejamento O.S. — Arquitetura Técnica (AgroVetor)

## 1) Arquitetura técnica completa
- **Escopo funcional:** novo módulo `Planejamento O.S.` com foco em formulário operacional (web-only), sem criar novo upload.
- **Frontend (`docs/`):** módulo dedicado em `docs/js/modules/PlanejamentoOSModule.js`, acessado por aba `planejamentoOS` e desacoplado de `docs/app.js`.
- **Backend/Firestore:** persistência em duas coleções (`os_planejamento_cabecalho` + `os_planejamento_itens`) e vínculo posterior com `ordens_servico`.
- **Offline-first:** usa persistência offline do Firestore e estado local (`App.state`) para seleção e sugestões.
- **Integração de histórico:** leitura do histórico já importado pelo Motor Universal através dos dados conciliados em `ordens_servico.relatorio_execucao`.

## 2) Proposta de frontend
- Tela principal em **formulário** com campos de contexto operacional e seleção de múltiplos talhões.
- Bloco de inteligência para mostrar, por talhão:
  - última aplicação;
  - data da última aplicação;
  - sequência atual;
  - próxima sequência sugerida.
- Ações primárias:
  - salvar rascunho;
  - salvar planejamento;
  - salvar pronto para O.S.;
  - planejar e abrir O.S. agora.
- Áreas auxiliares previstas:
  - Planejamentos Salvos (Fase 1 entregue em resumo);
  - Alertas / Pendências / Histórico (Fase 2+).

## 3) Modelagem de dados
### `os_planejamento_cabecalho`
Campos base:
- `companyId`, `empresa`, `fazenda`, `subgrupo`, `operacao`, `tipo_servico`, `programa`, `data_planejada`, `responsavel`, `observacoes`
- `area_total_ha`, `qtde_talhoes`, `status`, `pronto_para_os`, `created_at`, `updated_at`

### `os_planejamento_itens`
Campos base:
- `planejamento_id`, `companyId`, `fazenda`, `talhao`, `area_ha`, `subgrupo`, `operacao`, `tipo_servico`, `programa`, `data_planejada`
- `ultima_aplicacao_nome`, `ultima_aplicacao_data`, `ultima_sequencia_identificada`
- `proxima_sequencia`, `proxima_aplicacao_nome`, `status_item`
- `apontamento_base_id`, `os_id`, `os_numero`, `created_at`, `updated_at`

### Ajuste recomendado em `ordens_servico`
- `planejamento_id`
- `planejamento_item_id`
- `origem_os = 'PLANEJAMENTO_OS' | 'MANUAL' | 'IMPORTACAO'`
- `subgrupo`, `programa`, `sequencia_aplicacao`, `data_planejada_origem`, `gerada_a_partir_de_planejamento`

## 4) Integração com Motor Universal (sem novo upload)
- O módulo utiliza as entradas já importadas/consolidadas pelo Motor Universal.
- Regra de leitura:
  1. buscar histórico por `talhao + operacao`;
  2. priorizar evento mais recente;
  3. inferir sequência atual;
  4. sugerir próxima sequência.

## 5) Integração com mapa SHP
- **Fase 1:** seleção por lista disponível + estrutura preparada.
- **Fase 2:** reutilizar estratégia do `Criar O.S. Manual` para seleção por polígono/camada SHP na web, mantendo foco no planejamento.

## 6) Regras de negócio
- Sem histórico confiável: marcar item como `REVISAO` e preencher sequência inicial configurável (`global_configs.planejamentoOS.sequenciaInicial`, fallback `1`).
- Com histórico válido: status item `SUGERIDO` e próxima sequência = última + 1.
- Permitir ajuste manual em próxima sequência e próxima aplicação antes de salvar.

## 7) Vínculo com `ordens_servico`
- Ao “Planejar e abrir O.S. agora”, transportar payload de contexto para abertura da O.S.
- Na Fase 2, completar criação automática de `ordens_servico` já vinculada ao cabeçalho/item de planejamento.

## 8) Plano de implementação por fases
### Fase 1 (entregue nesta evolução)
- Navegação/menu do módulo.
- Tela de formulário `Planejamento O.S.`.
- Seleção multi-talhão por lista.
- Sugestão básica por histórico importado (sem upload novo).
- Persistência em `os_planejamento_cabecalho` e `os_planejamento_itens`.

### Fase 2
- Seleção por mapa SHP com UX equivalente ao manual (web-only).
- Planejamentos salvos completos (edição, duplicação, versionamento).
- Alertas e pendências automatizadas.

### Fase 3
- Geração direta de O.S. a partir de planejamento e vínculo total em `ordens_servico`.
- Histórico e rastreabilidade ponta-a-ponta (planejamento → O.S. → execução).

## 9) Riscos técnicos
- Qualidade/consistência da sequência no histórico importado (campos textuais heterogêneos).
- Duplicação de itens se usuário salvar múltiplas vezes sem reconciliação de versão.
- Dependência de padronização de nomes de `talhao` e `operacao` para match.

## 10) Checklist de aceite
- [ ] módulo aparece no menu Ordem de Serviço.
- [ ] formulário carrega empresa/fazenda/operação/tipo serviço.
- [ ] seleção de múltiplos talhões por lista.
- [ ] sugestão por histórico sem upload adicional.
- [ ] salvar rascunho/planejado/pronto para O.S.
- [ ] planejamento persistido em cabeçalho + itens.
- [ ] “Planejar e abrir O.S. agora” disponível (handoff inicial para fluxo manual).

---

## Estrutura de arquivos novos
- `docs/js/modules/PlanejamentoOSModule.js`
- `docs/PLANEJAMENTO_OS_ARQUITETURA.md`

## Ordem exata de implementação (executável)
1. criar aba/tela no `index.html`;
2. criar módulo JS dedicado;
3. registrar módulo no `app.js` (import + menu + estado + init);
4. ativar persistência em coleções novas;
5. implementar sugestão por histórico já importado;
6. preparar gancho para abertura imediata de O.S.;
7. evoluir mapa SHP (Fase 2).

## Pontos do sistema atual alterados
- Navegação e menu de Ordem de Serviço.
- Estado global para armazenar planejamentos.
- Inicialização da aba `planejamentoOS`.
- Assinatura de coleções novas para cache/sincronia.
