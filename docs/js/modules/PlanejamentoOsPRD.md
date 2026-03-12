# PRD Técnico - Planejamento O.S. (AgroVetor)

## 1. Contexto e Resumo
O **Planejamento O.S.** é um módulo focado em desktop (web) para gerar ordens de serviço a partir de um planejamento estruturado. Ele consome dados de apontamentos importados pelo "Motor Universal de Importação (O.S)" para calcular e sugerir a próxima operação (aplicação/sequência) de cada talhão.

## 2. Arquitetura do Módulo
- **Frontend (UI):** PWA (`docs/index.html` e css interno).
- **Lógica e Estado:** Vanilla JS. O módulo terá seu próprio arquivo `docs/js/modules/PlanejamentoOsModule.js` que se integrará ao `App` global do `docs/app.js`.
- **Backend/Storage:** Firebase Firestore (Nuvem) + IndexedDB (Local). Usa o `App.data` e `OfflineDB` existentes.

## 3. Desenho do Frontend
- **Acesso:** Menu lateral -> Ordem de Serviço -> Planejamento O.S.
- **Tela Principal (Formulário O.S.):**
  - Cabeçalho: Empresa, Fazenda, Subgrupo, Operação, Tipo de Serviço, Programa, Data Planejada, Responsável, Observações.
  - Seleção de Talhões: Toggle entre Lista e Mapa SHP (reutilizando a lógica do `Criar O.S. Manual`).
- **Abas Auxiliares:**
  - *Planejamentos Salvos:* Lista de planejamentos em rascunho/prontos.
  - *Histórico:* Planejamentos já convertidos em O.S.
  - *Alertas/Pendências:* Talhões sem histórico confiável aguardando revisão manual.

## 4. Modelagem de Dados
**Coleção `os_planejamento_cabecalho`:**
- `id` (String)
- `empresaId`, `fazendaId`
- `subgrupoId`, `operacaoId`, `tipoServico`, `programa`
- `dataPlanejada`, `responsavelId`, `observacoes`
- `status` ('RASCUNHO', 'PRONTO_PARA_OS', 'CONVERTIDO')
- `os_gerada_id` (ID da O.S. final, se aplicável)
- `dataCriacao`, `dataAtualizacao`

**Coleção `os_planejamento_itens`:**
- `id` (String)
- `planejamentoId` (FK para cabecalho)
- `talhaoId`
- `ultima_aplicacao_data`, `ultima_aplicacao_id`, `sequencia_atual` (Dados do Motor Universal)
- `aplicacao_sugerida`, `sequencia_sugerida`
- `revisao_necessaria` (Boolean)
- `dados_ajustados_manualmente` (Boolean)

**Coleção `ordens_servico` (existente):**
- Adição do campo `planejamento_origem_id`.

## 5. Integração com Motor Universal
- O módulo consultará a coleção `apontamentos_os_importados` (ou o estado local equivalente carregado do Firebase) buscando os últimos registros filtrados por `fazendaId` e `talhaoId` selecionados.

## 6. Integração com Mapa SHP
- A seleção de talhões usando mapa vai utilizar a infraestrutura do Mapbox do AgroVetor (`App.state.osMap`, ou uma instância dedicada `App.state.planOsMap`).
- Permitirá seleção múltipla de polígonos com feedback visual (ex: verde para selecionado, amarelo para "revisão necessária").

## 7. Regras de Negócio
- Se a sequência atual de um apontamento para a operação "X" no talhão "Y" for "2", sugerir sequência "3" e a respectiva próxima aplicação do cronograma.
- Se não houver histórico para a operação selecionada no talhão, marcar `revisao_necessaria = true` e obrigar o usuário a preencher os campos `aplicacao_sugerida` e `sequencia_sugerida` manualmente.
- Um planejamento em 'RASCUNHO' não gera O.S.
- 'PRONTO_PARA_OS' bloqueia a edição dos talhões (ou pede confirmação) e libera um botão para "Gerar O.S."
- Ao gerar O.S., o status do planejamento muda para 'CONVERTIDO' e a O.S. é criada na coleção `ordens_servico` no status 'PLANEJADA'.

## 8. Estados e Status
- **Planejamento:** RASCUNHO, PRONTO_PARA_OS, CONVERTIDO.
- **Talhão (Item):** AUTOMATICO (dados confiáveis), REVISAO_PENDENTE, REVISADO_MANUALMENTE.

## 9. Plano de Implementação por Fases
- **Fase 1:** Esqueleto da UI (`index.html`), registro de rotas/menu, e estrutura de dados vazia no `app.js` e `PlanejamentoOsModule.js`.
- **Fase 2:** Formulário de Cabeçalho (Empresa, Fazenda, etc.) e gravação básica de rascunho (`os_planejamento_cabecalho`).
- **Fase 3:** Seleção de Talhões por Lista + Integração com Motor Universal para Sugestão de Sequência e gravação de itens.
- **Fase 4:** Integração com Mapa SHP para seleção visual.
- **Fase 5:** Conversão de Planejamento em O.S. e fluxo de estados completo.

## 10. Riscos Técnicos
- Concorrência de memória com o Mapbox caso a aba `Criar O.S. Manual` e `Planejamento O.S.` tentem renderizar o mapa em paralelo. **Mitigação:** Destruir ou esconder ativamente a instância do mapa não visível ou usar o mesmo mapa e trocar o contexto de dados.
- Lentidão ao processar histórico de apontamentos para centenas de talhões simultaneamente. **Mitigação:** Processar em batch/Web Worker se necessário.

## 11. Checklist de Aceite
- [ ] O menu "Planejamento O.S." está visível e funcional.
- [ ] A tela possui o cabeçalho e a lista de talhões.
- [ ] O estado salva no IndexedDB e Firebase (`os_planejamento_cabecalho` e `itens`).
- [ ] Sugestões de sequência funcionam baseadas em dados importados.
- [ ] É possível salvar rascunho sem quebrar outros módulos.
