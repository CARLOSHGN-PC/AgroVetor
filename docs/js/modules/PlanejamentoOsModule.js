/**
 * Planejamento O.S. Module
 * Responsável pela tela de planejamento operacional e geração de Rascunhos / O.S.
 */
class PlanejamentoOsModule {
    constructor(App) {
        this.App = App;
        this.els = App.elements.planOs;
        this.selectedPlots = new Set();
        this.availablePlots = [];
        this.currentPlanId = null;

        this.initEventListeners();
    }

    initEventListeners() {
        if (!this.els.companySelect) return;

        // View Tabs
        this.els.tabList.addEventListener('click', () => this.switchView('list'));
        this.els.tabMap.addEventListener('click', () => this.switchView('map'));
        this.els.tabSaved.addEventListener('click', () => this.switchView('saved'));

        // Form events
        this.els.companySelect.addEventListener('change', () => this.onCompanyChange());
        this.els.farmSelect.addEventListener('change', () => this.loadPlots());
        this.els.operationSelect.addEventListener('change', () => this.loadPlots());

        // Responsible search
        this.els.responsibleInput.addEventListener('input', () => this.searchResponsible());

        // Select all
        this.els.selectAllPlotsBtn.addEventListener('click', () => this.toggleSelectAll());

        // Save actions
        this.els.saveDraftBtn.addEventListener('click', () => this.savePlanning('RASCUNHO'));
        this.els.saveReadyBtn.addEventListener('click', () => this.savePlanning('PRONTO_PARA_OS'));
    }

    init() {
        this.resetForm();
        this.populateCompanies();
        this.populateDropdowns();
        this.switchView('list');
        this.renderSavedPlannings();
    }

    switchView(view) {
        // Update tab buttons
        this.els.tabList.classList.toggle('active', view === 'list');
        this.els.tabMap.classList.toggle('active', view === 'map');
        this.els.tabSaved.classList.toggle('active', view === 'saved');

        // Update content areas
        this.els.viewList.style.display = view === 'list' ? 'block' : 'none';
        this.els.viewMap.style.display = view === 'map' ? 'block' : 'none';
        this.els.viewSaved.style.display = view === 'saved' ? 'block' : 'none';

        if (view === 'map') {
            this.initMap();
        } else if (view === 'saved') {
            this.renderSavedPlannings();
        }
    }

    populateCompanies() {
        this.els.companySelect.innerHTML = '<option value="">Selecione a empresa</option>';
        if (this.App.state.empresas) {
            this.App.state.empresas.forEach(emp => {
                const opt = document.createElement('option');
                opt.value = emp.id;
                opt.textContent = emp.nome;
                this.els.companySelect.appendChild(opt);
            });
        }
    }

    onCompanyChange() {
        const companyId = this.els.companySelect.value;
        this.els.farmSelect.innerHTML = '<option value="">Selecione a fazenda</option>';
        this.els.farmSelect.disabled = !companyId;

        if (companyId && this.App.state.fazendas) {
            const farms = this.App.state.fazendas.filter(f => f.empresa_id === companyId);
            farms.forEach(f => {
                const opt = document.createElement('option');
                opt.value = f.id;
                opt.textContent = f.nome;
                this.els.farmSelect.appendChild(opt);
            });
        }
        this.loadPlots();
    }

    populateDropdowns() {
        // Operações
        this.els.operationSelect.innerHTML = '<option value="">Selecione</option>';
        if (this.App.state.operacoes) {
            this.App.state.operacoes.forEach(op => {
                const opt = document.createElement('option');
                opt.value = op.id;
                opt.textContent = op.descricao;
                this.els.operationSelect.appendChild(opt);
            });
        }

        // Tipo de Serviço
        this.els.serviceTypeSelect.innerHTML = '<option value="">Selecione</option>';
        if (this.App.state.tipos_servico) {
            this.App.state.tipos_servico.forEach(ts => {
                const opt = document.createElement('option');
                opt.value = ts.id;
                opt.textContent = ts.descricao;
                this.els.serviceTypeSelect.appendChild(opt);
            });
        }

        // Subgrupo (mock if no state exists yet)
        this.els.subgroupSelect.innerHTML = '<option value="geral">Geral</option>';
    }

    searchResponsible() {
        const mat = this.els.responsibleInput.value;
        const user = this.App.state.usuarios?.find(u => u.matricula === mat);
        if (user) {
            this.els.responsibleName.value = user.nome;
        } else {
            this.els.responsibleName.value = '';
        }
    }

    loadPlots() {
        const farmId = this.els.farmSelect.value;
        const opId = this.els.operationSelect.value;

        this.els.plotsTableBody.innerHTML = '';
        this.availablePlots = [];
        this.selectedPlots.clear();
        this.updateSelectedCount();

        if (!farmId || !opId) {
            this.els.plotsTableBody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: var(--color-text-light); padding: 30px;">Selecione uma Fazenda e Operação para carregar os talhões.</td></tr>';
            return;
        }

        // Get plots for this farm
        const plots = this.App.state.talhoes?.filter(t => t.fazenda_id === farmId) || [];

        if (plots.length === 0) {
            this.els.plotsTableBody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: var(--color-text-light); padding: 30px;">Nenhum talhão encontrado para esta fazenda.</td></tr>';
            return;
        }

        this.availablePlots = plots.map(p => {
            // Here we would integrate with Universal Import Engine historical data
            // Mocking historical data for now
            return {
                ...p,
                ultima_data: '-',
                seq_atual: 0,
                seq_sugerida: 1,
                status: 'Sem Histórico'
            };
        });

        this.renderPlotsList();
    }

    renderPlotsList() {
        this.els.plotsTableBody.innerHTML = '';
        this.availablePlots.forEach(plot => {
            const tr = document.createElement('tr');
            const isSelected = this.selectedPlots.has(plot.id);

            tr.innerHTML = \`
                <td style="text-align: center;">
                    <input type="checkbox" class="plot-checkbox" data-id="\${plot.id}" \${isSelected ? 'checked' : ''}>
                </td>
                <td>\${plot.codigo || plot.nome}</td>
                <td>\${plot.area_util || plot.area || 0}</td>
                <td>\${plot.variedade || '-'}</td>
                <td>\${plot.ultima_data}</td>
                <td>\${plot.seq_atual}</td>
                <td>Seq. \${plot.seq_sugerida}</td>
                <td><span class="badge" style="background: var(--color-warning); color: white; padding: 2px 6px; border-radius: 4px; font-size: 10px;">\${plot.status}</span></td>
            \`;

            const checkbox = tr.querySelector('.plot-checkbox');
            checkbox.addEventListener('change', (e) => {
                if (e.target.checked) {
                    this.selectedPlots.add(plot.id);
                } else {
                    this.selectedPlots.delete(plot.id);
                }
                this.updateSelectedCount();
            });

            this.els.plotsTableBody.appendChild(tr);
        });
    }

    toggleSelectAll() {
        if (this.selectedPlots.size === this.availablePlots.length && this.availablePlots.length > 0) {
            this.selectedPlots.clear();
        } else {
            this.availablePlots.forEach(p => this.selectedPlots.add(p.id));
        }
        this.renderPlotsList();
        this.updateSelectedCount();
    }

    updateSelectedCount() {
        if (this.els.mapSelectedCount) {
            this.els.mapSelectedCount.textContent = this.selectedPlots.size;
        }
    }

    resetForm() {
        this.currentPlanId = null;
        this.els.companySelect.value = '';
        this.els.farmSelect.innerHTML = '<option value="">Selecione a empresa primeiro</option>';
        this.els.farmSelect.disabled = true;
        this.els.subgroupSelect.value = '';
        this.els.operationSelect.value = '';
        this.els.serviceTypeSelect.value = '';
        this.els.programSelect.value = '';
        this.els.dateInput.value = new Date().toISOString().split('T')[0];
        this.els.responsibleInput.value = '';
        this.els.responsibleName.value = '';
        this.els.observations.value = '';
        this.els.statusBadge.textContent = 'NOVO PLANEJAMENTO';
        this.els.statusBadge.style.background = 'var(--color-border)';
        this.els.statusBadge.style.color = 'var(--color-text)';

        this.selectedPlots.clear();
        this.availablePlots = [];
        this.els.plotsTableBody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: var(--color-text-light); padding: 30px;">Selecione uma Fazenda e Operação para carregar os talhões.</td></tr>';
        this.updateSelectedCount();
    }

    async savePlanning(status) {
        if (!this.els.companySelect.value || !this.els.farmSelect.value || !this.els.operationSelect.value || !this.els.dateInput.value) {
            this.App.ui.showAlert('Preencha todos os campos obrigatórios (*)', 'error');
            return;
        }

        if (this.selectedPlots.size === 0) {
            this.App.ui.showAlert('Selecione ao menos um talhão', 'error');
            return;
        }

        const id = this.currentPlanId || \`plan_\${Date.now()}\`;

        const cabecalho = {
            id,
            empresaId: this.els.companySelect.value,
            fazendaId: this.els.farmSelect.value,
            subgrupoId: this.els.subgroupSelect.value,
            operacaoId: this.els.operationSelect.value,
            tipoServico: this.els.serviceTypeSelect.value,
            programa: this.els.programSelect.value,
            dataPlanejada: this.els.dateInput.value,
            responsavelMatricula: this.els.responsibleInput.value,
            responsavelNome: this.els.responsibleName.value,
            observacoes: this.els.observations.value,
            status,
            dataCriacao: new Date().toISOString()
        };

        const itens = Array.from(this.selectedPlots).map(talhaoId => {
            const plotData = this.availablePlots.find(p => p.id === talhaoId);
            return {
                id: \`item_\${id}_\${talhaoId}\`,
                planejamentoId: id,
                talhaoId,
                sequencia_atual: plotData?.seq_atual || 0,
                sequencia_sugerida: plotData?.seq_sugerida || 1,
                revisao_necessaria: plotData?.status === 'Sem Histórico'
            };
        });

        try {
            this.App.ui.setLoading(true, "A salvar planejamento...");

            // Remove old if exists
            this.App.state.os_planejamento_cabecalho = this.App.state.os_planejamento_cabecalho.filter(p => p.id !== id);
            this.App.state.os_planejamento_itens = this.App.state.os_planejamento_itens.filter(i => i.planejamentoId !== id);

            // Add new
            this.App.state.os_planejamento_cabecalho.push(cabecalho);
            this.App.state.os_planejamento_itens.push(...itens);

            // Persist to offline DB (mock implementation assumes OfflineDB can take arbitrary keys if not mapped natively yet, but we will rely on app state sync logic if implemented or manual indexdb call)
            if (typeof OfflineDB !== 'undefined' && OfflineDB.add) {
                 await OfflineDB.add('offline-writes', {
                     type: 'set',
                     collection: 'os_planejamento_cabecalho',
                     docId: id,
                     data: cabecalho
                 });
                 // To avoid too many offline writes, items could be batched, but we'll do simple for now
                 for (let item of itens) {
                     await OfflineDB.add('offline-writes', {
                         type: 'set',
                         collection: 'os_planejamento_itens',
                         docId: item.id,
                         data: item
                     });
                 }
            }

            this.App.ui.showAlert('Planejamento salvo com sucesso!', 'success');
            this.renderSavedPlannings();
            this.switchView('saved');
            this.resetForm();

        } catch (error) {
            console.error("Erro ao salvar planejamento:", error);
            this.App.ui.showAlert('Erro ao salvar planejamento', 'error');
        } finally {
            this.App.ui.setLoading(false);
        }
    }

    renderSavedPlannings() {
        const tbody = this.els.savedTableBody;
        tbody.innerHTML = '';

        if (!this.App.state.os_planejamento_cabecalho || this.App.state.os_planejamento_cabecalho.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--color-text-light); padding: 20px;">Nenhum planejamento salvo encontrado.</td></tr>';
            return;
        }

        // Sort by date desc
        const sorted = [...this.App.state.os_planejamento_cabecalho].sort((a,b) => new Date(b.dataCriacao) - new Date(a.dataCriacao));

        sorted.forEach(plan => {
            const tr = document.createElement('tr');

            // Get names
            const farm = this.App.state.fazendas?.find(f => f.id === plan.fazendaId)?.nome || plan.fazendaId;
            const op = this.App.state.operacoes?.find(o => o.id === plan.operacaoId)?.descricao || plan.operacaoId;

            let statusColor = 'var(--color-border)';
            if (plan.status === 'RASCUNHO') statusColor = 'var(--color-warning)';
            if (plan.status === 'PRONTO_PARA_OS') statusColor = 'var(--color-info)';
            if (plan.status === 'CONVERTIDO') statusColor = 'var(--color-success)';

            tr.innerHTML = \`
                <td>\${plan.id.substring(0, 15)}...</td>
                <td>\${plan.dataPlanejada}</td>
                <td>\${farm}</td>
                <td>\${op}</td>
                <td><span style="background: \${statusColor}; color: white; padding: 2px 6px; border-radius: 4px; font-size: 11px;">\${plan.status}</span></td>
                <td>
                    <button class="btn-secondary btn-edit-plan" data-id="\${plan.id}" style="padding: 2px 8px; margin:0;" title="Editar"><i class="fas fa-edit"></i></button>
                    \${plan.status === 'PRONTO_PARA_OS' ? \`<button class="save btn-generate-os" data-id="\${plan.id}" style="padding: 2px 8px; margin:0; margin-left: 5px;" title="Gerar O.S."><i class="fas fa-file-contract"></i></button>\` : ''}
                </td>
            \`;

            // Actions
            tr.querySelector('.btn-edit-plan').addEventListener('click', () => this.loadPlanning(plan.id));

            const btnGen = tr.querySelector('.btn-generate-os');
            if (btnGen) {
                btnGen.addEventListener('click', () => this.App.ui.showAlert('Ação Gerar O.S. a ser implementada.', 'info'));
            }

            tbody.appendChild(tr);
        });
    }

    loadPlanning(id) {
        const plan = this.App.state.os_planejamento_cabecalho.find(p => p.id === id);
        if (!plan) return;

        this.currentPlanId = id;

        // Populate form
        this.els.companySelect.value = plan.empresaId;
        this.onCompanyChange(); // will load farms

        setTimeout(() => {
            this.els.farmSelect.value = plan.fazendaId;
            this.els.subgroupSelect.value = plan.subgrupoId;
            this.els.operationSelect.value = plan.operacaoId;
            this.els.serviceTypeSelect.value = plan.tipoServico;
            this.els.programSelect.value = plan.programa;
            this.els.dateInput.value = plan.dataPlanejada;
            this.els.responsibleInput.value = plan.responsavelMatricula;
            this.els.responsibleName.value = plan.responsavelNome;
            this.els.observations.value = plan.observacoes;

            this.els.statusBadge.textContent = plan.status;
            this.els.statusBadge.style.background = plan.status === 'PRONTO_PARA_OS' ? 'var(--color-info)' : 'var(--color-warning)';
            this.els.statusBadge.style.color = 'white';

            this.loadPlots(); // loads all plots

            // Set selected plots
            setTimeout(() => {
                const itens = this.App.state.os_planejamento_itens.filter(i => i.planejamentoId === id);
                this.selectedPlots.clear();
                itens.forEach(i => this.selectedPlots.add(i.talhaoId));
                this.renderPlotsList();
                this.updateSelectedCount();
                this.switchView('list');
            }, 100);

        }, 100);
    }

    initMap() {
        if (!this.mapInstance) {
            // Placeholder for mapbox initialization logic
            this.els.mapContainer.innerHTML = '<div style="display:flex; justify-content:center; align-items:center; height:100%; color: var(--color-text-light);">Carregando mapa...</div>';
            setTimeout(() => {
                this.els.mapContainer.innerHTML = '<div style="display:flex; justify-content:center; align-items:center; height:100%; color: var(--color-text-light);">Visualização de Mapa SHP em desenvolvimento. Utilize a "Lista de Talhões".</div>';
            }, 500);
        }
    }
}

// Expose globally or export
if (typeof window !== 'undefined') {
    window.PlanejamentoOsModule = PlanejamentoOsModule;
}
