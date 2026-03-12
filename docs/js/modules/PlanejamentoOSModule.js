const DEFAULT_STATUS = {
    RASCUNHO: 'RASCUNHO',
    PLANEJADO: 'PLANEJADO',
    PRONTO: 'PRONTO_PARA_OS'
};

const toIsoDate = (value) => {
    if (!value) return null;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.toISOString();
};

const normalizeText = (value) => String(value || '').trim().toLowerCase();

const parseSequenceFromText = (value) => {
    if (!value) return null;
    const match = String(value).match(/(?:seq\.?|sequ[eê]ncia)?\s*(\d{1,3})/i);
    if (match) return Number(match[1]);
    const trailingNumber = String(value).match(/(\d{1,3})\s*$/);
    return trailingNumber ? Number(trailingNumber[1]) : null;
};

export default {
    initialized: false,

    init(app) {
        this.app = app;
        this.cacheElements();
        if (!this.initialized) {
            this.bindEvents();
            this.initialized = true;
        }
        this.populateInitialCombos();
        this.renderSavedPlans();
    },

    cacheElements() {
        this.els = {
            container: document.getElementById('planejamentoOS'),
            modeWarning: document.getElementById('planejamentoOSModeWarning'),
            planId: document.getElementById('planOSId'),
            empresa: document.getElementById('planOSEmpresa'),
            fazenda: document.getElementById('planOSFazenda'),
            subgrupo: document.getElementById('planOSSubgrupo'),
            operacao: document.getElementById('planOSOperacao'),
            tipoServico: document.getElementById('planOSTipoServico'),
            programa: document.getElementById('planOSPrograma'),
            dataPlanejada: document.getElementById('planOSDataPlanejada'),
            responsavel: document.getElementById('planOSResponsavel'),
            observacoes: document.getElementById('planOSObservacoes'),
            talhoesList: document.getElementById('planOSTalhoesList'),
            selectedCounter: document.getElementById('planOSSelectedCounter'),
            itemsTableBody: document.getElementById('planOSItemsTbody'),
            btnRascunho: document.getElementById('btnSavePlanOSDraft'),
            btnPlanejado: document.getElementById('btnSavePlanOS'),
            btnPronto: document.getElementById('btnSavePlanOSReady'),
            btnAbrirOs: document.getElementById('btnPlanAndOpenOSNow'),
            savedList: document.getElementById('planOSSavedList')
        };
    },

    bindEvents() {
        if (!this.els.container) return;

        this.els.fazenda?.addEventListener('change', () => {
            this.renderTalhoesFromFarm();
            this.rebuildPlanItems();
        });

        this.els.operacao?.addEventListener('change', () => this.rebuildPlanItems());

        this.els.talhoesList?.addEventListener('change', (event) => {
            if (event.target?.classList.contains('plan-os-talhao-cb')) {
                this.rebuildPlanItems();
            }
        });

        this.els.btnRascunho?.addEventListener('click', () => this.savePlan(DEFAULT_STATUS.RASCUNHO));
        this.els.btnPlanejado?.addEventListener('click', () => this.savePlan(DEFAULT_STATUS.PLANEJADO));
        this.els.btnPronto?.addEventListener('click', () => this.savePlan(DEFAULT_STATUS.PRONTO));
        this.els.btnAbrirOs?.addEventListener('click', () => this.planAndOpenOSNow());
    },

    populateInitialCombos() {
        const app = this.app;

        const currentCompany = app.state.currentUser?.companyId || '';
        this.els.empresa.innerHTML = '<option value="">Selecione...</option>';
        (app.state.companies || []).forEach((company) => {
            this.els.empresa.innerHTML += `<option value="${company.id}">${company.name || company.id}</option>`;
        });
        this.els.empresa.value = currentCompany;

        this.els.fazenda.innerHTML = '<option value="">Selecione...</option>';
        (app.state.fazendas || [])
            .slice()
            .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
            .forEach((farm) => {
                this.els.fazenda.innerHTML += `<option value="${farm.id}">${farm.name || farm.code || farm.id}</option>`;
            });

        const operacoes = app.state.operacoes || [];
        this.els.operacao.innerHTML = '<option value="">Selecione...</option>';
        operacoes
            .slice()
            .sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || '')))
            .forEach((op) => {
                this.els.operacao.innerHTML += `<option value="${op.nome || op.id}">${op.nome || op.id}</option>`;
            });

        const tipos = app.state.tipos_servico || [];
        this.els.tipoServico.innerHTML = '<option value="">Selecione...</option>';
        tipos
            .slice()
            .sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || '')))
            .forEach((tipo) => {
                this.els.tipoServico.innerHTML += `<option value="${tipo.nome || tipo.id}">${tipo.nome || tipo.id}</option>`;
            });

        this.els.dataPlanejada.value = new Date().toISOString().split('T')[0];
        this.renderTalhoesFromFarm();
        this.renderWebOnlyWarning();
    },

    renderWebOnlyWarning() {
        if (!this.els.modeWarning) return;
        const isDesktop = window.innerWidth >= 1024;
        this.els.modeWarning.style.display = isDesktop ? 'none' : 'block';
    },

    renderTalhoesFromFarm() {
        const farm = this.getSelectedFarm();
        if (!farm || !Array.isArray(farm.talhoes) || farm.talhoes.length === 0) {
            this.els.talhoesList.innerHTML = '<p style="padding:8px; color: var(--color-text-light);">Selecione uma fazenda com talhões cadastrados.</p>';
            this.els.selectedCounter.textContent = '0 selecionados';
            return;
        }

        const rows = farm.talhoes
            .slice()
            .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
            .map((talhao) => {
                const talhaoName = talhao.name || talhao.id || 'Sem nome';
                const area = Number(talhao.areaHa || talhao.area || 0) || 0;
                return `
                    <label style="display:flex; align-items:center; gap:8px; padding:4px 0;">
                        <input class="plan-os-talhao-cb" type="checkbox" value="${talhaoName}" data-area="${area}">
                        <span>${talhaoName} (${area.toFixed(2)} ha)</span>
                    </label>
                `;
            });

        this.els.talhoesList.innerHTML = rows.join('');
        this.els.selectedCounter.textContent = '0 selecionados';
    },

    getSelectedFarm() {
        const farmId = this.els.fazenda?.value;
        return (this.app.state.fazendas || []).find((f) => f.id === farmId) || null;
    },

    getSelectedTalhoes() {
        const checkboxes = this.els.talhoesList?.querySelectorAll('.plan-os-talhao-cb:checked') || [];
        return Array.from(checkboxes).map((cb) => ({
            talhao: cb.value,
            area_ha: Number(cb.dataset.area || 0)
        }));
    },

    rebuildPlanItems() {
        const selectedTalhoes = this.getSelectedTalhoes();
        this.els.selectedCounter.textContent = `${selectedTalhoes.length} selecionados`;
        this.els.itemsTableBody.innerHTML = '';

        if (!selectedTalhoes.length) {
            this.els.itemsTableBody.innerHTML = '<tr><td colspan="8" style="text-align:center; color:var(--color-text-light);">Selecione talhões para visualizar sugestões.</td></tr>';
            return;
        }

        const operacao = this.els.operacao.value;
        selectedTalhoes.forEach((item) => {
            const suggestion = this.suggestNextForTalhao(item.talhao, operacao);
            const tr = document.createElement('tr');
            tr.dataset.talhao = item.talhao;
            tr.dataset.areaHa = String(item.area_ha || 0);
            tr.dataset.apontamentoBaseId = suggestion.apontamentoBaseId || '';
            tr.dataset.ultimaSequencia = suggestion.ultimaSequenciaIdentificada ?? '';
            tr.innerHTML = `
                <td>${item.talhao}</td>
                <td>${(item.area_ha || 0).toFixed(2)}</td>
                <td>${suggestion.ultimaAplicacaoNome || '-'}</td>
                <td>${suggestion.ultimaAplicacaoData || '-'}</td>
                <td>${suggestion.ultimaSequenciaIdentificada ?? '-'}</td>
                <td><input type="number" min="1" class="plan-os-next-seq" value="${suggestion.proximaSequencia || 1}" style="width:80px;"></td>
                <td><input type="text" class="plan-os-next-app" value="${suggestion.proximaAplicacaoNome || ''}" placeholder="Aplicação sugerida"></td>
                <td>${suggestion.statusItem}</td>
            `;
            this.els.itemsTableBody.appendChild(tr);
        });
    },

    suggestNextForTalhao(talhao, operacao) {
        const normalizedTalhao = normalizeText(talhao);
        const normalizedOperacao = normalizeText(operacao);
        const osList = (this.app.state.ordens_servico || []).slice();

        const candidates = [];

        osList.forEach((os) => {
            const log = Array.isArray(os.relatorio_execucao) ? os.relatorio_execucao : [];
            log.forEach((entry, idx) => {
                const talhaoMatches = normalizeText(entry.talhao) === normalizedTalhao;
                const opMatches = !normalizedOperacao || normalizeText(entry.operacao) === normalizedOperacao;
                if (!talhaoMatches || !opMatches) return;

                const entryDate = toIsoDate(entry.data) || toIsoDate(os.updated_at) || toIsoDate(os.createdAt);
                const sequenceCandidate = Number(os.sequencia_aplicacao) || parseSequenceFromText(entry.produto) || parseSequenceFromText(entry.operacao);
                candidates.push({
                    os,
                    entry,
                    idx,
                    date: entryDate,
                    sequence: Number.isFinite(sequenceCandidate) ? sequenceCandidate : null
                });
            });
        });

        candidates.sort((a, b) => {
            const aTs = a.date ? new Date(a.date).getTime() : 0;
            const bTs = b.date ? new Date(b.date).getTime() : 0;
            return bTs - aTs;
        });

        const latest = candidates[0];
        const initialSequence = Number(this.app.state.globalConfigs?.planejamentoOS?.sequenciaInicial || 1);

        if (!latest) {
            return {
                ultimaAplicacaoNome: null,
                ultimaAplicacaoData: null,
                ultimaSequenciaIdentificada: null,
                proximaSequencia: initialSequence,
                proximaAplicacaoNome: '',
                statusItem: 'REVISAO',
                apontamentoBaseId: null
            };
        }

        const nextSeq = latest.sequence ? latest.sequence + 1 : initialSequence;
        return {
            ultimaAplicacaoNome: latest.entry.produto || latest.entry.operacao || latest.os.operacao || null,
            ultimaAplicacaoData: latest.date ? new Date(latest.date).toLocaleDateString('pt-BR') : null,
            ultimaSequenciaIdentificada: latest.sequence,
            proximaSequencia: nextSeq,
            proximaAplicacaoNome: latest.entry.produto || '',
            statusItem: latest.sequence ? 'SUGERIDO' : 'REVISAO',
            apontamentoBaseId: latest.entry.hash || `${latest.os.id}:${latest.idx}`
        };
    },

    buildPayload(status) {
        const currentUser = this.app.state.currentUser;
        const farm = this.getSelectedFarm();
        const rows = Array.from(this.els.itemsTableBody.querySelectorAll('tr[data-talhao]'));

        const items = rows.map((row) => {
            const nextSeq = Number(row.querySelector('.plan-os-next-seq')?.value || 1);
            const nextApp = row.querySelector('.plan-os-next-app')?.value?.trim() || '';
            return {
                planejamento_id: this.els.planId.value || null,
                companyId: currentUser.companyId,
                fazenda: farm?.name || '',
                talhao: row.dataset.talhao,
                area_ha: Number(row.dataset.areaHa || 0),
                subgrupo: this.els.subgrupo.value || '',
                operacao: this.els.operacao.value || '',
                tipo_servico: this.els.tipoServico.value || '',
                programa: this.els.programa.value || '',
                data_planejada: this.els.dataPlanejada.value || '',
                ultima_aplicacao_nome: row.children[2]?.textContent?.trim() || '',
                ultima_aplicacao_data: row.children[3]?.textContent?.trim() || '',
                ultima_sequencia_identificada: row.dataset.ultimaSequencia ? Number(row.dataset.ultimaSequencia) : null,
                proxima_sequencia: nextSeq,
                proxima_aplicacao_nome: nextApp,
                status_item: row.children[7]?.textContent?.trim() || 'SUGERIDO',
                apontamento_base_id: row.dataset.apontamentoBaseId || null,
                os_id: null,
                os_numero: null,
                updated_at: new Date().toISOString()
            };
        });

        const areaTotal = items.reduce((sum, item) => sum + Number(item.area_ha || 0), 0);

        const header = {
            companyId: currentUser.companyId,
            empresa: this.els.empresa.value,
            fazenda: farm?.name || '',
            subgrupo: this.els.subgrupo.value || '',
            operacao: this.els.operacao.value || '',
            tipo_servico: this.els.tipoServico.value || '',
            programa: this.els.programa.value || '',
            data_planejada: this.els.dataPlanejada.value || '',
            responsavel: this.els.responsavel.value || '',
            observacoes: this.els.observacoes.value || '',
            area_total_ha: areaTotal,
            qtde_talhoes: items.length,
            status,
            pronto_para_os: status === DEFAULT_STATUS.PRONTO,
            updated_at: new Date().toISOString()
        };

        return { header, items };
    },

    async savePlan(status) {
        try {
            if (!this.els.fazenda.value) {
                this.app.ui.showAlert('Selecione uma fazenda para salvar o planejamento.', 'warning');
                return;
            }

            const { header, items } = this.buildPayload(status);
            if (!items.length) {
                this.app.ui.showAlert('Selecione ao menos um talhão.', 'warning');
                return;
            }

            this.app.ui.setLoading(true, 'Salvando planejamento O.S...');

            let planningId = this.els.planId.value;
            if (planningId) {
                await this.app.data.updateDocument('os_planejamento_cabecalho', planningId, header);
            } else {
                const docRef = await this.app.data.addDocument('os_planejamento_cabecalho', {
                    ...header,
                    created_at: new Date().toISOString()
                });
                planningId = docRef.id;
                this.els.planId.value = planningId;
            }

            await Promise.all(items.map((item) => this.app.data.addDocument('os_planejamento_itens', {
                ...item,
                planejamento_id: planningId,
                created_at: new Date().toISOString()
            })));

            this.app.ui.showAlert('Planejamento O.S. salvo com sucesso.', 'success');
            await this.app.data.subscribeTo('os_planejamento_cabecalho');
            this.renderSavedPlans();
        } catch (error) {
            console.error('[PlanejamentoOS] erro ao salvar', error);
            this.app.ui.showAlert('Erro ao salvar planejamento O.S.', 'error');
        } finally {
            this.app.ui.setLoading(false);
        }
    },

    planAndOpenOSNow() {
        const payload = this.buildPayload(DEFAULT_STATUS.PRONTO);
        localStorage.setItem('agrovetor_planejamento_os_payload', JSON.stringify(payload));
        this.app.ui.showAlert('Planejamento preparado. Abertura automática da O.S. será refinada na Fase 2.', 'info');
        this.app.ui.showTab('ordemServicoManual');
    },

    renderSavedPlans() {
        if (!this.els.savedList) return;
        const plans = (this.app.state.os_planejamento_cabecalho || [])
            .slice()
            .sort((a, b) => new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0));

        if (!plans.length) {
            this.els.savedList.innerHTML = '<p style="color:var(--color-text-light);">Nenhum planejamento salvo.</p>';
            return;
        }

        this.els.savedList.innerHTML = plans.slice(0, 10).map((plan) => `
            <div style="padding:8px 0; border-bottom:1px solid var(--color-border);">
                <strong>${plan.fazenda || 'Sem fazenda'}</strong> · ${plan.operacao || '-'} · ${plan.data_planejada || '-'}
                <div style="font-size:12px; color:var(--color-text-light);">Status: ${plan.status || '-'} · Talhões: ${plan.qtde_talhoes || 0}</div>
            </div>
        `).join('');
    }
};
