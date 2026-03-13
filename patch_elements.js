const fs = require('fs');
let code = fs.readFileSync('docs/app.js', 'utf8');

const targetElements = `        elements: {
            regApp: {`;

const newElements = `        elements: {
            planOs: {
                companySelect: document.getElementById('planOsCompanySelect'),
                farmSelect: document.getElementById('planOsFarmSelect'),
                subgroupSelect: document.getElementById('planOsSubgroupSelect'),
                operationSelect: document.getElementById('planOsOperationSelect'),
                serviceTypeSelect: document.getElementById('planOsServiceTypeSelect'),
                programSelect: document.getElementById('planOsProgramSelect'),
                dateInput: document.getElementById('planOsDateInput'),
                responsibleInput: document.getElementById('planOsResponsibleInput'),
                responsibleName: document.getElementById('planOsResponsibleName'),
                observations: document.getElementById('planOsObservations'),
                saveDraftBtn: document.getElementById('planOsSaveDraftBtn'),
                saveReadyBtn: document.getElementById('planOsSaveReadyBtn'),
                tabList: document.getElementById('planOsTabList'),
                tabMap: document.getElementById('planOsTabMap'),
                tabSaved: document.getElementById('planOsTabSaved'),
                viewList: document.getElementById('planOsViewList'),
                viewMap: document.getElementById('planOsViewMap'),
                viewSaved: document.getElementById('planOsViewSaved'),
                plotsTableBody: document.getElementById('planOsPlotsTableBody'),
                searchPlots: document.getElementById('planOsSearchPlots'),
                selectAllPlotsBtn: document.getElementById('planOsSelectAllPlotsBtn'),
                mapContainer: document.getElementById('planOsMapContainer'),
                mapSelectedCount: document.getElementById('planOsMapSelectedCount'),
                savedTableBody: document.getElementById('planOsSavedTableBody'),
                statusBadge: document.getElementById('planOsStatusBadge'),
            },
            regApp: {`;

if (code.includes(targetElements)) {
    code = code.replace(targetElements, newElements);
    fs.writeFileSync('docs/app.js', code);
    console.log("App.elements patched successfully.");
} else {
    console.error("Target elements not found in docs/app.js");
}
