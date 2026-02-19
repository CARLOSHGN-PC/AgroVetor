const { setupDoc, getLogoBase64, generatePdfHeader, generatePdfFooter, drawTable, formatNumber, calculateColumnWidths } = require('../utils/pdfGenerator');
const { getShapefileData, findTalhaoForTrap, findShapefileProp } = require('../utils/geoUtils');
const admin = require('firebase-admin');

const generateOsPdf = async (req, res, db) => {
    const doc = setupDoc();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=ordem_servico.pdf`);
    doc.pipe(res);

    try {
        const { osId, companyId, generatedBy } = req.query;

        if (!osId) throw new Error('ID da Ordem de Serviço não fornecido.');
        if (!companyId) throw new Error('ID da empresa não fornecido.');

        let osDoc = await db.collection('ordens_servico').doc(osId).get();
        if (!osDoc.exists) {
            osDoc = await db.collection('serviceOrders').doc(osId).get();
        }
        if (!osDoc.exists) throw new Error('Ordem de Serviço não encontrada.');
        const osData = osDoc.data();

        const geojsonData = await getShapefileData(db, companyId);
        const logoBase64 = await getLogoBase64(db, companyId);

        await generatePdfHeader(doc, 'Ordem de Serviço', logoBase64);

        // Header Info
        doc.fontSize(12).font('Helvetica-Bold').text(`O.S. Nº: ${osData.os_numero || osData.sequentialId || osId}`, { align: 'right' });

        const farmDocument = await db.collection('fazendas').doc(osData.fazenda_id || osData.farmId).get();
        const farmData = farmDocument.exists ? farmDocument.data() : null;
        const farmCode = farmData ? farmData.code : null;

        doc.fontSize(12).font('Helvetica-Bold').text(`Fazenda: ${farmCode || ''} - ${osData.fazenda_nome || osData.farmName || ''}`, { align: 'left' });
        doc.moveDown(0.5);

        const infoY = doc.y;
        doc.fontSize(10).font('Helvetica');
        doc.text(`Tipo de Serviço: ${osData.tipo_servico_desc || osData.serviceType || 'N/A'}`, 30, infoY);
        doc.text(`Operação: ${osData.operacao_nome || 'N/A'}`, 220, infoY);
        doc.text(`Matrícula: ${osData.responsavel_matricula || '-'}`, 380, infoY);
        doc.moveDown(0.8);
        doc.text(`Responsável: ${osData.responsavel_nome || osData.responsible || 'N/A'}`, 30, doc.y);
        doc.text(`Safra/Ciclo: ${osData.safra || '-'} / ${osData.ciclo || '-'}`, 300, doc.y);
        doc.moveDown(1.5);

        if (osData.observacoes || osData.observations) {
            doc.text(`Observações: ${osData.observacoes || osData.observations}`);
            doc.moveDown(1.5);
        }

        const pageMargin = 30;
        const contentStartY = doc.y;
        const availableHeight = doc.page.height - contentStartY - pageMargin;

        // Map (Left)
        const mapWidth = doc.page.width * 0.65;
        const mapHeight = availableHeight;
        const mapX = pageMargin;
        const mapY = contentStartY;

        // List (Right)
        const listX = mapX + mapWidth + 15;
        const listWidth = doc.page.width - listX - pageMargin;

        if (geojsonData) {
            const farmFeatures = geojsonData.features.filter(f => {
                if (!f.properties) return false;
                const propKeys = Object.keys(f.properties);
                const codeKey = propKeys.find(k => k.toLowerCase() === 'fundo_agr');
                if (!codeKey) return false;
                const featureFarmCode = f.properties[codeKey];
                return featureFarmCode && parseInt(featureFarmCode, 10) === parseInt(farmCode, 10);
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

                const labelsToDraw = [];

                farmFeatures.forEach(feature => {
                    const talhaoNome = findShapefileProp(feature.properties, ['CD_TALHAO', 'COD_TALHAO', 'TALHAO']) || 'N/A';
                    const selectedNames = (osData.os_itens || []).map(i => i.talhao_nome).concat(osData.selectedPlots || []);
                    const isSelected = selectedNames.some(p => String(p).toUpperCase() === String(talhaoNome).toUpperCase());
                    const fillColor = isSelected ? '#4caf50' : '#e0e0e0';
                    const strokeColor = isSelected ? '#2e7d32' : '#9e9e9e';

                    doc.fillColor(fillColor);
                    doc.strokeColor(strokeColor);
                    doc.fillOpacity(1);

                    const polygons = feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates;
                    polygons.forEach(polygon => {
                        const path = polygon[0];
                        const firstPoint = transformCoord(path[0]);
                        doc.moveTo(firstPoint[0], firstPoint[1]);
                        for (let i = 1; i < path.length; i++) doc.lineTo(...transformCoord(path[i]));
                        doc.fillAndStroke();
                    });

                    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
                    let hasPoints = false;

                    polygons.forEach(polygon => {
                        const outerRing = polygon[0];
                        if (outerRing) {
                            outerRing.forEach(coord => {
                                const transformed = transformCoord(coord);
                                if (transformed[0] < minX) minX = transformed[0];
                                if (transformed[0] > maxX) maxX = transformed[0];
                                if (transformed[1] < minY) minY = transformed[1];
                                if (transformed[1] > maxY) maxY = transformed[1];
                                hasPoints = true;
                            });
                        }
                    });

                    if (hasPoints) {
                        const centerX = (minX + maxX) / 2;
                        const centerY = (minY + maxY) / 2;
                        labelsToDraw.push({ text: String(talhaoNome), x: centerX, y: centerY });
                    }
                });

                labelsToDraw.forEach(label => {
                    doc.fontSize(8).font('Helvetica');
                    const textWidth = doc.widthOfString(label.text);
                    const textHeight = doc.currentLineHeight();
                    const padding = 2;
                    const rectWidth = textWidth + (padding * 2);
                    const rectHeight = textHeight + (padding * 2);

                    doc.fillOpacity(1);
                    doc.fillColor('white');
                    doc.rect(label.x - (rectWidth / 2), label.y - (rectHeight / 2), rectWidth, rectHeight).fill();

                    doc.fillColor('black');
                    doc.text(label.text, label.x - (rectWidth / 2), label.y - (textHeight / 2), {
                        width: rectWidth, align: 'center', lineBreak: false
                    });
                });
                doc.restore();
            } else {
                doc.text('Geometria da fazenda não encontrada no shapefile.', mapX, mapY);
            }
        } else {
            doc.text('Shapefile não disponível.', mapX, mapY);
        }

        // Draw List
        let currentListY = contentStartY;
        doc.fontSize(10).font('Helvetica-Bold').text('Talhões Selecionados', listX, currentListY);
        currentListY += 15;

        const headers = ['Talhão', 'Área (ha)'];
        const colWidths = [listWidth * 0.6, listWidth * 0.4];

        doc.fontSize(9);
        doc.rect(listX, currentListY, listWidth, 15).fillAndStroke('#eee', '#ccc');
        doc.fillColor('black');
        doc.text(headers[0], listX + 5, currentListY + 3);
        doc.text(headers[1], listX + colWidths[0], currentListY + 3, { align: 'right', width: colWidths[1] - 5 });
        currentListY += 15;

        let totalSelectedArea = 0;
        if (farmData && farmData.talhoes) {
            for (const plotName of ((osData.os_itens||[]).map(i=>i.talhao_nome).concat(osData.selectedPlots||[]))) {
                const talhao = farmData.talhoes.find(t => String(t.name).toUpperCase() === String(plotName).toUpperCase());
                const area = talhao ? talhao.area : 0;
                totalSelectedArea += area;

                if (currentListY > doc.page.height - 50) {
                     // In a real scenario we'd handle pagination, but here we just clip/stop as per original logic's constraint
                }

                doc.font('Helvetica').text(plotName, listX + 5, currentListY + 3);
                doc.text(formatNumber(area), listX + colWidths[0], currentListY + 3, { align: 'right', width: colWidths[1] - 5 });
                doc.moveTo(listX, currentListY + 15).lineTo(listX + listWidth, currentListY + 15).strokeColor('#eee').stroke();
                currentListY += 15;
            }
        }

        currentListY += 5;
        doc.font('Helvetica-Bold').text('TOTAL', listX + 5, currentListY + 3);
        doc.text(formatNumber(totalSelectedArea), listX + colWidths[0], currentListY + 3, { align: 'right', width: colWidths[1] - 5 });

        doc.addPage();
        doc.fontSize(12).font('Helvetica-Bold').text('REQUISIÇÃO DE PRODUTOS');
        doc.moveDown(0.5);
        const produtos = osData.os_produtos || [];
        if (!produtos.length) {
            doc.fontSize(10).font('Helvetica').text('Nenhum produto vinculado à O.S.');
        } else {
            doc.fontSize(10).font('Helvetica-Bold').text('Oper.   Produto   Und.   Qtde HA   Qtde Total');
            doc.moveDown(0.3);
            produtos.forEach((p) => {
                doc.font('Helvetica').text(`${osData.operacao_nome || '-'}   ${p.produto_nome || '-'}   ${p.unidade || '-'}   ${formatNumber(p.dosagem_por_ha || 0)}   ${formatNumber(p.qtde_total || 0)}`);
            });
        }

        generatePdfFooter(doc, generatedBy || osData.usuario_abertura_nome || osData.createdBy);
        doc.end();

    } catch (error) {
        console.error("Erro ao gerar PDF da O.S.:", error);
        if (!res.headersSent) {
            res.status(500).send(`Erro ao gerar relatório: ${error.message}`);
        } else {
            doc.end();
        }
    }
};

module.exports = {
    generateOsPdf
};
