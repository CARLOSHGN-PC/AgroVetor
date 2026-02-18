# Offline/Performance Mini Report (Fase 1)

## Top 3 gargalos observados
1. **Parsing e reprojeção de SHP/GeoJSON no main thread** durante `loadAndCacheShapes` e `loadShapesFromCache`, causando long tasks e congelamento na abertura do mapa.
2. **Download offline de tiles sem limite rígido por pacote**, com risco de volume muito alto e travamento em dispositivos móveis.
3. **Estratégia de cache antiga do Service Worker** baseada em cache genérico/manual, sem políticas claras de expiração por tipo de recurso e sem fallback offline robusto para navegação.

## Top 3 requests mais pesados no boot
1. `./app.js` (bundle principal, custo de parse + execução alto no primeiro load).
2. `https://api.mapbox.com/...` (tiles base e satélite, alto volume quando módulo de mapa entra).
3. Bibliotecas externas críticas (`firebase-*`, `chart.js`, `proj4js`), responsáveis por parte significativa dos requests iniciais quando sem cache quente.

## Métricas instrumentadas nesta entrega
- TTI (boot até tela utilizável) com log `[perf] boot summary`.
- Contagem de requests durante boot.
- Cache misses (quando header de cache informa miss).
- Falhas de rede.
- Long tasks (>200ms) detectadas por `PerformanceObserver`.
- Bundle principal (estimativa por `transferSize` de `app.js`).
