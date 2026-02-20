const { setupDoc, getLogoBase64, generatePdfHeader, generatePdfFooter, formatNumber } = require('../utils/pdfGenerator');
const { getShapefileData, findShapefileProp } = require('../utils/geoUtils');

const findOsDocument = async (db, osId) => {
    const collections = ['serviceOrders', 'ordens_servico'];
    for (const collectionName of collections) {
        const osDoc = await db.collection(collectionName).doc(osId).get();
        if (osDoc.exists) return osDoc;
    }
    return null;
};

const generateOsPdf = async (req, res, db) => {
    try {
        const osId = req.query.osId || req.params.osId;
        const { companyId, generatedBy } = req.query;

        if (!osId || !companyId) {
            return res.status(400).json({ message: 'osId e companyId são obrigatórios' });
        }

        const osDoc = await findOsDocument(db, osId);
        if (!osDoc) {
            return res.status(404).json({ message: 'OS não encontrada' });
        }

        const osData = osDoc.data();
        if (osData.companyId !== companyId) {
             return res.status(404).json({ message: 'OS não encontrada' });
        }

        let companyName = 'AGROVETOR';
        try {
            const companyDoc = await db.collection('companies').doc(companyId).get();
            if (companyDoc.exists && companyDoc.data().name) {
                companyName = companyDoc.data().name.toUpperCase();
            }
        } catch (e) { console.warn("Error fetching company name:", e); }

        const doc = setupDoc({ margin: 28, size: 'A4', bufferPages: true });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="OS_${osId}.pdf"`);
        doc.pipe(res);

        const farmDocument = await db.collection('fazendas').doc(osData.fazenda_id || osData.farmId).get();
        const farmData = farmDocument.exists ? farmDocument.data() : null;
        const farmCode = farmData ? farmData.code : 'N/A';
        const farmName = osData.fazenda_nome || osData.farmName || (farmData ? farmData.name : 'N/A');

        const geojsonData = await getShapefileData(db, companyId);

        const pageMargin = 28;
        const pageWidth = doc.page.width;
        const contentWidth = pageWidth - (pageMargin * 2);
        const baseLineWidth = 0.7;
        const headerRowH = 18;
        const cellPadding = 3;

        const drawCell = (x, y, w, h, text, options = {}) => {
            const align = options.align || 'left';
            const font = options.font || 'Helvetica';
            const fontSize = options.fontSize || 8;
            doc.lineWidth(baseLineWidth).rect(x, y, w, h).stroke();
            if (text !== undefined && text !== null && text !== '') {
                doc.font(font).fontSize(fontSize).text(String(text), x + cellPadding, y + 4, {
                    width: w - (cellPadding * 2),
                    align,
                    ellipsis: true,
                    lineBreak: false
                });
            }
        };

        const getDateLabel = () => {
            if (osData.data) {
                const parts = osData.data.split('-');
                if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
                return osData.data;
            }
            if (osData.createdAt) {
                return new Date(osData.createdAt.toDate ? osData.createdAt.toDate() : osData.createdAt).toLocaleDateString('pt-BR');
            }
            return '';
        };

        const drawHeader = (pageNumber = 1) => {
            let y = pageMargin;
            const c1 = contentWidth * 0.50;
            const c2 = contentWidth * 0.25;
            const c3 = contentWidth * 0.25;

            doc.strokeColor('#000000').fillColor('#000000');

            drawCell(pageMargin, y, c1, headerRowH, companyName, { font: 'Helvetica-Bold', fontSize: 9 });
            drawCell(pageMargin + c1, y, c2, headerRowH, `Data: ${getDateLabel()}`, { font: 'Helvetica-Bold', fontSize: 8 });
            drawCell(pageMargin + c1 + c2, y, c3, headerRowH, `OS: ${osData.os_numero || osData.sequentialId || osId}`, { font: 'Helvetica-Bold', fontSize: 8 });
            y += headerRowH;

            drawCell(pageMargin, y, c1, headerRowH * 2, '');
            doc.font('Helvetica-Bold').fontSize(11).text('OS - Ordem de Serviço', pageMargin + cellPadding, y + 2, { width: c1 - (cellPadding * 2) });
            doc.font('Helvetica-Bold').fontSize(10).text('AGRICOLA', pageMargin + cellPadding, y + 14, { width: c1 - (cellPadding * 2) });

            drawCell(pageMargin + c1, y, c2 + c3, headerRowH, `Etapa: ${osData.tipo_servico_desc || osData.serviceType || ''}`, { font: 'Helvetica-Bold', fontSize: 8 });
            y += headerRowH;

            const safraCiclo = (osData.safra || osData.ciclo) ? `${osData.safra || ''} / ${osData.ciclo || ''}` : (osData.safraCiclo || '');
            drawCell(pageMargin + c1, y, (c2 + c3) * 0.68, headerRowH, `Safra/Ciclo: ${safraCiclo}`, { font: 'Helvetica-Bold', fontSize: 8 });
            drawCell(pageMargin + c1 + ((c2 + c3) * 0.68), y, (c2 + c3) * 0.32, headerRowH, `Página: ${pageNumber}`, { font: 'Helvetica-Bold', fontSize: 8, align: 'right' });
            y += headerRowH;

            drawCell(pageMargin, y, contentWidth * 0.30, headerRowH, `Matrícula: ${osData.responsavel_matricula || ''}`, { font: 'Helvetica-Bold', fontSize: 8 });
            drawCell(pageMargin + (contentWidth * 0.30), y, contentWidth * 0.70, headerRowH, `Nome: ${osData.responsavel_nome || ''}`, { font: 'Helvetica-Bold', fontSize: 8 });
            y += headerRowH;

            drawCell(pageMargin, y, contentWidth, headerRowH, `Usuário Abertura: ${osData.usuario_abertura_nome || osData.generatedBy || generatedBy || 'Sistema'}`, { font: 'Helvetica-Bold', fontSize: 8 });
            y += headerRowH;

            drawCell(pageMargin, y, contentWidth, headerRowH, `Produtor: ${farmCode} - ${farmName}`, { font: 'Helvetica-Bold', fontSize: 8 });
            y += headerRowH;

            return y + 8;
        };

        const addOsPage = (state) => {
            doc.addPage({ size: 'A4', margin: pageMargin });
            state.page += 1;
            return drawHeader(state.page);
        };

        let items = osData.itens || osData.items || [];
        if (items.length === 0 && osData.selectedPlots && farmData && farmData.talhoes) {
            osData.selectedPlots.forEach(plotName => {
                const t = farmData.talhoes.find(pt => String(pt.name) === String(plotName));
                if (t) {
                    items.push({ talhao_nome: t.name, variedade: t.variedade || '', area_ha: t.area });
                }
            });
        }

        const drawPlotsBlock = (startY, state) => {
            const blockHeight = 380;
            const titleH = 16;
            const dataRowH = 16;
            const totalRowH = 16;
            const totalW = contentWidth;
            const wLeft = totalW * 0.65;
            const wRight = totalW - wLeft;
            const wOpQtd = wRight * 0.40;
            const wObs = wRight - wOpQtd;

            const leftHeaders = [
                { text: 'Propriedade', width: wLeft * 0.14, align: 'left' },
                { text: 'Fundo Agr.', width: wLeft * 0.30, align: 'left' },
                { text: 'Talhão', width: wLeft * 0.10, align: 'center' },
                { text: 'Variedade', width: wLeft * 0.18, align: 'left' },
                { text: 'Área', width: wLeft * 0.14, align: 'right' },
                { text: 'Área Rateio', width: wLeft * 0.14, align: 'right' }
            ];
            const opHeaders = [
                { text: 'Operação', width: wOpQtd * 0.66, align: 'left' },
                { text: 'Quantidade', width: wOpQtd * 0.34, align: 'right' }
            ];

            const rowsPerPage = Math.floor((blockHeight - titleH - totalRowH) / dataRowH);
            const totalArea = items.reduce((acc, item) => acc + (parseFloat(item.area_ha || 0) || 0), 0);
            const totalRateio = items.reduce((acc, item) => acc + (parseFloat(item.area_rateio || item.area_ha || 0) || 0), 0);
            const totalPagesForPlots = Math.max(1, Math.ceil(items.length / rowsPerPage));

            const obsText = osData.observacoes || osData.observations || '';

            for (let pageIdx = 0; pageIdx < totalPagesForPlots; pageIdx += 1) {
                const y = pageIdx === 0 ? startY : addOsPage(state);
                const x = pageMargin;
                const leftX = x;
                const rightX = x + wLeft;
                const opX = rightX;
                const obsX = rightX + wOpQtd;
                const tableTop = y;
                const dataStartY = tableTop + titleH;
                const totalY = dataStartY + (rowsPerPage * dataRowH);
                const blockBottom = totalY + totalRowH;

                doc.lineWidth(baseLineWidth).strokeColor('#000000');
                doc.rect(x, tableTop, totalW, blockHeight).stroke();
                doc.moveTo(rightX, tableTop).lineTo(rightX, tableTop + blockHeight).stroke();
                doc.moveTo(obsX, tableTop).lineTo(obsX, tableTop + blockHeight).stroke();
                doc.moveTo(opX + opHeaders[0].width, tableTop).lineTo(opX + opHeaders[0].width, blockBottom).stroke();

                doc.moveTo(leftX, dataStartY).lineTo(rightX + wOpQtd, dataStartY).stroke();
                doc.moveTo(obsX, dataStartY).lineTo(x + totalW, dataStartY).stroke();

                let cursorX = leftX;
                leftHeaders.forEach((col, i) => {
                    if (i > 0) doc.moveTo(cursorX, tableTop).lineTo(cursorX, blockBottom).stroke();
                    doc.font('Helvetica-Bold').fontSize(7).text(col.text, cursorX + cellPadding, tableTop + 4, {
                        width: col.width - (cellPadding * 2),
                        align: col.align,
                        lineBreak: false,
                        ellipsis: true
                    });
                    cursorX += col.width;
                });

                let opCursorX = opX;
                opHeaders.forEach((col, i) => {
                    if (i > 0) doc.moveTo(opCursorX, tableTop).lineTo(opCursorX, dataStartY).stroke();
                    doc.font('Helvetica-Bold').fontSize(7).text(col.text, opCursorX + cellPadding, tableTop + 4, {
                        width: col.width - (cellPadding * 2),
                        align: col.align,
                        lineBreak: false,
                        ellipsis: true
                    });
                    opCursorX += col.width;
                });

                doc.font('Helvetica-Bold').fontSize(8).text('Obs.:', obsX + cellPadding, tableTop + 4, {
                    width: wObs - (cellPadding * 2),
                    align: 'left',
                    lineBreak: false
                });

                if (pageIdx === 0 && obsText) {
                    doc.font('Helvetica').fontSize(7).text(obsText, obsX + cellPadding, dataStartY + cellPadding, {
                        width: wObs - (cellPadding * 2),
                        height: blockHeight - titleH - cellPadding,
                        align: 'left'
                    });
                }

                for (let row = 0; row < rowsPerPage; row += 1) {
                    const rowTop = dataStartY + (row * dataRowH);
                    const rowBottom = rowTop + dataRowH;
                    doc.moveTo(leftX, rowBottom).lineTo(rightX + wOpQtd, rowBottom).stroke();

                    const item = items[(pageIdx * rowsPerPage) + row];
                    if (!item) continue;

                    const area = parseFloat(item.area_ha || 0) || 0;
                    const areaRateio = parseFloat(item.area_rateio || item.area_ha || 0) || 0;
                    const rowValues = [
                        farmCode,
                        farmName,
                        item.talhao_nome || item.talhao || '',
                        item.variedade || '',
                        formatNumber(area),
                        formatNumber(areaRateio)
                    ];

                    cursorX = leftX;
                    rowValues.forEach((value, i) => {
                        doc.font('Helvetica').fontSize(7).text(String(value), cursorX + cellPadding, rowTop + 4, {
                            width: leftHeaders[i].width - (cellPadding * 2),
                            align: leftHeaders[i].align,
                            lineBreak: false,
                            ellipsis: true
                        });
                        cursorX += leftHeaders[i].width;
                    });

                    const opText = item.operacao_nome || osData.operacao_nome || osData.tipo_servico_desc || '';
                    const qtyText = formatNumber(item.quantidade || 0);
                    doc.font('Helvetica').fontSize(7).text(opText, opX + cellPadding, rowTop + 4, {
                        width: opHeaders[0].width - (cellPadding * 2),
                        align: 'left',
                        lineBreak: false,
                        ellipsis: true
                    });
                    doc.font('Helvetica').fontSize(7).text(qtyText, opX + opHeaders[0].width + cellPadding, rowTop + 4, {
                        width: opHeaders[1].width - (cellPadding * 2),
                        align: 'right',
                        lineBreak: false,
                        ellipsis: true
                    });
                }

                doc.moveTo(leftX, totalY + totalRowH).lineTo(rightX + wOpQtd, totalY + totalRowH).stroke();
                if (pageIdx === totalPagesForPlots - 1) {
                    const totalLabelX = leftX + leftHeaders[0].width + leftHeaders[1].width + leftHeaders[2].width;
                    const totalLabelW = leftHeaders[3].width;
                    doc.font('Helvetica-Bold').fontSize(8).text('Total', totalLabelX + cellPadding, totalY + 4, {
                        width: totalLabelW - (cellPadding * 2),
                        align: 'right',
                        lineBreak: false
                    });
                    const areaX = totalLabelX + totalLabelW;
                    doc.font('Helvetica-Bold').fontSize(8).text(formatNumber(totalArea), areaX + cellPadding, totalY + 4, {
                        width: leftHeaders[4].width - (cellPadding * 2),
                        align: 'right',
                        lineBreak: false
                    });
                    doc.font('Helvetica-Bold').fontSize(8).text(formatNumber(totalRateio), areaX + leftHeaders[4].width + cellPadding, totalY + 4, {
                        width: leftHeaders[5].width - (cellPadding * 2),
                        align: 'right',
                        lineBreak: false
                    });
                }

                if (pageIdx === totalPagesForPlots - 1) {
                    startY = blockBottom + 12;
                }
            }

            return {
                currentY: startY,
                totalArea,
                totalRateio
            };
        };

        const drawProductsTable = (startY, totalArea, state) => {
            const sectionTitleH = 16;
            const rowH = 16;
            const products = osData.produtos || osData.products || [];
            const headers = [
                { text: 'Oper.', width: contentWidth * 0.13, align: 'left' },
                { text: 'Produto', width: contentWidth * 0.11, align: 'left' },
                { text: 'Descrição', width: contentWidth * 0.38, align: 'left' },
                { text: 'Und.', width: contentWidth * 0.10, align: 'center' },
                { text: 'Qtde HA', width: contentWidth * 0.14, align: 'right' },
                { text: 'Qtde Total', width: contentWidth * 0.14, align: 'right' }
            ];

            const drawProductsHeader = (y) => {
                doc.lineWidth(baseLineWidth).rect(pageMargin, y, contentWidth, sectionTitleH).stroke();
                doc.font('Helvetica-Bold').fontSize(9).text('REQUISIÇÃO DE PRODUTOS', pageMargin, y + 4, {
                    width: contentWidth,
                    align: 'center',
                    lineBreak: false
                });

                const headerY = y + sectionTitleH;
                doc.rect(pageMargin, headerY, contentWidth, rowH).stroke();
                let x = pageMargin;
                headers.forEach((col, idx) => {
                    if (idx > 0) doc.moveTo(x, headerY).lineTo(x, headerY + rowH).stroke();
                    doc.font('Helvetica-Bold').fontSize(7).text(col.text, x + cellPadding, headerY + 4, {
                        width: col.width - (cellPadding * 2),
                        align: col.align,
                        lineBreak: false,
                        ellipsis: true
                    });
                    x += col.width;
                });
                return headerY + rowH;
            };

            const drawProductRow = (y, values, bold = false) => {
                doc.rect(pageMargin, y, contentWidth, rowH).stroke();
                let x = pageMargin;
                values.forEach((val, idx) => {
                    if (idx > 0) doc.moveTo(x, y).lineTo(x, y + rowH).stroke();
                    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(7).text(String(val || ''), x + cellPadding, y + 4, {
                        width: headers[idx].width - (cellPadding * 2),
                        align: headers[idx].align,
                        lineBreak: false,
                        ellipsis: true
                    });
                    x += headers[idx].width;
                });
            };

            let y = startY;
            if (y + sectionTitleH + (rowH * 3) > doc.page.height - 90) {
                y = addOsPage(state);
            }

            y = drawProductsHeader(y);
            let totalProdQty = 0;
            const maxBottom = doc.page.height - 90;

            products.forEach((prod) => {
                if (y + rowH > maxBottom) {
                    y = addOsPage(state);
                    y = drawProductsHeader(y);
                }
                const dosage = parseFloat(prod.dosagem_por_ha || prod.dosage || 0) || 0;
                const qtyTotal = parseFloat(prod.qtde_total || prod.quantity || (dosage * (totalArea || 0))) || 0;
                totalProdQty += qtyTotal;
                drawProductRow(y, [
                    osData.operacao_nome || osData.operationId || '',
                    prod.codigo_externo || prod.produto_id || '',
                    prod.produto_nome || prod.name || '',
                    prod.unidade || prod.unit || '',
                    formatNumber(dosage),
                    formatNumber(qtyTotal)
                ]);
                y += rowH;
            });

            if (y + rowH > maxBottom) {
                y = addOsPage(state);
                y = drawProductsHeader(y);
            }
            drawProductRow(y, ['', '', '', '', 'Total .:', formatNumber(totalProdQty)], true);
            return y + rowH + 30;
        };

        const drawSignatures = (startY, state) => {
            let y = startY;
            if (y + 50 > doc.page.height - 28) {
                y = addOsPage(state);
            }

            const lineY = Math.min(y + 24, doc.page.height - 40);
            const signWidth = 210;
            doc.lineWidth(baseLineWidth);
            doc.moveTo(pageMargin, lineY).lineTo(pageMargin + signWidth, lineY).stroke();
            doc.font('Helvetica-Bold').fontSize(9).text('TÉCNICO RESPONSÁVEL', pageMargin, lineY + 6, { width: signWidth, align: 'center' });

            doc.moveTo(pageWidth - pageMargin - signWidth, lineY).lineTo(pageWidth - pageMargin, lineY).stroke();
            doc.font('Helvetica-Bold').fontSize(9).text('PRODUTOR', pageWidth - pageMargin - signWidth, lineY + 6, { width: signWidth, align: 'center' });
        };

        const pageState = { page: 1 };
        let currentY = drawHeader(pageState.page);

        const plotsResult = drawPlotsBlock(currentY, pageState);
        currentY = drawProductsTable(plotsResult.currentY, plotsResult.totalArea, pageState);
        drawSignatures(currentY, pageState);

        // --- MAP PAGE (Landscape) ---
        if (geojsonData) {
            doc.addPage({ size: 'A4', layout: 'landscape', margin: 28 });
            const lsPageWidth = doc.page.width;
            const lsPageHeight = doc.page.height;
            const lsMargin = 28;

            doc.font('Helvetica-Bold').fontSize(14).text(`Mapa de Aplicação - O.S. ${osData.os_numero || osData.sequentialId || osId}`, lsMargin, lsMargin, { width: lsPageWidth - (lsMargin*2), align: 'center' });

            const mapAreaX = lsMargin;
            const mapAreaY = lsMargin + 30;
            const mapAreaW = lsPageWidth - (lsMargin * 2);
            const mapAreaH = lsPageHeight - (lsMargin * 2) - 50;

            const farmFeatures = geojsonData.features.filter(f => {
                if (!f.properties) return false;
                const propKeys = Object.keys(f.properties);
                const codeKey = propKeys.find(k => k.toLowerCase() === 'fundo_agr');
                const featureFarmCode = codeKey ? f.properties[codeKey] : null;
                return featureFarmCode && parseInt(featureFarmCode, 10) === parseInt(farmCode, 10);
            });

            if (farmFeatures.length > 0) {
                const allCoords = farmFeatures.flatMap(f => f.geometry.type === 'Polygon' ? f.geometry.coordinates[0] : f.geometry.coordinates.flatMap(p => p[0]));
                const bbox = {
                    minX: Math.min(...allCoords.map(c => c[0])), maxX: Math.max(...allCoords.map(c => c[0])),
                    minY: Math.min(...allCoords.map(c => c[1])), maxY: Math.max(...allCoords.map(c => c[1])),
                };

                const geoWidth = bbox.maxX - bbox.minX;
                const geoHeight = bbox.maxY - bbox.minY;
                const scaleX = mapAreaW / geoWidth;
                const scaleY = mapAreaH / geoHeight;
                const scale = Math.min(scaleX, scaleY) * 0.98;

                const offsetX = mapAreaX + (mapAreaW - (geoWidth * scale)) / 2;
                const offsetY = mapAreaY + (mapAreaH - (geoHeight * scale)) / 2;

                const transformCoord = (coord) => [
                    (coord[0] - bbox.minX) * scale + offsetX,
                    (bbox.maxY - coord[1]) * scale + offsetY
                ];

                doc.save();
                doc.lineWidth(0.5);

                const labelsToDraw = [];
                farmFeatures.forEach(feature => {
                    const talhaoNome = findShapefileProp(feature.properties, ['CD_TALHAO', 'COD_TALHAO', 'TALHAO']) || '';
                    let isSelected = false;
                    const items = osData.itens || osData.items;
                    if (Array.isArray(osData.selectedPlots)) {
                        isSelected = osData.selectedPlots.some(p => String(p).toUpperCase() === String(talhaoNome).toUpperCase());
                    } else if (items && Array.isArray(items)) {
                        isSelected = items.some(item => String(item.talhao_nome).toUpperCase() === String(talhaoNome).toUpperCase());
                    }

                    const fillColor = isSelected ? '#4caf50' : '#e0e0e0';
                    const strokeColor = isSelected ? '#2e7d32' : '#9e9e9e';

                    doc.fillColor(fillColor);
                    doc.strokeColor(strokeColor);
                    doc.fillOpacity(1);

                    const polygons = feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates;
                    polygons.forEach(polygon => {
                        const path = polygon[0];
                        if (!path || path.length === 0) return;
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
                 doc.text('Geometria da fazenda não encontrada no shapefile para gerar o mapa.', mapAreaX, mapAreaY);
            }
        }

        generatePdfFooter(doc, osData.usuario_abertura_nome || osData.generatedBy || generatedBy || 'Sistema');
        doc.end();

    } catch (error) {
        console.error("Erro ao gerar PDF da O.S.:", error);
        if (!res.headersSent) {
            res.status(500).json({ message: `Erro ao gerar relatório: ${error.message}` });
        }
    }
};

module.exports = {
    generateOsPdf
};
