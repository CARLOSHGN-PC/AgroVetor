const { setupDoc, getLogoBase64, generatePdfHeader, generatePdfFooter, drawTable, formatNumber, calculateColumnWidths, formatDate } = require('../utils/pdfGenerator');
const { getFilteredData } = require('../utils/dataUtils');

const getFleetData = async (db, filters) => {
    let query = db.collection('controleFrota').where('companyId', '==', filters.companyId);

    // Filters for Start Date (dataSaida)
    if (filters.inicio) {
        query = query.where('dataSaida', '>=', filters.inicio + 'T00:00:00');
    }
    if (filters.fim) {
        query = query.where('dataSaida', '<=', filters.fim + 'T23:59:59');
    }

    // Additional filters (client-side filtering might be needed if Firestore indexes are missing)
    // But let's try to filter in memory for complex combinations if query fails, or rely on simple filters

    const snapshot = await query.get();
    let data = [];
    snapshot.forEach(doc => {
        data.push({ id: doc.id, ...doc.data() });
    });

    // In-memory filtering for optional fields to avoid composite index explosion
    if (filters.veiculoId) {
        data = data.filter(item => item.veiculoId === filters.veiculoId);
    }
    if (filters.motorista) {
        const term = filters.motorista.toLowerCase();
        data = data.filter(item => (item.motorista || '').toLowerCase().includes(term));
    }

    // Sort by Date Descending
    return data.sort((a, b) => new Date(b.dataSaida) - new Date(a.dataSaida));
};

const generateFleetPdf = async (req, res, db) => {
    const doc = setupDoc(); // Defaults to Portrait
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=relatorio_frota.pdf');
    doc.pipe(res);

    try {
        const filters = req.query;
        const data = await getFleetData(db, filters);
        const title = 'Relatório de Controle de Frota';
        const logoBase64 = await getLogoBase64(db, filters.companyId);

        if (data.length === 0) {
            await generatePdfHeader(doc, title, logoBase64);
            doc.text('Nenhum registro encontrado para os filtros selecionados.');
            generatePdfFooter(doc, filters.generatedBy);
            doc.end();
            return;
        }

        let currentY = await generatePdfHeader(doc, title, logoBase64);

        const headers = ['Data Saída', 'Data Chegada', 'Veículo', 'Motorista', 'Origem', 'Destino', 'KM Inicial', 'KM Final', 'KM Rodado'];

        const rows = data.map(item => {
            const saida = new Date(item.dataSaida).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
            const chegada = item.dataChegada ? new Date(item.dataChegada).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'Em Trânsito';

            return [
                saida,
                chegada,
                item.veiculoNome || 'N/A',
                item.motorista || 'N/A',
                item.origem || '',
                item.destino || '',
                Number.isFinite(item.kmInicial) ? `${item.kmInicial.toFixed(1)} km` : '-',
                Number.isFinite(item.kmFinal) ? `${item.kmFinal.toFixed(1)} km` : '-',
                item.kmRodado ? `${item.kmRodado.toFixed(1)} km` : '-'
            ];
        });

        // Calculate generic widths
        const columnWidths = calculateColumnWidths(doc, headers, rows, doc.page.width, doc.page.margins);

        currentY = await drawTable(doc, headers, rows, title, logoBase64, currentY, columnWidths);

        // Optional: Summary of Total KM
        const totalKM = data.reduce((sum, item) => sum + (item.kmRodado || 0), 0);
        doc.moveDown();
        doc.font('Helvetica-Bold').text(`Total de Quilómetros Rodados: ${totalKM.toFixed(1)} km`, { align: 'right' });

        generatePdfFooter(doc, filters.generatedBy);
        doc.end();

    } catch (error) {
        console.error("Erro ao gerar PDF de Frota:", error);
        if (!res.headersSent) {
            res.status(500).send(`Erro ao gerar relatório: ${error.message}`);
        } else {
            doc.end();
        }
    }
};

module.exports = {
    getFleetData,
    generateFleetPdf
};
