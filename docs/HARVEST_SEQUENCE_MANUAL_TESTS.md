# Checklist Manual — Planejamento de Colheita por Frente

## 1) Fluxo online
- [ ] Abrir aba **Planejamento de Colheita**.
- [ ] Confirmar carregamento do mapa com polígonos (sem tela travada).
- [ ] Verificar legenda de frentes e indicadores (total/área/pendentes).
- [ ] Aplicar filtros por período, frente, fazenda, status e busca por talhão.
- [ ] Clicar em talhão no mapa e validar painel de detalhes.
- [ ] Reordenar sequência na lista (subir/descer) e validar numeração no mapa.
- [ ] Cancelar item da sequência e validar status **Cancelado**.

## 2) Fluxo offline
- [ ] Entrar no módulo sem internet após já ter carregado uma vez.
- [ ] Confirmar leitura de polígonos e dados de planejamento do cache local.
- [ ] Alterar sequência/atribuição em modo offline.
- [ ] Confirmar que mudanças ficam visíveis imediatamente no mapa/painel.

## 3) Alternância de rede e sincronização
- [ ] Com alterações pendentes offline, voltar a ficar online.
- [ ] Acionar botão **Sincronizar fila**.
- [ ] Confirmar que fila é processada sem deslogar.
- [ ] Validar status final no Firestore (`harvest_plans/{planId}/items`).

## 4) Cenário de conflito
- [ ] Usuário A altera sequência da mesma frente/período.
- [ ] Usuário B altera a mesma sequência em paralelo.
- [ ] Validar estratégia de última gravação ao sincronizar + registro em histórico.

## 5) Performance (muitos talhões)
- [ ] Carregar plano com alto volume (>= 2.000 polígonos).
- [ ] Validar que o mapa renderiza progressivamente e permanece navegável.
- [ ] Confirmar que filtros e busca respondem sem travar.

## 6) Relatórios backend
- [ ] Endpoint PDF operacional (`/reports/harvest-sequence/operational/pdf`) retorna arquivo válido.
- [ ] Endpoint Excel operacional (`/reports/harvest-sequence/operational/excel`) retorna `.xlsx` com colunas esperadas.
- [ ] Endpoint PDF mapa (`/reports/harvest-sequence/map/pdf`) inclui mapa, sequência, legenda e filtros.
- [ ] Testar PDF mapa em **A4** e **A3**.

## 7) Não regressão
- [ ] Validar módulo **Monitoramento Aéreo** (carregamento mapa, risco, busca de fazenda).
- [ ] Validar que regras de segurança continuam restringindo empresa correta.
