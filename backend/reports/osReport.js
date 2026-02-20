const { setupDoc, formatNumber } = require('../utils/pdfGenerator');
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

        const drawFooter = (pdfDoc, userName) => {
            const pageCount = pdfDoc.bufferedPageRange().count;
            for (let i = 0; i < pageCount; i += 1) {
                pdfDoc.switchToPage(i);
                const footerY = pdfDoc.page.height - pdfDoc.page.margins.bottom + 10;
                const baseText = `Gerado por: ${userName} em: ${new Date().toLocaleString('pt-BR')}`;
                const footerText = pageCount > 1 ? `${baseText} - Página ${i + 1} de ${pageCount}` : baseText;
                pdfDoc.fontSize(8).font('Helvetica').text(footerText, pdfDoc.page.margins.left, footerY, {
                    align: 'left',
                    lineBreak: false
                });
            }
        };

        // --- MAIN TABLE (Talhões) ---
        const pageMargin = 28;
        const pageWidth = doc.page.width;
        const contentWidth = pageWidth - (pageMargin * 2);

        const rowHeight = 14;
        const padding = 3;

        const blockX = pageMargin;
        const blockW = contentWidth;
        const maxMainRowsPerPage = 18;

        const wLeft = blockW * 0.7;
        const wRight = blockW - wLeft;

        const leftHeaders = [
            { text: 'Propriedade', width: wLeft * 0.15, align: 'left' },
            { text: 'Fundo Agr.', width: wLeft * 0.30, align: 'left' },
            { text: 'Talhão', width: wLeft * 0.12, align: 'center' },
            { text: 'Variedade', width: wLeft * 0.16, align: 'left' },
            { text: 'Area', width: wLeft * 0.12, align: 'right' },
            { text: 'Area Rateio', width: wLeft * 0.15, align: 'right' }
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

        const collectOperationSummary = () => {
            const opSet = new Set();
            const addOp = (value) => {
                if (!value) return;
                const normalized = String(value).trim();
                if (normalized) opSet.add(normalized);
            };

            addOp(osData.operacao_nome || osData.operationName || osData.tipo_servico_desc || osData.serviceType);
            items.forEach((item) => addOp(item.operacao_nome || item.operationName || item.operacao));
            (osData.operacoes || osData.operations || []).forEach((op) => addOp(op.nome || op.name || op.descricao || op));
            (osData.produtos || osData.products || []).forEach((prod) => addOp(prod.operacao_nome || prod.operationName || prod.operacao));
            return Array.from(opSet);
        };

        const fitSingleLine = (value, width, preferredFontSize = 7, minFontSize = 7) => {
            const text = String(value || '');
            let fontSize = preferredFontSize;
            doc.fontSize(fontSize);
            while (fontSize > minFontSize && doc.widthOfString(text) > width) {
                fontSize -= 0.5;
                doc.fontSize(fontSize);
            }
            if (doc.widthOfString(text) <= width) return { text, fontSize };

            const ellipsis = '...';
            let truncated = text;
            while (truncated.length > 0 && doc.widthOfString(`${truncated}${ellipsis}`) > width) {
                truncated = truncated.slice(0, -1);
            }
            return { text: `${truncated}${ellipsis}`, fontSize };
        };

        const drawOpSummaryBox = (x, y, width, height, operations) => {
            doc.rect(x, y, width, height).stroke();
            doc.font('Helvetica-Bold').fontSize(7).text('OP.:', x + padding, y + padding, { width: width - (padding * 2) });

            const maxLines = 6;
            const lines = operations.slice(0, maxLines);
            const baseY = y + rowHeight;
            const lineHeight = 10;
            lines.forEach((line, index) => {
                const content = fitSingleLine(line, width - (padding * 2), 7, 6.5);
                doc.font('Helvetica').fontSize(content.fontSize).text(content.text, x + padding, baseY + (index * lineHeight), {
                    width: width - (padding * 2),
                    lineBreak: false
                });
            });
            if (operations.length > maxLines) {
                doc.font('Helvetica').fontSize(6.5).text('...', x + padding, baseY + (maxLines * lineHeight), { width: width - (padding * 2) });
            }
        };

        const drawObsBox = (x, y, width, height, obsText) => {
            doc.rect(x, y, width, height).stroke();
            doc.font('Helvetica-Bold').fontSize(7).text('Obs.:', x + padding, y + padding, { width: width - (padding * 2) });
            if (obsText) {
                doc.font('Helvetica').fontSize(7).text(String(obsText), x + padding, y + rowHeight, {
                    width: width - (padding * 2),
                    height: height - rowHeight - padding,
                    align: 'left',
                    ellipsis: true
                });
            }
        };

        const drawMainBlockPlots = (startY, pageItems, operations) => {
            const blockY = startY;
            const xLeft = blockX;
            const xRight = blockX + wLeft;
            const itemRowCount = Math.max(pageItems.length, 1);
            const blockH = rowHeight + (itemRowCount * rowHeight);
            const blockBottom = blockY + blockH;

            doc.lineWidth(0.3).strokeColor('#555555');
            doc.rect(blockX, blockY, blockW, blockH).stroke();
            doc.moveTo(xRight, blockY).lineTo(xRight, blockBottom).stroke();

            doc.fillColor('#f0f0f0').rect(xLeft, blockY, wLeft, rowHeight).fill();
            doc.fillColor('black');

            let x = xLeft;
            leftHeaders.forEach((col, i) => {
                if (i > 0) doc.moveTo(x, blockY).lineTo(x, blockBottom).stroke();
                doc.font('Helvetica-Bold').fontSize(7).text(col.text, x + padding, blockY + padding + 1, {
                    width: col.width - (padding * 2),
                    align: col.align,
                    ellipsis: true
                });
                x += col.width;
            });

            doc.moveTo(xLeft, blockY + rowHeight).lineTo(xRight, blockY + rowHeight).stroke();

            pageItems.forEach((item, itemIndex) => {
                const rowY = blockY + rowHeight + (itemIndex * rowHeight);
                const area = parseFloat(item.area_ha || 0);
                totalArea += area;
                totalRateio += area;

                const leftData = [
                    { text: farmCode },
                    { text: farmName },
                    { text: item.talhao_nome || item.talhao || '' },
                    { text: item.variedade || '' },
                    { text: formatNumber(area) },
                    { text: formatNumber(area) }
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

                doc.moveTo(xLeft, rowY + rowHeight).lineTo(xRight, rowY + rowHeight).stroke();
            });

            const opHeight = Math.max(rowHeight * 3, Math.min(blockH * 0.45, rowHeight * 7));
            drawOpSummaryBox(xRight, blockY, wRight, opHeight, operations);
            drawObsBox(xRight, blockY + opHeight, wRight, blockH - opHeight, osData.observacoes || osData.observations || '');

            return blockBottom;
        };

        let totalArea = 0;
        let totalRateio = 0;
        const operationSummary = collectOperationSummary();

        let currentIndex = 0;
        let mainBlockBottom = currentY;
        const safeItems = items.length > 0 ? items : [{}];
        while (currentIndex < safeItems.length) {
            const pageItems = safeItems.slice(currentIndex, currentIndex + maxMainRowsPerPage);
            mainBlockBottom = drawMainBlockPlots(currentY, pageItems, operationSummary);
            currentIndex += pageItems.length;
            if (currentIndex < safeItems.length) {
                doc.addPage();
                currentY = drawHeader(doc) + 8;
            }
        }

        currentY = mainBlockBottom;
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
                     const isProductOrDescriptionColumn = i === 1 || i === 2;
                     const fitted = isProductOrDescriptionColumn
                         ? fitSingleLine(col.text, colWidth - (padding * 2), 7, 7)
                         : { text: String(col.text), fontSize: 7 };
                     doc.fontSize(fitted.fontSize).text(fitted.text, x + padding, y + padding + 1, {
                         width: colWidth - (padding*2),
                         align: align,
                         lineBreak: false,
                         ellipsis: !isProductOrDescriptionColumn
                     });
                 }
                 x += colWidth;
             });
        };

        const drawProductsTable = (startY) => {
            let tableY = startY;
            doc.font('Helvetica-Bold').fontSize(7);
            drawProdRow(tableY, prodHeaders, true);
            tableY += rowHeight;
            doc.font('Helvetica').fontSize(7);

            const products = osData.produtos || osData.products || [];
            let totalProdQty = 0;

            products.forEach(prod => {
                if (tableY > doc.page.height - 50) {
                    doc.addPage();
                    tableY = drawHeader(doc) + 20;
                    doc.font('Helvetica-Bold');
                    drawProdRow(tableY, prodHeaders, true);
                    tableY += rowHeight;
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
                drawProdRow(tableY, row);
                tableY += rowHeight;
            });

            doc.font('Helvetica-Bold');
            const prodTotalRow = [
                { text: '' }, { text: '' }, { text: '' }, { text: '' }, { text: 'Total .:', align: 'right' },
                { text: formatNumber(totalProdQty) }
            ];
            drawProdRow(tableY, prodTotalRow);
            return tableY + 40;
        };

        currentY = drawProductsTable(currentY);

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

        drawFooter(doc, osData.usuario_abertura_nome || osData.generatedBy || generatedBy || 'Sistema');
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
