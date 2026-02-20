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

        // --- HEADER ---
        const drawHeader = (doc) => {
             const startY = 28;
             const pageMargin = 28;
             const pageWidth = doc.page.width;
             const contentWidth = pageWidth - (pageMargin * 2);
             let y = startY;

             // Header Style: Clean Grid
             doc.lineWidth(0.5).strokeColor('#333333');
             doc.font('Helvetica-Bold').fontSize(8); // Smaller font for header too
             const padding = 4;
             const rowH = 14;

             // Helper to draw cell
             const drawCell = (x, y, w, h, text, align='left', font='Helvetica-Bold') => {
                 doc.rect(x, y, w, h).stroke();
                 if (text) {
                     doc.font(font).text(text, x + padding, y + padding - 1, { width: w - (padding*2), align: align, ellipsis: true });
                 }
             };

             // Row 1
             drawCell(pageMargin, y, contentWidth * 0.5, rowH, companyName);

             let dateStr = '';
             if (osData.data) {
                 const parts = osData.data.split('-');
                 if(parts.length === 3) dateStr = `${parts[2]}/${parts[1]}/${parts[0]}`;
                 else dateStr = osData.data;
             } else if (osData.createdAt) {
                 dateStr = new Date(osData.createdAt.toDate ? osData.createdAt.toDate() : osData.createdAt).toLocaleDateString('pt-BR');
             }
             drawCell(pageMargin + contentWidth * 0.5, y, contentWidth * 0.25, rowH, `Data: ${dateStr}`);
             drawCell(pageMargin + contentWidth * 0.75, y, contentWidth * 0.25, rowH, `OS: ${osData.os_numero || osData.sequentialId || osId}`);
             y += rowH;

             // Row 2
             doc.font('Helvetica-Bold').fontSize(11).text('OS - Ordem de Serviço', pageMargin + padding, y + 2);
             doc.rect(pageMargin, y, contentWidth * 0.5, rowH * 2).stroke(); // Title Box (2 rows height)
             doc.fontSize(8).text('AGRICOLA', pageMargin + padding, y + 14);

             drawCell(pageMargin + contentWidth * 0.5, y, contentWidth * 0.5, rowH, `Etapa: ${osData.tipo_servico_desc || osData.serviceType || ''}`);
             y += rowH;

             // Row 3
             const safra = osData.safra || '';
             const ciclo = osData.ciclo || '';
             const safraCiclo = (safra || ciclo) ? `${safra}/${ciclo}` : (osData.safraCiclo || '');

             // Title continued (left side handled by rect above)
             drawCell(pageMargin + contentWidth * 0.5, y, contentWidth * 0.35, rowH, `Safra/Ciclo: ${safraCiclo}`);
             drawCell(pageMargin + contentWidth * 0.85, y, contentWidth * 0.15, rowH, `Pág:`); // Footer handles number
             y += rowH;

             // Row 4
             drawCell(pageMargin, y, contentWidth * 0.30, rowH, `Matrícula: ${osData.responsavel_matricula || ''}`);
             drawCell(pageMargin + contentWidth * 0.30, y, contentWidth * 0.70, rowH, `Nome: ${osData.responsavel_nome || ''}`);
             y += rowH;

             // Row 5
             drawCell(pageMargin, y, contentWidth, rowH, `Usuário Abertura: ${osData.usuario_abertura_nome || osData.generatedBy || generatedBy || 'Sistema'}`);
             y += rowH;

             // Row 6
             drawCell(pageMargin, y, contentWidth, rowH, `Produtor: ${farmCode} - ${farmName}`);
             y += rowH;

             return y;
        };

        let currentY = drawHeader(doc);
        doc.moveDown(0.5);
        currentY += 8;

        // --- MAIN TABLE (Talhões) ---
        const pageMargin = 28;
        const pageWidth = doc.page.width;
        const contentWidth = pageWidth - (pageMargin * 2);

        const rowHeight = 14;
        const padding = 3;
        const mainBlockRows = 10;

        const blockX = pageMargin;
        const blockY = currentY;
        const blockW = contentWidth;
        const blockH = rowHeight * (mainBlockRows + 1);

        const wLeft = blockW * 0.65;
        const wRight = blockW - wLeft;
        const wOpQtd = wRight * 0.40;
        const wObs = wRight - wOpQtd;

        const xLeft = blockX;
        const xOpQtd = blockX + wLeft;
        const xObs = xOpQtd + wOpQtd;
        const yHeaderBottom = blockY + rowHeight;
        const rowsEndY = blockY + blockH;

        const leftHeaders = [
            { text: 'Propriedade', width: wLeft * 0.15, align: 'left' },
            { text: 'Fundo Agr.', width: wLeft * 0.30, align: 'left' },
            { text: 'Talhão', width: wLeft * 0.12, align: 'center' },
            { text: 'Variedade', width: wLeft * 0.16, align: 'left' },
            { text: 'Area', width: wLeft * 0.12, align: 'right' },
            { text: 'Area Rateio', width: wLeft * 0.15, align: 'right' }
        ];

        const opQtdHeaders = [
            { text: 'Operação', width: wOpQtd * 0.65, align: 'left' },
            { text: 'Quantidade', width: wOpQtd * 0.35, align: 'right' }
        ];

        let items = osData.itens || osData.items || [];
        if (items.length === 0 && osData.selectedPlots && farmData && farmData.talhoes) {
             osData.selectedPlots.forEach(plotName => {
                 const t = farmData.talhoes.find(pt => String(pt.name) === String(plotName));
                 if (t) {
                     items.push({ talhao_nome: t.name, variedade: t.variedade || '', area_ha: t.area });
                 }
             });
        }

        let totalArea = 0;
        let totalRateio = 0;

        const drawMainBlock = (startIndex) => {
            doc.lineWidth(0.3).strokeColor('#555555');

            // Bloco externo e 2 divisões verticais
            doc.rect(blockX, blockY, blockW, blockH).stroke();
            doc.moveTo(xOpQtd, blockY).lineTo(xOpQtd, rowsEndY).stroke();
            doc.moveTo(xObs, blockY).lineTo(xObs, rowsEndY).stroke();

            // Cabeçalhos A e B
            doc.fillColor('#f0f0f0').rect(xLeft, blockY, wLeft, rowHeight).fill();
            doc.fillColor('#f0f0f0').rect(xOpQtd, blockY, wOpQtd, rowHeight).fill();
            doc.fillColor('black');

            let x = xLeft;
            leftHeaders.forEach((col, i) => {
                if (i > 0) doc.moveTo(x, blockY).lineTo(x, rowsEndY).stroke();
                doc.font('Helvetica-Bold').fontSize(7).text(col.text, x + padding, blockY + padding + 1, {
                    width: col.width - (padding * 2),
                    align: col.align,
                    ellipsis: true
                });
                x += col.width;
            });

            x = xOpQtd;
            opQtdHeaders.forEach((col, i) => {
                if (i > 0) doc.moveTo(x, blockY).lineTo(x, rowsEndY).stroke();
                doc.font('Helvetica-Bold').fontSize(7).text(col.text, x + padding, blockY + padding + 1, {
                    width: col.width - (padding * 2),
                    align: col.align,
                    ellipsis: true
                });
                x += col.width;
            });

            // Área C (Obs) limpa
            doc.font('Helvetica-Bold').fontSize(7).text('Obs.:', xObs + padding, blockY + padding + 1, {
                width: wObs - (padding * 2),
                align: 'left'
            });

            // Linhas horizontais apenas em A + B (nunca em C)
            for (let row = 1; row <= mainBlockRows; row += 1) {
                const y = blockY + (row * rowHeight);
                doc.moveTo(blockX, y).lineTo(xObs, y).stroke();
            }

            const pageItems = items.slice(startIndex, startIndex + mainBlockRows);
            let totalAreaPage = 0;
            let totalRateioPage = 0;

            pageItems.forEach((item, itemIndex) => {
                const rowY = yHeaderBottom + (itemIndex * rowHeight);
                const area = parseFloat(item.area_ha || 0);
                totalArea += area;
                totalRateio += area;
                totalAreaPage += area;
                totalRateioPage += area;

                const leftData = [
                    { text: farmCode },
                    { text: farmName },
                    { text: item.talhao_nome || item.talhao || '' },
                    { text: item.variedade || '' },
                    { text: formatNumber(area) },
                    { text: formatNumber(area) }
                ];

                const opQtdData = [
                    { text: osData.operacao_nome || osData.tipo_servico_desc || '' },
                    { text: formatNumber(item.quantidade || 0) }
                ];

                let dataX = xLeft;
                leftData.forEach((col, i) => {
                    doc.font('Helvetica').fontSize(7).text(col.text, dataX + padding, rowY + padding + 1, {
                        width: leftHeaders[i].width - (padding * 2),
                        align: leftHeaders[i].align,
                        ellipsis: true
                    });
                    dataX += leftHeaders[i].width;
                });

                dataX = xOpQtd;
                opQtdData.forEach((col, i) => {
                    doc.font('Helvetica').fontSize(7).text(col.text, dataX + padding, rowY + padding + 1, {
                        width: opQtdHeaders[i].width - (padding * 2),
                        align: opQtdHeaders[i].align,
                        ellipsis: true
                    });
                    dataX += opQtdHeaders[i].width;
                });
            });

            // Texto de observação permanece dentro do quadro limpo
            if (startIndex === 0 && (osData.observacoes || osData.observations)) {
                doc.font('Helvetica').fontSize(7).text(osData.observacoes || osData.observations, xObs + padding, yHeaderBottom + padding, {
                    width: wObs - (padding * 2),
                    align: 'left',
                    height: blockH - rowHeight - (padding * 2),
                    ellipsis: true
                });
            }

            return {
                consumed: pageItems.length,
                pageTotalArea: totalAreaPage,
                pageTotalRateio: totalRateioPage
            };
        };

        let currentIndex = 0;
        let blockTotals = { pageTotalArea: 0, pageTotalRateio: 0 };
        while (currentIndex < items.length || currentIndex === 0) {
            blockTotals = drawMainBlock(currentIndex);
            currentIndex += blockTotals.consumed;
            if (currentIndex < items.length) {
                doc.addPage();
                currentY = drawHeader(doc);
                doc.moveDown(0.5);
                currentY += 8;
            } else {
                break;
            }
        }

        currentY = blockY + blockH;
        doc.font('Helvetica').fontSize(7); // Content font size 7
        // Linha de totais abaixo do bloco principal
        const totalLineY = currentY + 6;
        doc.font('Helvetica-Bold').fontSize(8);
        doc.text('Total Área:', blockX, totalLineY, { width: 80, align: 'left' });
        doc.text(formatNumber(totalArea), blockX + 80, totalLineY, { width: 55, align: 'right' });
        doc.text('Total Rateio:', blockX + 145, totalLineY, { width: 90, align: 'left' });
        doc.text(formatNumber(totalRateio), blockX + 235, totalLineY, { width: 55, align: 'right' });

        currentY = totalLineY + rowHeight + 4;

        // --- REQUISITION OF PRODUCTS ---
        if (currentY + 80 > doc.page.height) {
            doc.addPage();
            currentY = drawHeader(doc) + 20;
        }

        // Title
        doc.fillColor('#e0e0e0').rect(pageMargin, currentY, contentWidth, rowHeight).fill();
        doc.fillColor('black');
        doc.lineWidth(0.3).strokeColor('#555555').rect(pageMargin, currentY, contentWidth, rowHeight).stroke();
        doc.font('Helvetica-Bold').fontSize(9).text('REQUISIÇÃO DE PRODUTOS', pageMargin, currentY + padding, { width: contentWidth, align: 'center' });
        currentY += rowHeight;

        const prodHeaders = [
            { text: 'Oper.', width: contentWidth * 0.15, align: 'left' },
            { text: 'Produto', width: contentWidth * 0.10, align: 'left' },
            { text: 'Descrição', width: contentWidth * 0.35, align: 'left' },
            { text: 'Und.', width: contentWidth * 0.10, align: 'center' },
            { text: 'Qtde HA', width: contentWidth * 0.15, align: 'right' },
            { text: 'Qtde Total', width: contentWidth * 0.15, align: 'right' }
        ];

        const drawProdRow = (y, cols, isHeader=false) => {
             let x = pageMargin;
             if (isHeader) {
                 doc.fillColor('#f0f0f0').rect(x, y, contentWidth, rowHeight).fill();
                 doc.fillColor('black');
             }
             doc.rect(x, y, contentWidth, rowHeight).stroke();

             x = pageMargin;
             cols.forEach((col, i) => {
                 if (i > 0) doc.moveTo(x, y).lineTo(x, y + rowHeight).stroke();

                 const colWidth = prodHeaders[i].width;
                 const align = prodHeaders[i].align;

                 if (col.text) {
                     doc.text(col.text, x + padding, y + padding + 1, { width: colWidth - (padding*2), align: align, ellipsis: true });
                 }
                 x += colWidth;
             });
        };

        doc.font('Helvetica-Bold').fontSize(7);
        drawProdRow(currentY, prodHeaders, true);
        currentY += rowHeight;
        doc.font('Helvetica').fontSize(7);

        const products = osData.produtos || osData.products || [];
        let totalProdQty = 0;

        products.forEach(prod => {
             if (currentY > doc.page.height - 50) {
                 doc.addPage();
                 currentY = drawHeader(doc) + 20;
                 doc.font('Helvetica-Bold');
                 drawProdRow(currentY, prodHeaders, true);
                 currentY += rowHeight;
                 doc.font('Helvetica');
             }

             const dosage = prod.dosagem_por_ha || prod.dosage || 0;
             const qtyTotal = prod.qtde_total || prod.quantity || (dosage * (totalArea || 0));
             totalProdQty += qtyTotal;

             const row = [
                 { text: osData.operacao_nome || osData.operationId || '' },
                 { text: prod.codigo_externo || prod.produto_id || '' },
                 { text: prod.produto_nome || prod.name || '' },
                 { text: prod.unidade || prod.unit || '' },
                 { text: formatNumber(dosage) },
                 { text: formatNumber(qtyTotal) }
             ];
             drawProdRow(currentY, row);
             currentY += rowHeight;
        });

        doc.font('Helvetica-Bold');
        const prodTotalRow = [
            { text: '' }, { text: '' }, { text: '' }, { text: '' }, { text: 'Total .:', align: 'right' },
            { text: formatNumber(totalProdQty) }
        ];
        drawProdRow(currentY, prodTotalRow);
        currentY += 40;

        // --- SIGNATURES ---
        if (currentY + 60 > doc.page.height) {
            doc.addPage();
            currentY = doc.page.height - 100;
        }

        const signY = currentY;
        doc.lineWidth(0.5).strokeColor('black'); // Reset line width
        doc.moveTo(pageMargin, signY).lineTo(pageMargin + 200, signY).stroke();
        doc.text('TÉCNICO RESPONSÁVEL', pageMargin, signY + 5, { width: 200, align: 'center' });

        doc.moveTo(pageWidth - pageMargin - 200, signY).lineTo(pageWidth - pageMargin, signY).stroke();
        doc.text('PRODUTOR', pageWidth - pageMargin - 200, signY + 5, { width: 200, align: 'center' });


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
