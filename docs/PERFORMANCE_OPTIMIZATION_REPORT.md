# Relatório de Performance - AgroVetor (PWA + Capacitor)

## Escopo aplicado
- Instrumentação com `PerfLogger` (IndexedDB + export JSON no perfil).
- Lazy-load para módulo pesado de Monitoramento Aéreo.
- Batching de sincronização com liberação explícita do event loop entre lotes.
- Debounce para pesquisa no mapa (redução de re-render/trabalho por tecla).

## Antes vs Depois (via PerfLogger)

> **Como coletar**: abrir app, autenticar, navegar até Home, abrir Monitoramento Aéreo e executar sincronização manual. Em seguida exportar em **Perfil > Diagnóstico (JSON)**.

| Métrica | Antes (baseline) | Depois (alvo com esta refatoração) |
|---|---:|---:|
| `boot_start -> firebase_init_end` | Coletar baseline no JSON antigo | Redução esperada por menor trabalho síncrono de startup |
| `boot_start -> offline_init_end` | Coletar baseline no JSON antigo | Redução esperada por bootstrap mais enxuto |
| `boot_start -> home_render_end` | Coletar baseline no JSON antigo | Redução esperada por adiamento do mapa |
| `module_open_start:end:monitoramentoAereo` | Coletar baseline no JSON antigo | Redução de travamento no primeiro acesso (loader + lazy-load) |
| `sync_start -> sync_end` | Coletar baseline no JSON antigo | Menor bloqueio perceptível da UI com lotes e yield |
| `sync_batch_*` | N/A | Disponível por lote (itens/lote + ms/lote) |

## Checklist de validação (PWA + Android)
- [ ] PWA abre e renderiza Home sem travar interação inicial.
- [ ] Monitoramento Aéreo abre com carregamento progressivo.
- [ ] Sincronização manual exibe progresso sem congelar a UI.
- [ ] Exportação de diagnóstico JSON funciona localmente.
- [ ] Fluxo offline continua: login offline, navegação e fila local.
- [ ] Android (Capacitor): build e navegação básica sem regressão.

## Comandos sugeridos
```bash
# PWA local
python3 -m http.server 4173 --directory docs

# Android (Capacitor)
npx cap sync android
cd android && ./gradlew assembleDebug
```
