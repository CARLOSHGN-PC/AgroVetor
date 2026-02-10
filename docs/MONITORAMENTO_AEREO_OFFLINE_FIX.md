# Monitoramento Aéreo — Diagnóstico e plano de validação

## Checklist de reprodução do bug
1. Abrir o módulo **Monitoramento Aéreo** online e navegar no mapa por alguns minutos.
2. Colocar app em background/lock screen ou fechar completamente.
3. Aguardar entre 30 min e 2h.
4. Reabrir app e voltar ao módulo.
5. Alternar conectividade (Wi‑Fi -> dados -> sem rede).
6. Validar logs de `monitoramento_logs` e console para:
   - `init_start`, `map_load`, `style_loaded`, `location_acquired`, `polygons_loaded_offline`.
   - `init_error`, `map_error`, `webgl_context_lost`, `mapbox_token_error`.

## Causa provável principal encontrada
- O Service Worker abria IndexedDB com **DB_VERSION=6**, mas tentava criar `offline-map-tiles` no bloco `if (oldVersion < 7)`.
- Como a versão era 6, esse upgrade nunca era executado, tornando o cache de tiles inconsistente e não confiável em reaberturas longas.
- Também havia inicialização do Mapbox sem rotina forte de destruição/reinicialização ao retomar ciclo de vida (background/foreground), permitindo estados quebrados do contexto WebGL.

## Correções implementadas
- Service Worker agora usa DB_VERSION=9 e intercepta também style/sprite/glyph do Mapbox para cache offline.
- `mapModule` recebeu lifecycle robusto:
  - `clearTransientMapState()` para destruir instância anterior.
  - `initMap(true)` ao entrar/reentrar na tela.
  - timeout de recovery + UI para recarregar mapa.
  - captura de `webglcontextlost` e `map.on('error')`.
- Telemetria dedicada em IndexedDB (`monitoramento_logs`) com exportação via Perfil.
- Novo store `offline-map-packs` para registrar downloads por área.

## Cenários manuais recomendados
- 10 aberturas seguidas do módulo, incluindo alternância de rede.
- Reabertura após 2 horas sem abrir o módulo.
- Offline total com área previamente baixada.
- Usuários com e sem permissão de monitoramento.

## Notas para Android/Capacitor
- Adicionados logs de lifecycle em `MainActivity` (`onCreate/onResume/onPause/onDestroy`) para correlacionar falhas de retomada com telemetria web do módulo.
- A estratégia atual privilegia WebView + SW + IndexedDB; se houver limitação de cache do WebView em dispositivos específicos, considerar plugin nativo de cache em filesystem como fallback.
