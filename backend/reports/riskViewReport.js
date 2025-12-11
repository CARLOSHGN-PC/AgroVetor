const { setupDoc, generatePdfHeader, generatePdfFooter, drawTable, formatNumber } = require('../utils/pdfGenerator');
const { getShapefileData, findTalhaoForTrap, findShapefileProp, safeToDate } = require('../utils/geoUtils');
const admin = require('firebase-admin');

const getRiskViewData = async (db, filters) => {
    const { companyId, inicio, fim, fazendaCodigo, riskOnly } = filters;
    if (!companyId) {
        throw new Error("O ID da empresa é obrigatório para calcular o risco.");
    }

    let collectedTrapsInRangeQuery = db.collection('armadilhas').where('companyId', '==', companyId).where('status', '==', 'Coletada');
    if (inicio) {
        collectedTrapsInRangeQuery = collectedTrapsInRangeQuery.where('dataColeta', '>=', new Date(inicio + 'T00:00:00Z'));
    }
    if (fim) {
        const endDate = new Date(fim);
        endDate.setUTCDate(endDate.getUTCDate() + 1);
        collectedTrapsInRangeQuery = collectedTrapsInRangeQuery.where('dataColeta', '<', endDate);
    }
    const collectedTrapsInRangeSnapshot = await collectedTrapsInRangeQuery.get();
    const collectedTrapsInRange = [];
    collectedTrapsInRangeSnapshot.forEach(doc => {
        collectedTrapsInRange.push({ id: doc.id, ...doc.data() });
    });

    const trapsByFarmCode = collectedTrapsInRange.reduce((acc, trap) => {
        const code = String(trap.fazendaCode || 'unknown').trim();
        if (!acc[code]) {
            acc[code] = [];
        }
        acc[code].push(trap);
        return acc;
    }, {});

    let activeFarmCodes = Object.keys(trapsByFarmCode);
    if (fazendaCodigo) {
        activeFarmCodes = activeFarmCodes.filter(code => code === String(fazendaCodigo).trim());
    }

    if (activeFarmCodes.length === 0) {
        return { reportFarms: [], farmRiskData: {}, latestCycleTraps: [] };
    }

    const allActiveFarmsData = [];
    if (activeFarmCodes.length > 0) {
        const CHUNK_SIZE = 30;
        const farmCodeChunks = [];
        for (let i = 0; i < activeFarmCodes.length; i += CHUNK_SIZE) {
            farmCodeChunks.push(activeFarmCodes.slice(i, i + CHUNK_SIZE));
        }

        const queryPromises = farmCodeChunks.map(chunk =>
            db.collection('fazendas')
              .where('companyId', '==', companyId)
              .where('code', 'in', chunk)
              .get()
        );

        const snapshotResults = await Promise.all(queryPromises);
        snapshotResults.forEach(snapshot => {
            snapshot.forEach(doc => {
                allActiveFarmsData.push({ id: doc.id, ...doc.data() });
            });
        });
    }

    const reportFarms = [];
    const farmRiskData = {};
    let latestCycleTraps = [];

    for (const farm of allActiveFarmsData) {
        const farmCode = String(farm.code).trim();
        const collectedTrapsOnFarm = trapsByFarmCode[farmCode] || [];

        if (collectedTrapsOnFarm.length === 0) {
            farmRiskData[farm.code] = { riskPercentage: 0, totalTraps: 0, highCountTraps: 0 };
            reportFarms.push({ ...farm, riskPercentage: 0, totalTraps: 0, highCountTraps: 0 });
            continue;
        }

        let mostRecentCollectionDate = new Date(0);
        collectedTrapsOnFarm.forEach(trap => {
            const collectionDate = safeToDate(trap.dataColeta);
            if (collectionDate > mostRecentCollectionDate) {
                mostRecentCollectionDate = collectionDate;
            }
        });

        const latestCycleCollections = collectedTrapsOnFarm.filter(trap => {
            const collectionDate = safeToDate(trap.dataColeta);
            return collectionDate.getFullYear() === mostRecentCollectionDate.getFullYear() &&
                   collectionDate.getMonth() === mostRecentCollectionDate.getMonth() &&
                   collectionDate.getDate() === mostRecentCollectionDate.getDate();
        });

        const latestUniqueCollections = new Map();
        latestCycleCollections.forEach(trap => {
            const trapKey = trap.id;
            const existing = latestUniqueCollections.get(trapKey);
            const collectionDate = safeToDate(trap.dataColeta);
            if (!existing || collectionDate > safeToDate(existing.dataColeta)) {
                latestUniqueCollections.set(trapKey, trap);
            }
        });
        const finalCycleTraps = Array.from(latestUniqueCollections.values());
        latestCycleTraps.push(...finalCycleTraps);

        const highCountTraps = finalCycleTraps.filter(t => t.contagemMariposas >= 6);
        const divisor = finalCycleTraps.length;
        const riskPercentage = divisor > 0 ? (highCountTraps.length / divisor) * 100 : 0;

        farmRiskData[farm.code] = {
            riskPercentage,
            totalTraps: divisor,
            highCountTraps: highCountTraps.length
        };

        reportFarms.push({
            ...farm,
            riskPercentage: riskPercentage,
            totalTraps: divisor,
            highCountTraps: highCountTraps.length
        });
    }

    reportFarms.sort((a, b) => (parseInt(a.code, 10) || 0) - (parseInt(b.code, 10) || 0));

    let finalReportFarms = reportFarms;
    if (riskOnly === 'true') {
        finalReportFarms = reportFarms.filter(farm => farm.riskPercentage >= 30);
    }

    return { reportFarms: finalReportFarms, farmRiskData, latestCycleTraps };
};

const generateRiskViewPdf = async (req, res, db) => {
    const doc = setupDoc({ autoFirstPage: false });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=relatorio_risco.pdf`);
    doc.pipe(res);

    try {
        const { generatedBy, companyId } = req.query;
        if (!companyId) throw new Error('O ID da empresa não foi fornecido.');

        const { reportFarms, latestCycleTraps } = await getRiskViewData(db, req.query);
        const geojsonData = await getShapefileData(db, companyId);

        if (reportFarms.length === 0) {
            doc.addPage({ layout: 'portrait' });
            await generatePdfHeader(doc, 'Relatório de Visualização de Risco', companyId, db);
            doc.text('Nenhuma fazenda com coletas encontrada para os filtros selecionados.');
            generatePdfFooter(doc, generatedBy);
            return doc.end();
        }

        let logoBase64 = null;
        try {
            const configDoc = await db.collection('config').doc(companyId).get();
            if (configDoc.exists && configDoc.data().logoBase64) {
                logoBase64 = configDoc.data().logoBase64;
            }
        } catch (e) { console.error("Could not fetch company logo:", e); }

        for (const farm of reportFarms) {
            const farmTraps = latestCycleTraps.filter(t => (t.fazendaCode ? String(t.fazendaCode).trim() === String(farm.code).trim() : t.fazendaNome === farm.name));
            const trapsByTalhao = {};
            if (geojsonData) {
                for (const trap of farmTraps) {
                    const talhaoProps = findTalhaoForTrap(trap, geojsonData);
                    const talhaoNome = findShapefileProp(talhaoProps, ['CD_TALHAO', 'COD_TALHAO', 'TALHAO']) || trap.talhaoNome || 'N/A';
                    if (!trapsByTalhao[talhaoNome]) {
                        trapsByTalhao[talhaoNome] = { total: 0, high: 0, mothSum: 0 };
                    }
                    trapsByTalhao[talhaoNome].total++;
                    trapsByTalhao[talhaoNome].mothSum += trap.contagemMariposas || 0;
                    if (trap.contagemMariposas >= 6) {
                        trapsByTalhao[talhaoNome].high++;
                    }
                }
            }

            doc.addPage({ layout: 'landscape', margin: 30 });
            const pageMargin = 30;

            const mapAreaWidth = doc.page.width * 0.60;
            const mapX = pageMargin;
            const mapY = pageMargin;
            const mapWidth = mapAreaWidth - pageMargin;
            const mapHeight = doc.page.height - (pageMargin * 2);

            if (geojsonData) {
                const farmFeatures = geojsonData.features.filter(f => {
                    if (!f.properties) return false;
                    const propKeys = Object.keys(f.properties);
                    const codeKey = propKeys.find(k => k.toLowerCase() === 'fundo_agr');
                    if (!codeKey) return false;
                    const featureFarmCode = f.properties[codeKey];
                    return featureFarmCode && parseInt(featureFarmCode, 10) === parseInt(farm.code, 10);
                });

                if (farmFeatures.length > 0) {
                    const allCoords = farmFeatures.flatMap(f => f.geometry.type === 'Polygon' ? f.geometry.coordinates[0] : f.geometry.coordinates.flatMap(p => p[0]));
                    const bbox = {
                        minX: Math.min(...allCoords.map(c => c[0])), maxX: Math.max(...allCoords.map(c => c[0])),
                        minY: Math.min(...allCoords.map(c => c[1])), maxY: Math.max(...allCoords.map(c => c[1])),
                    };
                    const scaleX = mapWidth / (bbox.maxX - bbox.minX);
                    const scaleY = mapHeight / (bbox.maxY - bbox.minY);
                    const scale = Math.min(scaleX, scaleY) * 0.95;
                    const offsetX = mapX + (mapWidth - (bbox.maxX - bbox.minX) * scale) / 2;
                    const offsetY = mapY + (mapHeight - (bbox.maxY - bbox.minY) * scale) / 2;

                    const transformCoord = (coord) => [ (coord[0] - bbox.minX) * scale + offsetX, (bbox.maxY - coord[1]) * scale + offsetY ];

                    doc.save();
                    doc.lineWidth(0.5).strokeColor('#555');

                    farmFeatures.forEach(feature => {
                        const talhaoNome = findShapefileProp(feature.properties, ['CD_TALHAO', 'COD_TALHAO', 'TALHAO']) || 'N/A';
                        const talhaoInfo = trapsByTalhao[talhaoNome];
                        let fillColor = '#d3d3d3';

                        if (talhaoInfo) {
                            const riskPerc = talhaoInfo.total > 0 ? (talhaoInfo.high / talhaoInfo.total) * 100 : 0;
                            if (riskPerc >= 30) {
                                fillColor = '#d9534f';
                            } else if (riskPerc > 0) {
                                fillColor = '#f0ad4e';
                            } else {
                                fillColor = '#5cb85c';
                            }
                        }

                        doc.fillColor(fillColor);
                        const polygons = feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates;
                        polygons.forEach(polygon => {
                            const path = polygon[0];
                            const firstPoint = transformCoord(path[0]);
                            doc.moveTo(firstPoint[0], firstPoint[1]);
                            for (let i = 1; i < path.length; i++) doc.lineTo(...transformCoord(path[i]));
                            doc.fillAndStroke();
                        });
                    });

                    farmTraps.forEach(trap => {
                        if (trap.longitude && trap.latitude) {
                            const [trapX, trapY] = transformCoord([trap.longitude, trap.latitude]);
                            const isHighRisk = trap.contagemMariposas >= 6;
                            const fillColor = isHighRisk ? '#d9534f' : '#5cb85c';
                            doc.lineWidth(1).circle(trapX, trapY, 2.5).fillAndStroke(fillColor, '#000');
                        }
                    });
                    doc.restore();
                } else {
                     doc.fontSize(10).text('Geometria da fazenda não encontrada no shapefile.', mapX + 10, mapY + 10);
                }
            } else {
                 doc.fontSize(10).text('Shapefile não carregado. Mapa não pode ser gerado.', mapX + 10, mapY + 10);
            }

            const dataX = mapAreaWidth + 15;
            const dataWidth = doc.page.width - mapAreaWidth - (pageMargin * 2) - 15;
            let currentY = pageMargin;

            doc.fontSize(16).font('Helvetica-Bold').text(`PROJETO - ${farm.code} - FAZ.`, dataX, currentY, { width: dataWidth, continued: true });
            doc.fontSize(16).font('Helvetica-Bold').text(farm.name.toUpperCase(), { width: dataWidth });
            currentY = doc.y + 2;
            doc.fontSize(10).font('Helvetica').text('Relatório de Risco de Armadilhas', dataX, currentY, { width: dataWidth });
            currentY = doc.y + 25;

            const summaryX = dataX;
            const summaryLabelWidth = 100;
            const summaryValueWidth = 50;

            const drawSummaryRow = (label, value, isBold = false) => {
                const yPos = currentY;
                doc.fontSize(10).font(isBold ? 'Helvetica-Bold' : 'Helvetica').text(label, summaryX, yPos, { width: summaryLabelWidth, align: 'left' });
                doc.fontSize(10).font('Helvetica').text(value, summaryX + summaryLabelWidth, yPos, { width: summaryValueWidth, align: 'right' });
                currentY = doc.y + 6;
            };

            drawSummaryRow('Total de Armadilhas:', farm.totalTraps);
            drawSummaryRow('Armadilhas em Alerta\n(>=6):', farm.highCountTraps);
            doc.y += 8;
            currentY = doc.y;
            drawSummaryRow('Índice de Aplicação:', `${farm.riskPercentage.toFixed(2)}%`, true);

            currentY = doc.y + 25;

            doc.fontSize(12).font('Helvetica-Bold').text('Distribuição por Talhão', dataX, currentY, { width: dataWidth });
            currentY = doc.y + 8;

            const tableHeaderY = currentY;
            const tableCol1X = dataX;
            const tableCol2X = dataX + 80;
            const tableCol3X = dataX + 125;
            const tableCol4X = dataX + 165;
            const tableCol5X = dataX + 215;

            doc.fontSize(10).font('Helvetica-Bold');
            doc.text('Talhão', tableCol1X, tableHeaderY, { width: 80, align: 'left' });
            doc.text('Nº Arm.', tableCol2X, tableHeaderY, { width: 45, align: 'center' });
            doc.text('>= 6', tableCol3X, tableHeaderY, { width: 40, align: 'center' });
            doc.text('Mariposas', tableCol4X, tableHeaderY, { width: 50, align: 'center' });
            doc.text('%', tableCol5X, tableHeaderY, { width: 40, align: 'center' });
            currentY = doc.y + 4;
            doc.lineWidth(1).moveTo(dataX, currentY).lineTo(dataX + dataWidth, currentY).strokeColor('#000').stroke();
            currentY += 8;

            const sortedTalhoes = Object.keys(trapsByTalhao).sort((a, b) => a.localeCompare(b, undefined, {numeric: true}));
            doc.fontSize(10).font('Helvetica');
            for(const talhao of sortedTalhoes) {
                const info = trapsByTalhao[talhao];
                const perc = info.total > 0 ? ((info.high / info.total) * 100).toFixed(1) : '0.0';

                const yPos = currentY;
                doc.text(talhao, tableCol1X, yPos, { width: 80, align: 'left' });
                doc.text(info.total, tableCol2X, yPos, { width: 45, align: 'center' });
                doc.text(info.high, tableCol3X, yPos, { width: 40, align: 'center' });
                doc.text(info.mothSum, tableCol4X, yPos, { width: 50, align: 'center' });
                doc.text(perc, tableCol5X, yPos, { width: 40, align: 'center' });

                currentY = doc.y + 6;

                 if (currentY > doc.page.height - 80) {
                    doc.addPage({ layout: 'landscape', margin: 30 });
                    currentY = pageMargin;
                }
            }

            if (logoBase64) {
                const logoWidth = 70;
                const logoX = dataX + (dataWidth / 2) - (logoWidth / 2);
                const logoY = doc.page.height - pageMargin - 80;
                doc.image(logoBase64, logoX, logoY, { width: logoWidth });
            }
        }

        generatePdfFooter(doc, generatedBy);
        doc.end();

    } catch (error) {
        console.error("Erro ao gerar PDF de Visualização de Risco:", error);
        if (!res.headersSent) {
            res.status(500).send(`Erro ao gerar relatório: ${error.message}`);
        } else {
            doc.end();
        }
    }
};

module.exports = {
    getRiskViewData,
    generateRiskViewPdf
};
