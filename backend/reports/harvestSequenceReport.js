const PDFDocument = require('pdfkit');
const xlsx = require('xlsx');

const STATUS_ORDER = ['Planejado', 'Em Execução', 'Colhido', 'Cancelado'];

function normalizeDate(dateLike) {
    if (!dateLike) return '';
    if (typeof dateLike === 'string') return dateLike;
    if (dateLike.toDate) return dateLike.toDate().toISOString().slice(0, 10);
    if (dateLike instanceof Date) return dateLike.toISOString().slice(0, 10);
    return String(dateLike);
}

async function getHarvestSequenceData(db, companyId, planId, filters = {}) {
    const planRef = db.collection('harvest_plans').doc(planId);
    const planDoc = await planRef.get();

    if (!planDoc.exists) {
        throw new Error('Plano de colheita não encontrado.');
    }

    const plan = planDoc.data();
    if (plan.companyId !== companyId) {
        throw new Error('Sem permissão para acessar este plano.');
    }

    const frontsSnap = await planRef.collection('fronts').get();
    const frontsById = {};
    frontsSnap.forEach((d) => {
        frontsById[d.id] = d.data();
    });

    const itemsSnap = await planRef.collection('items').get();
    let rows = [];
    itemsSnap.forEach((doc) => {
        const item = doc.data();
        rows.push({
            id: doc.id,
            frenteId: item.frenteId || '',
            frenteNome: item.frenteNome || frontsById[item.frenteId]?.nome || item.frenteId || '-',
            frenteCor: item.frenteCor || frontsById[item.frenteId]?.cor || '#64748b',
            sequencia: Number(item.sequencia || 0),
            fazenda: item.fazendaNome || item.fazendaId || '-',
            fazendaId: item.fazendaId || '',
            talhao: item.talhaoNome || item.talhaoId || '-',
            talhaoId: item.talhaoId || '',
            area: Number(item.areaSnapshot || 0),
            variedade: item.variedadeSnapshot || item.variedade || '-',
            status: item.status || 'Planejado',
            dtPrevistaInicio: normalizeDate(item.dtPrevistaInicio),
            dtPrevistaFim: normalizeDate(item.dtPrevistaFim),
            dtExecucaoInicio: normalizeDate(item.dtExecucaoInicio),
            dtExecucaoFim: normalizeDate(item.dtExecucaoFim),
            observacao: item.observacao || '',
            geometry: item.geomSnapshot || null
        });
    });

    if (filters.frentes?.length) {
        rows = rows.filter((r) => filters.frentes.includes(r.frenteId));
    }
    if (filters.status?.length) {
        rows = rows.filter((r) => filters.status.includes(r.status));
    }
    if (filters.fazendaId) {
        rows = rows.filter((r) => r.fazendaId === filters.fazendaId);
    }
    if (filters.talhaoId) {
        rows = rows.filter((r) => r.talhaoId === filters.talhaoId);
    }

    rows.sort((a, b) => {
        if (a.frenteNome !== b.frenteNome) return a.frenteNome.localeCompare(b.frenteNome);
        if (a.sequencia !== b.sequencia) return a.sequencia - b.sequencia;
        if (a.fazenda !== b.fazenda) return a.fazenda.localeCompare(b.fazenda);
        return STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status);
    });

    return { plan, rows };
}

function generateOperationalPdf({ plan, rows, filters = {} }) {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 24 });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));

    doc.fontSize(16).text('Relatório Operacional - Sequência de Colheita', { align: 'left' });
    doc.moveDown(0.3);
    doc.fontSize(10).fillColor('#475569').text(`Safra: ${plan.safra || '-'} | Período: ${normalizeDate(plan.periodStart)} a ${normalizeDate(plan.periodEnd)}`);
    doc.text(`Filtros: ${JSON.stringify(filters)}`);
    doc.moveDown(0.7).fillColor('#000');

    const columns = [
        { key: 'frenteNome', title: 'Frente', width: 82 },
        { key: 'sequencia', title: 'Seq.', width: 38 },
        { key: 'fazenda', title: 'Fazenda', width: 110 },
        { key: 'talhao', title: 'Talhão', width: 90 },
        { key: 'area', title: 'Área', width: 52 },
        { key: 'variedade', title: 'Variedade', width: 86 },
        { key: 'status', title: 'Status', width: 74 },
        { key: 'dtPrevistaInicio', title: 'Prev. Início', width: 74 },
        { key: 'dtPrevistaFim', title: 'Prev. Fim', width: 70 },
        { key: 'observacao', title: 'Obs', width: 110 }
    ];

    let x = 24;
    let y = doc.y;
    doc.fontSize(9).font('Helvetica-Bold');
    columns.forEach((c) => {
        doc.text(c.title, x, y, { width: c.width });
        x += c.width;
    });

    y += 16;
    doc.moveTo(24, y).lineTo(24 + columns.reduce((s, c) => s + c.width, 0), y).stroke('#94a3b8');
    y += 4;

    doc.font('Helvetica').fontSize(8);
    rows.forEach((row) => {
        if (y > 560) {
            doc.addPage({ size: 'A4', layout: 'landscape', margin: 24 });
            y = 24;
        }
        x = 24;
        columns.forEach((c) => {
            const value = c.key === 'area' ? row[c.key].toFixed(2) : String(row[c.key] ?? '');
            doc.text(value, x, y, { width: c.width, ellipsis: true });
            x += c.width;
        });
        y += 14;
    });

    doc.end();
    return Buffer.concat(chunks);
}

function generateOperationalExcel({ rows }) {
    const wsData = rows.map((r) => ({
        Frente: r.frenteNome,
        Sequencia: r.sequencia,
        Fazenda: r.fazenda,
        Talhao: r.talhao,
        Area: r.area,
        Variedade: r.variedade,
        Status: r.status,
        PrevistaInicio: r.dtPrevistaInicio,
        PrevistaFim: r.dtPrevistaFim,
        ExecucaoInicio: r.dtExecucaoInicio,
        ExecucaoFim: r.dtExecucaoFim,
        Observacao: r.observacao
    }));

    const wb = xlsx.utils.book_new();
    const ws = xlsx.utils.json_to_sheet(wsData);
    xlsx.utils.book_append_sheet(wb, ws, 'Sequencia');
    return xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

function flattenGeometryCoordinates(geometry) {
    if (!geometry || !geometry.type || !Array.isArray(geometry.coordinates)) return [];
    if (geometry.type === 'Polygon') return geometry.coordinates[0] || [];
    if (geometry.type === 'MultiPolygon') return geometry.coordinates[0]?.[0] || [];
    return [];
}

function generateMapPdf({ plan, rows, filters = {}, pageSize = 'A4' }) {
    const doc = new PDFDocument({ size: pageSize, layout: 'landscape', margin: 20 });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));

    const width = doc.page.width - 40;
    const height = doc.page.height - 90;
    const mapX = 20;
    const mapY = 55;

    doc.fontSize(15).text('Relatório de Mapa - Sequência de Colheita', 20, 20);
    doc.fontSize(9).fillColor('#475569').text(`Período ${normalizeDate(plan.periodStart)} a ${normalizeDate(plan.periodEnd)} | Filtros: ${JSON.stringify(filters)}`, 20, 38);
    doc.rect(mapX, mapY, width, height).stroke('#cbd5e1');

    const withGeom = rows.filter((r) => r.geometry);
    const allPoints = withGeom.flatMap((r) => flattenGeometryCoordinates(r.geometry));

    if (allPoints.length) {
        const lons = allPoints.map((p) => p[0]);
        const lats = allPoints.map((p) => p[1]);
        const minLon = Math.min(...lons), maxLon = Math.max(...lons);
        const minLat = Math.min(...lats), maxLat = Math.max(...lats);

        const project = (coord) => {
            const lon = coord[0], lat = coord[1];
            const px = mapX + ((lon - minLon) / ((maxLon - minLon) || 1)) * width;
            const py = mapY + height - ((lat - minLat) / ((maxLat - minLat) || 1)) * height;
            return [px, py];
        };

        withGeom.forEach((row) => {
            const ring = flattenGeometryCoordinates(row.geometry);
            if (!ring.length) return;
            doc.save();
            doc.fillColor(row.frenteCor || '#64748b').strokeColor('#0f172a').lineWidth(0.8);
            ring.forEach((coord, idx) => {
                const [px, py] = project(coord);
                if (idx === 0) doc.moveTo(px, py);
                else doc.lineTo(px, py);
            });
            doc.closePath().fillOpacity(0.58).fillAndStroke();
            doc.restore();

            const [labelX, labelY] = project(ring[Math.floor(ring.length / 2)]);
            doc.fontSize(10).fillColor('#fff').text(String(row.sequencia || ''), labelX - 5, labelY - 5, { width: 10, align: 'center' });
        });
    }

    let legendY = mapY + 8;
    const fronts = [...new Map(rows.map(r => [r.frenteId, { name: r.frenteNome, color: r.frenteCor }])).values()];
    doc.fontSize(9).fillColor('#111827').text('Legenda:', mapX + 8, legendY);
    legendY += 14;
    fronts.forEach((front) => {
        doc.rect(mapX + 8, legendY + 1, 10, 10).fill(front.color || '#64748b').stroke('#0f172a');
        doc.fillColor('#111827').text(front.name, mapX + 22, legendY);
        legendY += 14;
    });

    doc.addPage({ size: 'A4', layout: 'portrait', margin: 24 });
    doc.fontSize(14).text('Lista Operacional da Sequência');
    let y = 50;
    doc.fontSize(9);
    rows.forEach((r) => {
        if (y > 780) { doc.addPage(); y = 24; }
        doc.text(`${r.frenteNome} | #${r.sequencia} | ${r.fazenda} - ${r.talhao} | ${r.status}`, 24, y);
        y += 14;
    });

    doc.end();
    return Buffer.concat(chunks);
}

module.exports = {
    getHarvestSequenceData,
    generateOperationalPdf,
    generateOperationalExcel,
    generateMapPdf
};
