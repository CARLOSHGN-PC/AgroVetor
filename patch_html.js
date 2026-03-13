const fs = require('fs');
let code = fs.readFileSync('docs/index.html', 'utf8');

const anchor = `<section id="ordemServicoManual"`;
const sectionHtml = `
            <!-- Novo Módulo: Planejamento O.S. -->
            <section id="planejamentoOs" class="tab-content" aria-label="Planejamento O.S." tabindex="0" hidden style="padding: 0; height: calc(100% + 40px); width: calc(100% + 40px); margin: -20px; overflow: hidden; background: var(--color-bg);">
                <div style="display: flex; height: 100%; width: 100%;">

                    <!-- Sidebar (Formulário do Planejamento) -->
                    <div class="card" style="margin: 0; width: 400px; display: flex; flex-direction: column; height: 100%; overflow-y: auto; border-radius: 0; border-right: 1px solid var(--color-border); background: var(--color-surface); z-index: 10; flex-shrink: 0; box-shadow: var(--shadow-sm);">
                        <div style="padding: 20px;">
                            <h2 style="font-size: 20px; margin-bottom: 20px; color: var(--color-primary); display: flex; align-items: center; gap: 10px;">
                                <i class="fas fa-project-diagram"></i> Planejamento O.S.
                            </h2>

                            <div class="form-row">
                                <label for="planOsCompanySelect">Empresa*:</label>
                                <select id="planOsCompanySelect" required></select>
                            </div>

                            <div class="form-row">
                                <label for="planOsFarmSelect">Fazenda*:</label>
                                <select id="planOsFarmSelect" required disabled>
                                    <option value="">Selecione a empresa primeiro</option>
                                </select>
                            </div>

                            <div class="form-row">
                                <label for="planOsSubgroupSelect">Subgrupo*:</label>
                                <select id="planOsSubgroupSelect" required>
                                    <option value="">Selecione</option>
                                </select>
                            </div>

                            <div class="form-row">
                                <label for="planOsOperationSelect">Operação*:</label>
                                <select id="planOsOperationSelect" required>
                                    <option value="">Selecione</option>
                                </select>
                            </div>

                            <div class="form-row">
                                <label for="planOsServiceTypeSelect">Tipo de Serviço*:</label>
                                <select id="planOsServiceTypeSelect" required>
                                    <option value="">Selecione</option>
                                </select>
                            </div>

                            <div class="form-row">
                                <label for="planOsProgramSelect">Programa:</label>
                                <select id="planOsProgramSelect">
                                    <option value="">Nenhum</option>
                                </select>
                            </div>

                            <div class="form-row">
                                <label for="planOsDateInput">Data Planejada*:</label>
                                <input type="date" id="planOsDateInput" required>
                            </div>

                            <div class="form-row">
                                <label for="planOsResponsibleInput">Responsável* (Matrícula):</label>
                                <input type="text" id="planOsResponsibleInput" placeholder="Ex: 12345" required>
                            </div>

                            <div class="form-row">
                                <label for="planOsResponsibleName">Nome do Responsável:</label>
                                <input type="text" id="planOsResponsibleName" readonly style="background: var(--color-bg);">
                            </div>

                            <div class="form-row">
                                <label for="planOsObservations">Observações:</label>
                                <textarea id="planOsObservations" rows="3" placeholder="Detalhes do planejamento..."></textarea>
                            </div>

                            <div style="display: flex; gap: 10px; margin-top: 20px;">
                                <button id="planOsSaveDraftBtn" class="btn-secondary" style="flex: 1;"><i class="fas fa-save"></i> Salvar Rascunho</button>
                                <button id="planOsSaveReadyBtn" class="save" style="flex: 1;"><i class="fas fa-check"></i> Pronto para O.S.</button>
                            </div>
                        </div>
                    </div>

                    <!-- Área Principal (Lista de Talhões e Mapa) -->
                    <div style="flex: 1; display: flex; flex-direction: column; height: 100%; position: relative; background: var(--color-bg); overflow: hidden;">

                        <!-- Header Tabs para as Visões -->
                        <div style="background: var(--color-surface); padding: 10px 20px; border-bottom: 1px solid var(--color-border); display: flex; gap: 15px; align-items: center; z-index: 5;">
                            <div class="tab-controls" style="display: flex; gap: 10px;">
                                <button id="planOsTabList" class="btn-secondary active" style="margin: 0; padding: 5px 15px; border-radius: 20px;"><i class="fas fa-list"></i> Lista de Talhões</button>
                                <button id="planOsTabMap" class="btn-secondary" style="margin: 0; padding: 5px 15px; border-radius: 20px;"><i class="fas fa-map"></i> Mapa SHP</button>
                                <button id="planOsTabSaved" class="btn-secondary" style="margin: 0; padding: 5px 15px; border-radius: 20px;"><i class="fas fa-folder-open"></i> Planejamentos Salvos</button>
                            </div>
                            <div style="flex: 1;"></div>
                            <div id="planOsStatusBadge" style="padding: 5px 12px; border-radius: 12px; font-size: 12px; font-weight: bold; background: var(--color-border); color: var(--color-text);">NOVO PLANEJAMENTO</div>
                        </div>

                        <!-- Content Area -->
                        <div style="flex: 1; position: relative; overflow: hidden;">

                            <!-- Visão: Lista de Talhões -->
                            <div id="planOsViewList" style="position: absolute; inset: 0; padding: 20px; overflow-y: auto; background: var(--color-bg); display: block;">
                                <div class="card" style="margin: 0; min-height: 100%;">
                                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                                        <h3 style="margin: 0; font-size: 16px; color: var(--color-text);"><i class="fas fa-layer-group"></i> Talhões Disponíveis</h3>
                                        <div>
                                            <input type="text" id="planOsSearchPlots" placeholder="Buscar talhão..." style="padding: 5px 10px; border: 1px solid var(--color-border); border-radius: 4px; font-size: 14px;">
                                            <button id="planOsSelectAllPlotsBtn" class="btn-secondary" style="margin: 0 0 0 10px; padding: 5px 10px;"><i class="fas fa-check-double"></i> Selecionar Todos</button>
                                        </div>
                                    </div>
                                    <div class="table-container">
                                        <table class="data-table">
                                            <thead>
                                                <tr>
                                                    <th style="width: 40px; text-align: center;"><i class="fas fa-check"></i></th>
                                                    <th>Talhão</th>
                                                    <th>Área (ha)</th>
                                                    <th>Variedade</th>
                                                    <th>Última Aplicação</th>
                                                    <th>Seq. Atual</th>
                                                    <th>Ação Sugerida</th>
                                                    <th>Status</th>
                                                </tr>
                                            </thead>
                                            <tbody id="planOsPlotsTableBody">
                                                <tr>
                                                    <td colspan="8" style="text-align: center; color: var(--color-text-light); padding: 30px;">
                                                        Selecione uma Fazenda e Operação para carregar os talhões.
                                                    </td>
                                                </tr>
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>

                            <!-- Visão: Mapa -->
                            <div id="planOsViewMap" style="position: absolute; inset: 0; display: none; background: #e0e0e0;">
                                <!-- Container do Mapbox -->
                                <div id="planOsMapContainer" style="width: 100%; height: 100%;"></div>

                                <!-- Overlay Flutuante do Mapa -->
                                <div style="position: absolute; top: 20px; right: 20px; background: var(--color-surface); padding: 15px; border-radius: var(--border-radius); box-shadow: var(--shadow-md); width: 250px; z-index: 10;">
                                    <h4 style="margin: 0 0 10px 0; font-size: 14px;"><i class="fas fa-info-circle"></i> Seleção por Mapa</h4>
                                    <p style="font-size: 12px; color: var(--color-text-light); margin-bottom: 10px;">Clique nos polígonos para selecionar/deselecionar talhões.</p>
                                    <div style="display: flex; justify-content: space-between; font-size: 13px; font-weight: bold;">
                                        <span>Selecionados:</span>
                                        <span id="planOsMapSelectedCount" style="color: var(--color-primary);">0</span>
                                    </div>
                                </div>
                            </div>

                            <!-- Visão: Salvos -->
                            <div id="planOsViewSaved" style="position: absolute; inset: 0; padding: 20px; overflow-y: auto; background: var(--color-bg); display: none;">
                                <div class="card" style="margin: 0;">
                                    <h3 style="margin-top: 0; margin-bottom: 15px; font-size: 16px;"><i class="fas fa-folder"></i> Planejamentos Salvos</h3>
                                    <div class="table-container">
                                        <table class="data-table">
                                            <thead>
                                                <tr>
                                                    <th>ID Planejamento</th>
                                                    <th>Data Plan.</th>
                                                    <th>Fazenda</th>
                                                    <th>Operação</th>
                                                    <th>Status</th>
                                                    <th>Ações</th>
                                                </tr>
                                            </thead>
                                            <tbody id="planOsSavedTableBody">
                                                <tr>
                                                    <td colspan="6" style="text-align: center; color: var(--color-text-light); padding: 20px;">Nenhum planejamento salvo encontrado.</td>
                                                </tr>
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>

                        </div>
                    </div>
                </div>
            </section>

`;

if (code.includes(anchor)) {
    code = code.replace(anchor, sectionHtml + anchor);
    fs.writeFileSync('docs/index.html', code);
    console.log("HTML patched successfully.");
} else {
    console.error("Target anchor not found in docs/index.html");
}
