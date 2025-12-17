const { setupDoc, generatePdfHeader, generatePdfFooter, drawTable, formatNumber } = require('../utils/pdfGenerator');
const { getShapefileData, findTalhaoForTrap, findShapefileProp, safeToDate } = require('../utils/geoUtils');
const admin = require('firebase-admin');

async function generateApplicationMapPdf(req, res, db) {
    const doc = setupDoc({ autoFirstPage: false });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=relatorio_aplicacao.pdf`);
    doc.pipe(res);

    try {
        const { companyId, farmId, inicio, fim, generatedBy } = req.query;

        if (!companyId || !farmId || !inicio || !fim) {
            throw new Error('Faltam parâmetros obrigatórios (companyId, farmId, inicio, fim).');
        }

        // 1. Fetch Data
        const snapshot = await db.collection('registroAplicacao')
            .where('companyId', '==', companyId)
            .where('farmId', '==', farmId)
            .where('date', '>=', inicio)
            .where('date', '<=', fim)
            .get();

        if (snapshot.empty) {
            doc.addPage({ layout: 'portrait' });
            await generatePdfHeader(doc, 'Relatório de Aplicação', companyId, db);
            doc.text('Nenhum registro de aplicação encontrado para os filtros selecionados.');
            generatePdfFooter(doc, generatedBy);
            return doc.end();
        }

        const records = [];
        snapshot.forEach(doc => records.push(doc.data()));

        // Group data by plot to determine final status/shift
        const plotStatus = new Map(); // plotName -> { shift, area, operator, date }

        // Stats
        const stats = {
            'A': { area: 0, count: 0, color: '#FFEB3B' }, // Amarelo
            'B': { area: 0, count: 0, color: '#2196F3' }, // Azul
            'C': { area: 0, count: 0, color: '#4CAF50' }, // Verde
            'Administrativo': { area: 0, count: 0, color: '#9E9E9E' } // Cinza
        };

        records.forEach(record => {
            // Normalize shift
            let shift = record.shift || 'N/A';
            if(shift.includes('Turno A')) shift = 'A';
            if(shift.includes('Turno B')) shift = 'B';
            if(shift.includes('Turno C')) shift = 'C';
            if(!['A', 'B', 'C'].includes(shift)) shift = 'Administrativo';

            // Process detail plots if available, else fallback to selectedPlots array
            if (record.plotDetails && Array.isArray(record.plotDetails)) {
                record.plotDetails.forEach(detail => {
                    const plotName = detail.talhaoName;
                    // Store latest info for the plot
                    plotStatus.set(plotName, {
                        shift: shift,
                        area: detail.areaAplicada,
                        operator: record.operator,
                        date: record.date
                    });
                });
            } else if (record.selectedPlots && Array.isArray(record.selectedPlots)) {
                record.selectedPlots.forEach(plotName => {
                    plotStatus.set(plotName, {
                        shift: shift,
                        area: 0, // Placeholder, will fill from SHP
                        operator: record.operator,
                        date: record.date
                    });
                });
            }
        });

        // 2. Load Shapefile (Reusing Logic from riskViewReport via getShapefileData)
        const geojsonData = await getShapefileData(db, companyId);

        // Fetch Farm Data for Title
        const farmDoc = await db.collection('fazendas').doc(farmId).get();
        const farmData = farmDoc.exists ? farmDoc.data() : { name: 'Desconhecida', code: '000' };

        doc.addPage({ layout: 'landscape', margin: 30 });
        const pageMargin = 30;

        const mapAreaWidth = doc.page.width * 0.65;
        const mapX = pageMargin;
        const mapY = pageMargin;
        const mapWidth = mapAreaWidth - pageMargin;
        const mapHeight = doc.page.height - (pageMargin * 2);

        if (geojsonData) {
            const farmFeatures = geojsonData.features.filter(f => {
                if (!f.properties) return false;
                const propKeys = Object.keys(f.properties);
                const codeKey = propKeys.find(k => k.toLowerCase() === 'fundo_agr' || k.toLowerCase() === 'agv_fundo');
                if (!codeKey) return false;

                // Compare farm code from record to shapefile
                // Assuming farmData.code exists
                const featureFarmCode = f.properties[codeKey];
                return featureFarmCode && parseInt(featureFarmCode, 10) === parseInt(farmData.code, 10);
            });

            if (farmFeatures.length > 0) {
                // Calculate bounding box
                const allCoords = farmFeatures.flatMap(f => f.geometry.type === 'Polygon' ? f.geometry.coordinates[0] : f.geometry.coordinates.flatMap(p => p[0]));
                const bbox = {
                    minX: Math.min(...allCoords.map(c => c[0])), maxX: Math.max(...allCoords.map(c => c[0])),
                    minY: Math.min(...allCoords.map(c => c[1])), maxY: Math.max(...allCoords.map(c => c[1])),
                };

                // Scale logic
                const scaleX = mapWidth / (bbox.maxX - bbox.minX);
                const scaleY = mapHeight / (bbox.maxY - bbox.minY);
                const scale = Math.min(scaleX, scaleY) * 0.95;
                const offsetX = mapX + (mapWidth - (bbox.maxX - bbox.minX) * scale) / 2;
                const offsetY = mapY + (mapHeight - (bbox.maxY - bbox.minY) * scale) / 2;

                const transformCoord = (coord) => [ (coord[0] - bbox.minX) * scale + offsetX, (bbox.maxY - coord[1]) * scale + offsetY ];

                doc.save();
                doc.lineWidth(0.5).strokeColor('#333');

                farmFeatures.forEach(feature => {
                    const talhaoNome = findShapefileProp(feature.properties, ['CD_TALHAO', 'COD_TALHAO', 'TALHAO', 'AGV_TALHAO']) || 'N/A';

                    let fillColor = '#e0e0e0'; // Default gray
                    const status = plotStatus.get(talhaoNome);

                    if (status) {
                        fillColor = stats[status.shift]?.color || '#9E9E9E';

                        // Calculate area if missing in record but available in shapefile
                        if (status.area === 0) {
                            const areaKey = findShapefileProp(feature.properties, ['AREA', 'HECTARES', 'HA'], true); // true returns key
                            if (areaKey) {
                                status.area = parseFloat(feature.properties[areaKey]) || 0;
                            }
                        }

                        // Accumulate stats
                        if (stats[status.shift]) {
                            // Avoid double counting if iterating features (ensure 1-to-1 or use set)
                            // Assuming talhaoNome is unique per farm in this context.
                            // However, geojson might have multipart. We should only count once per plot name.
                            // For simplicity here, we accumulated in `stats` later by iterating `plotStatus`.
                        }
                    }

                    doc.fillColor(fillColor);
                    const polygons = feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates;
                    polygons.forEach(polygon => {
                        const path = polygon[0];
                        if (!path || path.length === 0) return;
                        const firstPoint = transformCoord(path[0]);
                        doc.moveTo(firstPoint[0], firstPoint[1]);
                        for (let i = 1; i < path.length; i++) doc.lineTo(...transformCoord(path[i]));
                        doc.fillAndStroke();
                    });

                    // Draw Label
                    // Calculate center rough
                    /*
                    if (status) { // Only label done plots? Or all? Let's label all
                        const center = transformCoord(allCoords[0]); // Very rough center
                        // Better center calculation is needed for labels, omitting for now to avoid clutter
                    }
                    */
                });
                doc.restore();
            } else {
                doc.fontSize(10).text('Geometria da fazenda não encontrada no shapefile.', mapX + 10, mapY + 10);
            }
        } else {
            doc.fontSize(10).text('Shapefile não carregado.', mapX + 10, mapY + 10);
        }

        // 3. Draw Side Panel (Legend & Stats)
        const dataX = mapAreaWidth + 15;
        const dataWidth = doc.page.width - mapAreaWidth - (pageMargin * 2) - 15;
        let currentY = pageMargin;

        // Title
        doc.fontSize(16).font('Helvetica-Bold').text(`FAZENDA ${farmData.name.toUpperCase()}`, dataX, currentY, { width: dataWidth });
        currentY = doc.y + 5;
        doc.fontSize(10).font('Helvetica').text(`Aplicação: ${inicio} a ${fim}`, dataX, currentY, { width: dataWidth });
        currentY = doc.y + 20;

        // Calculate Totals
        // Re-iterate map to ensure correct summing
        plotStatus.forEach((val) => {
            if (stats[val.shift]) {
                stats[val.shift].area += val.area;
                stats[val.shift].count += 1;
            }
        });

        // Legend
        doc.fontSize(12).font('Helvetica-Bold').text('Legenda & Totais', dataX, currentY);
        currentY = doc.y + 10;

        Object.entries(stats).forEach(([shift, data]) => {
            if (data.count === 0 && shift !== 'A' && shift !== 'B' && shift !== 'C') return; // Skip empty admin

            // Draw Color Box
            doc.save();
            doc.rect(dataX, currentY, 15, 15).fill(data.color);
            doc.restore();

            // Text
            const label = `Turno ${shift}`;
            doc.fontSize(10).font('Helvetica-Bold').fillColor('#000').text(label, dataX + 25, currentY + 3);

            // Value
            const valueText = `${data.area.toFixed(2)} ha (${data.count} talhões)`;
            doc.fontSize(10).font('Helvetica').text(valueText, dataX + 25, currentY + 15);

            currentY += 35;
        });

        // Total
        const totalArea = Object.values(stats).reduce((sum, s) => sum + s.area, 0);
        currentY += 10;
        doc.fontSize(12).font('Helvetica-Bold').text(`Área Total Aplicada: ${totalArea.toFixed(2)} ha`, dataX, currentY);

        // Logo
        let logoBase64 = null;
        try {
            const configDoc = await db.collection('config').doc(companyId).get();
            if (configDoc.exists && configDoc.data().logoBase64) {
                logoBase64 = configDoc.data().logoBase64;
            }
        } catch (e) { console.error("Could not fetch company logo:", e); }

        if (logoBase64) {
            const logoWidth = 80;
            const logoX = dataX + (dataWidth / 2) - (logoWidth / 2);
            const logoY = doc.page.height - pageMargin - 80;
            doc.image(logoBase64, logoX, logoY, { width: logoWidth });
        }

        generatePdfFooter(doc, generatedBy);
        doc.end();

    } catch (error) {
        console.error('Erro ao gerar PDF de Aplicação:', error);
        if (!res.headersSent) {
            res.status(500).send(`Erro interno: ${error.message}`);
        } else {
            doc.end();
        }
    }
}

module.exports = { generateApplicationMapPdf };
