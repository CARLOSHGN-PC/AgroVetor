export default class HarvestPlanningMapModule {
    constructor({ app }) {
        this.app = app;
        this.map = null;
        this.selectedFeature = null;
        this.currentPlanId = null;
        this.planItems = [];
        this.filteredItems = [];
        this.frontColorById = new Map();
        this.defaultFrontColors = ['#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd', '#8c564b'];
    }

    init() {
        this.elements = {
            container: document.getElementById('harvestPlanningMapContainer'),
            legend: document.getElementById('harvestFrontLegend'),
            details: document.getElementById('harvestTalhaoDetailsPanel'),
            sequenceList: document.getElementById('harvestFrontSequenceList'),
            btnAutoSequence: document.getElementById('btnAutoSequenceHarvestMap'),
            btnSyncNow: document.getElementById('btnSyncHarvestMapNow'),
            filters: {
                periodStart: document.getElementById('harvestMapFilterStart'),
                periodEnd: document.getElementById('harvestMapFilterEnd'),
                frente: document.getElementById('harvestMapFilterFrente'),
                fazenda: document.getElementById('harvestMapFilterFazenda'),
                status: document.getElementById('harvestMapFilterStatus'),
                semSequencia: document.getElementById('harvestMapFilterSemSequencia'),
                busca: document.getElementById('harvestMapFilterBusca')
            },
            indicators: {
                total: document.getElementById('harvestMapIndicatorTotal'),
                area: document.getElementById('harvestMapIndicatorArea'),
                pendentes: document.getElementById('harvestMapIndicatorPendentes')
            }
        };

        if (!this.elements.container) return;

        this._bindEvents();
    }

    async onTabShown() {
        if (!this.elements?.container) return;

        if (!this.map) {
            this._initMap();
        }

        await this.loadData();
        this.renderAll();

        if (this.map) {
            setTimeout(() => this.map.resize(), 0);
        }
    }

    _initMap() {
        if (typeof mapboxgl === 'undefined') return;

        mapboxgl.accessToken = 'pk.eyJ1IjoiY2FybG9zaGduIiwiYSI6ImNtZDk0bXVxeTA0MTcyam9sb2h1dDhxaG8ifQ.uf0av4a0WQ9sxM1RcFYT2w';
        this.map = new mapboxgl.Map({
            container: this.elements.container,
            style: 'mapbox://styles/mapbox/satellite-v9',
            center: [-47.9, -21.2],
            zoom: 9
        });

        this.map.on('load', () => {
            this._ensureMapLayers();
            this._bindMapEvents();
            this.renderMapData();
        });
    }

    _bindMapEvents() {
        this.map.on('click', 'harvest-planning-fill', (e) => {
            const feature = e.features?.[0];
            if (!feature) return;
            this.selectedFeature = feature;

            const talhaoId = String(feature.properties?.AGV_TALHAO || '');
            const item = this.filteredItems.find(i => String(i.talhaoId) === talhaoId);
            this._renderDetails(item, feature.properties || {});
        });
    }

    _ensureMapLayers() {
        if (!this.map) return;

        const map = this.map;
        if (!map.getSource('harvest-planning-source')) {
            map.addSource('harvest-planning-source', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        }

        if (!map.getLayer('harvest-planning-fill')) {
            map.addLayer({
                id: 'harvest-planning-fill',
                type: 'fill',
                source: 'harvest-planning-source',
                paint: {
                    'fill-color': ['coalesce', ['get', 'frontColor'], '#8b8f98'],
                    'fill-opacity': ['case', ['==', ['get', 'isPlanned'], true], 0.62, 0.2]
                }
            });
        }

        if (!map.getLayer('harvest-planning-border')) {
            map.addLayer({
                id: 'harvest-planning-border',
                type: 'line',
                source: 'harvest-planning-source',
                paint: { 'line-color': '#ffffff', 'line-width': 1.3 }
            });
        }

        if (!map.getLayer('harvest-planning-sequence-labels')) {
            map.addLayer({
                id: 'harvest-planning-sequence-labels',
                type: 'symbol',
                source: 'harvest-planning-source',
                layout: {
                    'symbol-placement': 'point',
                    'text-field': ['coalesce', ['to-string', ['get', 'sequencia']], ''],
                    'text-size': 14,
                    'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold']
                },
                paint: {
                    'text-color': '#ffffff',
                    'text-halo-color': '#1f2937',
                    'text-halo-width': 1.5
                }
            });
        }
    }

    _bindEvents() {
        Object.values(this.elements.filters).forEach((el) => {
            if (!el || typeof el.addEventListener !== 'function') return;
            el.addEventListener('input', () => this.renderAll());
            el.addEventListener('change', () => this.renderAll());
        });

        this.elements.btnAutoSequence?.addEventListener('click', () => this.applyAutomaticSequence());
        this.elements.btnSyncNow?.addEventListener('click', () => this.queueSyncAll());
    }

    async loadData() {
        const companyId = this.app?.state?.currentUser?.companyId;
        if (!companyId) return;

        const active = this.app?.state?.activeHarvestPlan;
        this.currentPlanId = active?.id || null;

        const cacheRows = await this.app.offlineManager.getCollectionData('harvest_plan_items', 500, 0);
        this.planItems = cacheRows.filter(row => row.companyId === companyId && (!this.currentPlanId || row.planId === this.currentPlanId));

        if (navigator.onLine && this.currentPlanId) {
            await this._refreshFromFirestore(companyId, this.currentPlanId);
        }

        this._ensureFrontColors();
        this._fillFarmFilter();
    }

    async _refreshFromFirestore(companyId, planId) {
        try {
            const parentRef = this.app.firebase.doc(this.app.db, 'harvest_plans', planId);
            const parentSnap = await this.app.firebase.getDoc(parentRef);
            if (!parentSnap.exists()) return;

            const planData = parentSnap.data();
            if (planData.companyId !== companyId) return;

            const itemsRef = this.app.firebase.collection(this.app.db, 'harvest_plans', planId, 'items');
            const itemsSnap = await this.app.firebase.getDocs(itemsRef);
            const updates = [];
            itemsSnap.forEach((d) => {
                const payload = { id: d.id, planId, companyId, ...d.data() };
                updates.push(payload);
            });

            for (const item of updates) {
                await this.app.offlineManager.updateLocalCache('harvest_plan_items', item, item.id, 'UPDATE');
            }
            this.planItems = updates;
        } catch (error) {
            console.warn('Falha ao atualizar planejamento de colheita do Firestore, usando cache offline.', error);
        }
    }

    _fillFarmFilter() {
        const select = this.elements.filters.fazenda;
        if (!select) return;

        const currentValue = select.value;
        const options = ['<option value="">Todas as fazendas</option>'];
        (this.app.state.fazendas || []).forEach((f) => {
            options.push(`<option value="${f.id}">${f.nome || f.name || f.id}</option>`);
        });
        select.innerHTML = options.join('');
        select.value = currentValue;
    }

    _ensureFrontColors() {
        const fronts = new Set(this.planItems.map(i => i.frenteId).filter(Boolean));
        let idx = 0;
        fronts.forEach((front) => {
            if (!this.frontColorById.has(front)) {
                this.frontColorById.set(front, this.defaultFrontColors[idx % this.defaultFrontColors.length]);
                idx += 1;
            }
        });
    }

    _matchesFilter(item) {
        const { filters } = this.elements;
        const start = filters.periodStart?.value;
        const end = filters.periodEnd?.value;
        const frente = filters.frente?.value;
        const fazenda = filters.fazenda?.value;
        const status = filters.status?.value;
        const semSequencia = Boolean(filters.semSequencia?.checked);
        const busca = (filters.busca?.value || '').toLowerCase();

        const inDate = (!start || !item.dtPrevistaInicio || item.dtPrevistaInicio >= start)
            && (!end || !item.dtPrevistaFim || item.dtPrevistaFim <= end);

        if (!inDate) return false;
        if (frente && String(item.frenteId) !== String(frente)) return false;
        if (fazenda && String(item.fazendaId) !== String(fazenda)) return false;
        if (status && String(item.status) !== String(status)) return false;
        if (semSequencia && Number.isFinite(item.sequencia) && item.sequencia > 0) return false;

        if (busca) {
            const haystack = `${item.talhaoNome || ''} ${item.talhaoId || ''}`.toLowerCase();
            if (!haystack.includes(busca)) return false;
        }

        return true;
    }

    renderAll() {
        this.filteredItems = this.planItems.filter(item => this._matchesFilter(item));
        this.renderMapData();
        this.renderList();
        this.renderLegend();
        this.renderIndicators();
    }

    renderMapData() {
        if (!this.map || !this.map.getSource('harvest-planning-source')) return;

        const features = (this.app.state.geoJsonData?.features || []).map((feature) => {
            const talhaoId = String(feature.properties?.AGV_TALHAO || '');
            const found = this.filteredItems.find(item => String(item.talhaoId) === talhaoId);
            return {
                ...feature,
                properties: {
                    ...(feature.properties || {}),
                    isPlanned: Boolean(found),
                    sequencia: found?.sequencia || '',
                    frontColor: found?.frenteCor || this.frontColorById.get(found?.frenteId) || '#8b8f98'
                }
            };
        });

        this.map.getSource('harvest-planning-source').setData({ type: 'FeatureCollection', features });
    }

    renderList() {
        const list = this.elements.sequenceList;
        if (!list) return;

        const sorted = [...this.filteredItems].sort((a, b) => {
            if (String(a.frenteId) !== String(b.frenteId)) return String(a.frenteId).localeCompare(String(b.frenteId));
            return (a.sequencia || 0) - (b.sequencia || 0);
        });

        if (!sorted.length) {
            list.innerHTML = '<p class="empty-state">Nenhum talhão no filtro atual.</p>';
            return;
        }

        list.innerHTML = sorted.map(item => `
            <div class="harvest-seq-item" data-item-id="${item.id}">
                <span class="badge" style="background:${item.frenteCor || this.frontColorById.get(item.frenteId) || '#6b7280'}">${item.frenteId || '-'}</span>
                <strong>#${item.sequencia || '-'}</strong>
                <span>${item.talhaoNome || item.talhaoId}</span>
                <div class="seq-actions">
                    <button data-act="up" data-id="${item.id}"><i class="fas fa-arrow-up"></i></button>
                    <button data-act="down" data-id="${item.id}"><i class="fas fa-arrow-down"></i></button>
                    <button data-act="cancel" data-id="${item.id}"><i class="fas fa-ban"></i></button>
                </div>
            </div>
        `).join('');

        list.querySelectorAll('button[data-act]').forEach(btn => {
            btn.addEventListener('click', () => this.handleSequenceAction(btn.dataset.act, btn.dataset.id));
        });
    }

    renderLegend() {
        if (!this.elements.legend) return;
        const entries = [...this.frontColorById.entries()];
        this.elements.legend.innerHTML = entries.map(([id, color]) => `
            <div class="legend-item"><span class="legend-dot" style="background:${color}"></span>${id}</div>
        `).join('') || '<span class="muted">Sem frentes planejadas.</span>';
    }

    renderIndicators() {
        const total = this.filteredItems.length;
        const area = this.filteredItems.reduce((acc, i) => acc + (Number(i.areaSnapshot) || 0), 0);
        const pendentes = this.filteredItems.filter(i => i.status === 'Planejado').length;

        if (this.elements.indicators.total) this.elements.indicators.total.textContent = String(total);
        if (this.elements.indicators.area) this.elements.indicators.area.textContent = `${area.toFixed(2)} ha`;
        if (this.elements.indicators.pendentes) this.elements.indicators.pendentes.textContent = String(pendentes);
    }

    _renderDetails(item, featureProps) {
        if (!this.elements.details) return;
        if (!item) {
            this.elements.details.innerHTML = `<p><strong>Talhão:</strong> ${featureProps?.AGV_TALHAO || '-'}</p><p>Sem sequência planejada.</p>`;
            return;
        }

        this.elements.details.innerHTML = `
            <p><strong>Fazenda:</strong> ${item.fazendaNome || item.fazendaId || '-'}</p>
            <p><strong>Talhão:</strong> ${item.talhaoNome || item.talhaoId || '-'}</p>
            <p><strong>Área:</strong> ${Number(item.areaSnapshot || 0).toFixed(2)} ha</p>
            <p><strong>Variedade:</strong> ${item.variedadeSnapshot || '-'}</p>
            <p><strong>Frente:</strong> ${item.frenteId || '-'}</p>
            <p><strong>Sequência:</strong> ${item.sequencia || '-'}</p>
            <p><strong>Status:</strong> ${item.status || '-'}</p>
            <p><strong>Datas:</strong> ${item.dtPrevistaInicio || '-'} → ${item.dtPrevistaFim || '-'}</p>
            <p><strong>Observações:</strong> ${item.observacao || '-'}</p>
        `;
    }

    async handleSequenceAction(action, itemId) {
        const target = this.filteredItems.find(i => i.id === itemId);
        if (!target) return;

        if (action === 'cancel') {
            target.status = 'Cancelado';
        } else {
            const siblings = this.planItems
                .filter(i => String(i.frenteId) === String(target.frenteId) && String(i.periodKey || '') === String(target.periodKey || ''))
                .sort((a, b) => (a.sequencia || 0) - (b.sequencia || 0));
            const idx = siblings.findIndex(i => i.id === itemId);
            const swapWith = action === 'up' ? idx - 1 : idx + 1;
            if (idx < 0 || swapWith < 0 || swapWith >= siblings.length) return;
            const a = siblings[idx];
            const b = siblings[swapWith];
            const temp = a.sequencia;
            a.sequencia = b.sequencia;
            b.sequencia = temp;
            await this._persistItem(b);
        }

        await this._persistItem(target);
        this.renderAll();
    }

    async _persistItem(item) {
        item.updatedAt = new Date().toISOString();
        await this.app.offlineManager.updateLocalCache('harvest_plan_items', item, item.id, 'UPDATE');

        const uuid = this.app.offlineManager.constructor.generateUUID();
        await this.app.offlineManager.enqueueOperation('UPDATE', `harvest_plans/${item.planId}/items`, item, uuid);
    }

    async applyAutomaticSequence() {
        const grouped = new Map();
        this.planItems.forEach((item) => {
            const key = `${item.frenteId || 'N/A'}::${item.periodKey || 'geral'}`;
            if (!grouped.has(key)) grouped.set(key, []);
            grouped.get(key).push(item);
        });

        for (const [, items] of grouped.entries()) {
            items.sort((a, b) => String(a.talhaoNome || a.talhaoId).localeCompare(String(b.talhaoNome || b.talhaoId)));
            for (let idx = 0; idx < items.length; idx += 1) {
                items[idx].sequencia = idx + 1;
                await this._persistItem(items[idx]);
            }
        }

        this.renderAll();
        this.app.ui.showAlert('Sequência automática aplicada e colocada na fila de sincronização.', 'success');
    }

    async queueSyncAll() {
        if (this.app.syncQueue) {
            await this.app.syncQueue.processQueue();
        }
        this.app.ui.showAlert('Sincronização da fila disparada.', 'info');
    }
}
