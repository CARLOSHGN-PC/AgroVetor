export async function openMonitoramentoAereo(App, perfLogger) {
    const mapContainer = App?.elements?.monitoramentoAereo?.container;
    if (!mapContainer) return;

    const loadingId = 'monitoramento-map-skeleton';
    if (!document.getElementById(loadingId)) {
        const skeleton = document.createElement('div');
        skeleton.id = loadingId;
        skeleton.style.cssText = 'display:flex;align-items:center;justify-content:center;height:100%;min-height:220px;background:rgba(0,0,0,0.05);color:var(--color-primary);font-weight:600;border-radius:10px;';
        skeleton.innerHTML = '<span><i class="fas fa-map-marked-alt"></i> A carregar mapa...</span>';
        mapContainer.appendChild(skeleton);
    }

    await perfLogger.log('map_open_start');

    await new Promise(resolve => requestAnimationFrame(resolve));

    if (!App.state.mapboxMap) {
        await new Promise(resolve => {
            setTimeout(() => {
                App.mapModule.initMap();
                resolve();
            }, 0);
        });
    } else {
        setTimeout(() => App.state.mapboxMap.resize(), 0);
    }

    const skeletonEl = document.getElementById(loadingId);
    if (skeletonEl) skeletonEl.remove();

    await perfLogger.log('map_open_end', {
        initialized: Boolean(App.state.mapboxMap)
    });
}
