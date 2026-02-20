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
        // Permission check
        if (osData.companyId !== companyId) {
             return res.status(404).json({ message: 'OS não encontrada' });
        }

        // Fetch Company Name if possible
        let companyName = 'AGROVETOR';
        try {
            const companyDoc = await db.collection('companies').doc(companyId).get();
            if (companyDoc.exists && companyDoc.data().name) {
                companyName = companyDoc.data().name.toUpperCase();
            }
        } catch (e) {
            console.warn("Error fetching company name:", e);
        }

        const doc = setupDoc({ margin: 28, size: 'A4', bufferPages: true });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="OS_${osId}.pdf"`);
        doc.pipe(res);

        // Fetch Data
        const farmDocument = await db.collection('fazendas').doc(osData.fazenda_id || osData.farmId).get();
        const farmData = farmDocument.exists ? farmDocument.data() : null;
        const farmCode = farmData ? farmData.code : 'N/A';
        const farmName = osData.fazenda_nome || osData.farmName || (farmData ? farmData.name : 'N/A');

        const geojsonData = await getShapefileData(db, companyId);

        // Header Grid Layout Helper
        const drawHeader = (doc) => {
             const startY = 28;
             const pageMargin = 28;
             const pageWidth = doc.page.width;
             const contentWidth = pageWidth - (pageMargin * 2);
             let y = startY;

             doc.lineWidth(0.5).strokeColor('#000000');
             doc.font('Helvetica-Bold').fontSize(9);

             // Row 1
             const row1H = 15;
             doc.rect(pageMargin, y, contentWidth * 0.5, row1H).stroke();
             doc.text(companyName, pageMargin + 5, y + 4, { width: contentWidth * 0.5 - 10, ellipsis: true });

             doc.rect(pageMargin + contentWidth * 0.5, y, contentWidth * 0.25, row1H).stroke();
             let dateStr = '';
             if (osData.data) {
                 const parts = osData.data.split('-');
                 if(parts.length === 3) dateStr = `${parts[2]}/${parts[1]}/${parts[0]}`;
                 else dateStr = osData.data;
             } else if (osData.createdAt) {
                 dateStr = new Date(osData.createdAt.toDate ? osData.createdAt.toDate() : osData.createdAt).toLocaleDateString('pt-BR');
             }
             doc.text(`Data ..:    ${dateStr}`, pageMargin + contentWidth * 0.5 + 5, y + 4);

             doc.rect(pageMargin + contentWidth * 0.75, y, contentWidth * 0.25, row1H).stroke();
             doc.text(`OS ..:    ${osData.os_numero || osData.sequentialId || osId}`, pageMargin + contentWidth * 0.75 + 5, y + 4);
             y += row1H;

             // Row 2
             const row2H = 15;
             doc.rect(pageMargin, y, contentWidth * 0.5, row2H).stroke();
             doc.font('Helvetica-Bold').fontSize(12).text('OS - Ordem de Serviço', pageMargin + 5, y + 2);
             doc.fontSize(9).text('AGRICOLA', pageMargin + 5, y + 14);

             doc.rect(pageMargin + contentWidth * 0.5, y, contentWidth * 0.5, row2H).stroke();
             doc.text(`Etapa ..:    ${osData.tipo_servico_desc || osData.serviceType || ''}`, pageMargin + contentWidth * 0.5 + 5, y + 4);
             y += row2H;

             // Row 3
             const row3H = 15;
             doc.rect(pageMargin, y, contentWidth * 0.5, row3H).stroke();
             doc.text('AGRICOLA', pageMargin + 5, y + 4);

             const safra = osData.safra || '';
             const ciclo = osData.ciclo || '';
             const safraCiclo = (safra || ciclo) ? `${safra}/${ciclo}` : (osData.safraCiclo || '');

             doc.rect(pageMargin + contentWidth * 0.5, y, contentWidth * 0.35, row3H).stroke();
             doc.text(`Safra/Ciclo ..:    ${safraCiclo}`, pageMargin + contentWidth * 0.5 + 5, y + 4);

             doc.rect(pageMargin + contentWidth * 0.85, y, contentWidth * 0.15, row3H).stroke();
             // Page number handled by footer logic (generatePdfFooter iterates all pages)
             // We can leave blank or put placeholder.
             // If we really want page number in HEADER, we need to know total pages which we don't know yet.
             // Best practice: Leave blank or use footer exclusively.
             // However, generatePdfFooter adds footer.
             // Let's leave header blank here or just label.
             doc.text(`Página ..:`, pageMargin + contentWidth * 0.85 + 5, y + 4);
             y += row3H;

             // Row 4
             const row4H = 15;
             doc.rect(pageMargin, y, contentWidth * 0.30, row4H).stroke();
             doc.text(`Matrícula Encarregado:    ${osData.responsavel_matricula || ''}`, pageMargin + 5, y + 4);

             doc.rect(pageMargin + contentWidth * 0.30, y, contentWidth * 0.70, row4H).stroke();
             doc.text(`Nome..:    ${osData.responsavel_nome || ''}`, pageMargin + contentWidth * 0.30 + 5, y + 4);
             y += row4H;

             // Row 5
             const row5H = 15;
             doc.rect(pageMargin, y, contentWidth, row5H).stroke();
             doc.text(`Usuário Abertura:    ${osData.usuario_abertura_nome || osData.generatedBy || generatedBy || 'Sistema'}`, pageMargin + 5, y + 4);
             y += row5H;

             // Row 6
             const row6H = 15;
             doc.rect(pageMargin, y, contentWidth, row6H).stroke();
             doc.text(`Produtor :    ${farmCode}        ${farmName}`, pageMargin + 5, y + 4);
             y += row6H;

             return y;
        };

        let currentY = drawHeader(doc);
        doc.moveDown(1);
        currentY += 10;

        // --- MAIN TABLE (Talhões) ---
        const pageMargin = 28;
        const pageWidth = doc.page.width;
        const contentWidth = pageWidth - (pageMargin * 2);

        const tableWidth = contentWidth * 0.65;
        const sideBoxWidth = contentWidth * 0.35;
        const sideBoxX = pageMargin + tableWidth;

        const headers = [
            { text: 'Propriedade', width: tableWidth * 0.12, align: 'left' },
            { text: 'Fundo Agr.', width: tableWidth * 0.25, align: 'left' },
            { text: 'Talhão', width: tableWidth * 0.10, align: 'center' },
            { text: 'Variedade', width: tableWidth * 0.13, align: 'left' },
            { text: 'Area', width: tableWidth * 0.10, align: 'right' },
            { text: 'Area Rateio', width: tableWidth * 0.12, align: 'right' },
            { text: 'Operação', width: tableWidth * 0.10, align: 'left' },
            { text: 'Quantidade', width: tableWidth * 0.08, align: 'right' }
        ];

        const headerHeight = 15;

        const drawTableHeader = (y) => {
             let x = pageMargin;
             doc.moveTo(x, y).lineTo(x + tableWidth, y).stroke();
             headers.forEach((col, i) => {
                 doc.moveTo(x, y).lineTo(x, y + headerHeight).stroke();
                 doc.text(col.text, x + 2, y + 4, { width: col.width - 4, align: col.align, ellipsis: true });
                 x += col.width;
             });
             doc.moveTo(x, y).lineTo(x, y + headerHeight).stroke();
             doc.moveTo(pageMargin, y + headerHeight).lineTo(pageMargin + tableWidth, y + headerHeight).stroke();
        };

        doc.font('Helvetica-Bold').fontSize(8);
        drawTableHeader(currentY);

        // Obs Box Setup
        let obsBoxStartY = currentY;
        // Draw top line of obs box
        doc.moveTo(sideBoxX, currentY).lineTo(sideBoxX + sideBoxWidth, currentY).stroke();

        currentY += headerHeight;
        doc.font('Helvetica').fontSize(8);

        // Data Loop
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

        // Obs Text (First Page Only)
        doc.text('Obs .:', sideBoxX + 5, obsBoxStartY + 20);
        if (osData.observacoes || osData.observations) {
            doc.text(osData.observacoes || osData.observations, sideBoxX + 5, obsBoxStartY + 35, {
                width: sideBoxWidth - 10,
                align: 'left'
            });
        }

        const drawRow = (y, cols) => {
            let x = pageMargin;
            cols.forEach((col, i) => {
                doc.moveTo(x, y).lineTo(x, y + headerHeight).stroke();
                if (col.text) {
                    doc.text(col.text, x + 2, y + 4, {
                        width: headers[i].width - 4,
                        align: headers[i].align,
                        height: headerHeight - 4,
                        ellipsis: true
                    });
                }
                x += headers[i].width;
            });
            doc.moveTo(x, y).lineTo(x, y + headerHeight).stroke();
            doc.moveTo(pageMargin, y + headerHeight).lineTo(pageMargin + tableWidth, y + headerHeight).stroke();
        };

        items.forEach(item => {
            if (currentY > doc.page.height - 50) {
                // Close Obs Box for this page
                doc.moveTo(sideBoxX, obsBoxStartY).lineTo(sideBoxX, currentY).stroke(); // Left Vert
                doc.moveTo(sideBoxX + sideBoxWidth, obsBoxStartY).lineTo(sideBoxX + sideBoxWidth, currentY).stroke(); // Right Vert
                doc.moveTo(sideBoxX, currentY).lineTo(sideBoxX + sideBoxWidth, currentY).stroke(); // Bottom Line

                doc.addPage();
                currentY = drawHeader(doc);
                doc.moveDown(1);
                currentY += 10;

                doc.font('Helvetica-Bold').fontSize(8);
                drawTableHeader(currentY);
                doc.font('Helvetica').fontSize(8);

                // Reset Obs Box Start for new page
                obsBoxStartY = currentY;
                // Draw Obs box top line for new page
                doc.moveTo(sideBoxX, currentY).lineTo(sideBoxX + sideBoxWidth, currentY).stroke();

                currentY += headerHeight;
            }

            const area = parseFloat(item.area_ha || 0);
            totalArea += area;
            totalRateio += area;

            const rowData = [
                { text: farmCode },
                { text: farmName },
                { text: item.talhao_nome || item.talhao || '' },
                { text: item.variedade || '' },
                { text: formatNumber(area) },
                { text: formatNumber(area) },
                { text: osData.operacao_nome || osData.tipo_servico_desc || '' },
                { text: formatNumber(item.quantidade || 0) }
            ];
            drawRow(currentY, rowData);
            currentY += headerHeight;
        });

        // Total Row
        const totalRow = [
            { text: '' }, { text: '' }, { text: '' }, { text: 'Total', align: 'right' },
            { text: formatNumber(totalArea) },
            { text: formatNumber(totalRateio) },
            { text: '' }, { text: '' }
        ];
        drawRow(currentY, totalRow);
        currentY += headerHeight;

        // Close Obs Box (Final)
        doc.moveTo(sideBoxX, obsBoxStartY).lineTo(sideBoxX, currentY).stroke();
        doc.moveTo(sideBoxX + sideBoxWidth, obsBoxStartY).lineTo(sideBoxX + sideBoxWidth, currentY).stroke();
        doc.moveTo(sideBoxX, currentY).lineTo(sideBoxX + sideBoxWidth, currentY).stroke();

        currentY += 10;

        // --- REQUISITION OF PRODUCTS ---
        if (currentY + 100 > doc.page.height) {
            doc.addPage();
            currentY = drawHeader(doc) + 20;
        }

        doc.rect(pageMargin, currentY, contentWidth, 15).stroke();
        doc.font('Helvetica-Bold').fontSize(10).text('REQUISIÇÃO DE PRODUTOS', pageMargin, currentY + 3, { width: contentWidth, align: 'center' });
        currentY += 15;

        const prodHeaders = [
            { text: 'Oper.', width: contentWidth * 0.15, align: 'left' },
            { text: 'Produto', width: contentWidth * 0.10, align: 'left' },
            { text: 'Descrição', width: contentWidth * 0.35, align: 'left' },
            { text: 'Und.', width: contentWidth * 0.10, align: 'center' },
            { text: 'Qtde HA', width: contentWidth * 0.15, align: 'right' },
            { text: 'Qtde Total', width: contentWidth * 0.15, align: 'right' }
        ];

        const drawProdRow = (y, cols) => {
             let x = pageMargin;
             cols.forEach((col, i) => {
                 doc.moveTo(x, y).lineTo(x, y + 15).stroke();
                 if (col.text) {
                     doc.text(col.text, x + 2, y + 4, { width: col.width - 4, align: col.align, ellipsis: true });
                 }
                 x += col.width;
             });
             doc.moveTo(x, y).lineTo(x, y + 15).stroke();
             doc.moveTo(pageMargin, y + 15).lineTo(pageMargin + contentWidth, y + 15).stroke();
        };

        doc.font('Helvetica-Bold').fontSize(8);
        drawProdRow(currentY, prodHeaders);
        currentY += 15;
        doc.font('Helvetica');

        const products = osData.produtos || osData.products || [];
        let totalProdQty = 0;

        products.forEach(prod => {
             if (currentY > doc.page.height - 50) {
                 doc.addPage();
                 currentY = drawHeader(doc) + 20;
                 doc.font('Helvetica-Bold');
                 drawProdRow(currentY, prodHeaders);
                 currentY += 15;
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
             currentY += 15;
        });

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

        // Generate Footer (Handles Pagination Loop)
        // Ensure generatePdfFooter supports the loop. Based on pdfGenerator.js context, it does.
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
