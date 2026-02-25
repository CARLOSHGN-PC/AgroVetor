# Monitoramento Aéreo — Arquitetura Híbrida Web + Android Nativo

## 1) Diagnóstico rápido do estado atual

- O módulo atual de Monitoramento Aéreo está centralizado em `docs/app.js` no objeto `App.mapModule`.
- O mapa Web é inicializado em `initMap()` com `mapboxgl.Map`.
- A carga de contornos (SHP -> GeoJSON -> cache) passa por:
  - `loadContoursOfflineSafe()`
  - `_loadContoursFromStorage()`
  - `loadAndCacheShapes()`
  - `loadShapesOnMap()`
- Seleção/tap de talhão acontece via camada `talhoes-layer` em `loadShapesOnMap()`.
- O popup/detalhes usa `showTalhaoInfo(feature)`.
- Offline atual no Web usa IndexedDB + Cache API + Service Worker para tiles e GeoJSON.

## 2) Gargalos no Android WebView

- Mapa com múltiplas camadas vetoriais no WebView sofre com GC/layout e input pipeline mais sensível.
- Download de tiles via fetch/SW em grande volume é pesado para ciclo de vida mobile.
- Retorno de background pode deixar WebGL/context em estado inconsistente.
- Eventos de gesto (pan/zoom/tap) no WebView podem conflitar com overlays e causar sensação de toque fantasma.

## 3) Arquitetura alvo proposta

### Domínio (compartilhado)
- Estado de seleção de talhão
- Dados de popup
- GeoJSON local/cache
- Estratégia online/offline

### Provider de mapa (abstração)
- `AerialMapProvider` (contrato)
- `WebMapProvider` (Mapbox GL JS atual)
- `AndroidNativeMapProvider` (ponte Capacitor -> plugin nativo)

### Plugin Android Capacitor (Mapbox SDK)
- Plugin: `AerialMapPlugin`
- Tela nativa: `NativeAerialMapActivity`
- Métodos: abrir mapa, carregar GeoJSON, destacar talhão, câmera, download/list/remove offline regions.
- Eventos JS: `talhaoClick`, `offlineDownloadProgress`, `nativeMapError`.

## 4) Estratégia de fallback

- Feature flag (`APP_CONFIG.enableNativeAerialMap` ou `localStorage.AGv_NATIVE_AERIAL_MAP=1`) controla ativação do provider nativo.
- Em falha do provider nativo, o app faz fallback automático para provider web e mantém o fluxo atual.

## 5) Observações sobre offline nativo

Esta entrega cria a base arquitetural e as APIs do plugin para operar offline region no Android.
A implementação final de download real de `StylePack + TileRegion + TileStore` no plugin deve ser completada na próxima fase (atualmente há stub de metadados para validar fluxo de UI/eventos sem quebrar o app).

