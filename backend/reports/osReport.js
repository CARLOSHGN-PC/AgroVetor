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
        const logoBase64 = await getLogoBase64(db, companyId);

        // --- PAGE 1: HEADER + DATA + OBS + SIGNATURES ---

        // 1. Header
        // Logo
        if (logoBase64) {
            try {
                doc.image(logoBase64, 28, 20, { width: 50 });
            } catch (e) { console.warn("Logo error", e); }
        }

        // Title
        doc.font('Helvetica-Bold').fontSize(14).text('OS - Ordem de Serviço / AGRICOLA', 0, 35, { align: 'center' });
        doc.moveDown(3);

        const startY = doc.y;
        const pageWidth = doc.page.width;
        const pageMargin = 28;
        const contentWidth = pageWidth - (pageMargin * 2);

        // 2. Data Box
        const boxY = doc.y;
        const boxHeight = 70; // Adjusted for content
        doc.rect(pageMargin, boxY, contentWidth, boxHeight).stroke();

        const col1X = pageMargin + 5;
        const col2X = pageMargin + 250;
        const rowHeight = 14;
        let currentY = boxY + 8;

        doc.fontSize(9);

        // Row 1
        doc.font('Helvetica-Bold').text('Matrícula Encarregado:', col1X, currentY);
        doc.font('Helvetica').text(osData.responsavel_matricula || osData.responsibleMatricula || '', col1X + 110, currentY);

        doc.font('Helvetica-Bold').text('Nome:', col2X, currentY);
        doc.font('Helvetica').text(osData.responsavel_nome || osData.responsible || '', col2X + 40, currentY);

        // Date Logic
        let dateStr = '';
        if (osData.data) {
             const parts = osData.data.split('-');
             if(parts.length === 3) dateStr = `${parts[2]}/${parts[1]}/${parts[0]}`;
             else dateStr = osData.data;
        } else if (osData.createdAt) {
             dateStr = new Date(osData.createdAt.toDate ? osData.createdAt.toDate() : osData.createdAt).toLocaleDateString('pt-BR');
        }

        doc.font('Helvetica-Bold').text('Data:', col2X + 180, currentY); // Right aligned in box
        doc.font('Helvetica').text(dateStr, col2X + 210, currentY);

        currentY += rowHeight;

        // Row 2
        doc.font('Helvetica-Bold').text('Usuário Abertura:', col1X, currentY);
        doc.font('Helvetica').text(osData.usuario_abertura_nome || osData.generatedBy || generatedBy || 'Sistema', col1X + 110, currentY);

        doc.font('Helvetica-Bold').text('OS:', col2X, currentY);
        doc.font('Helvetica').text(osData.os_numero || osData.sequentialId || osId, col2X + 40, currentY);

        doc.font('Helvetica-Bold').text('Etapa:', col2X + 180, currentY);
        doc.font('Helvetica').text(osData.tipo_servico_desc || osData.serviceType || '', col2X + 215, currentY);

        currentY += rowHeight;

        // Row 3
        doc.font('Helvetica-Bold').text('Produtor:', col1X, currentY);
        doc.font('Helvetica').text(`${farmCode} - ${farmName}`, col1X + 110, currentY);

        const safra = osData.safra || '';
        const ciclo = osData.ciclo || '';
        const safraCiclo = (safra || ciclo) ? `${safra}${safra && ciclo ? ' - ' : ''}${ciclo}` : (osData.safraCiclo || '');

        doc.font('Helvetica-Bold').text('Safra/Ciclo:', col2X, currentY);
        doc.font('Helvetica').text(safraCiclo, col2X + 60, currentY);

        // 3. Observations Box (Page 1)
        const obsY = boxY + boxHeight; // Directly below
        const obsHeight = 350; // Large box as requested
        doc.rect(pageMargin, obsY, contentWidth, obsHeight).stroke();

        doc.font('Helvetica-Bold').text('Obs.:', pageMargin + 5, obsY + 5);
        if (osData.observacoes || osData.observations) {
            doc.font('Helvetica').text(osData.observacoes || osData.observations, pageMargin + 5, obsY + 20, {
                width: contentWidth - 10,
                align: 'left'
            });
        }

        // 4. Signatures (Page 1)
        const footerSignY = doc.page.height - 100;

        // Left Signature
        doc.moveTo(pageMargin, footerSignY).lineTo(pageMargin + 200, footerSignY).stroke();
        doc.text('TÉCNICO RESPONSÁVEL', pageMargin, footerSignY + 5, { width: 200, align: 'center' });

        // Right Signature
        doc.moveTo(pageWidth - pageMargin - 200, footerSignY).lineTo(pageWidth - pageMargin, footerSignY).stroke();
        doc.text('PRODUTOR', pageWidth - pageMargin - 200, footerSignY + 5, { width: 200, align: 'center' });


        // --- PAGE 2+: MAIN TABLE (Talhões) ---
        doc.addPage(); // Force start on Page 2

        // Define Columns
        // Propriedade | Fundo Agr. | Talhão | Variedade | Area | Area Rateio | Operação | Quantidade
        // Layout: Table takes ~70% width, Side Box takes ~30%
        // Total Width = contentWidth (539 approx for A4 margin 28)

        const tableWidth = contentWidth * 0.70;
        const sideBoxWidth = contentWidth * 0.30;
        const sideBoxX = pageMargin + tableWidth;

        // Custom Table Drawer
        const drawMainTable = () => {
             const headers = [
                { text: 'Propriedade', width: tableWidth * 0.12, align: 'left' },
                { text: 'Fundo Agr.', width: tableWidth * 0.25, align: 'left' },
                { text: 'Talhão', width: tableWidth * 0.10, align: 'center' },
                { text: 'Variedade', width: tableWidth * 0.13, align: 'left' },
                { text: 'Area', width: tableWidth * 0.10, align: 'right' },
                { text: 'Area Rateio', width: tableWidth * 0.12, align: 'right' },
                { text: 'Operação', width: tableWidth * 0.10, align: 'left' }, // Truncate
                { text: 'Quantidade', width: tableWidth * 0.08, align: 'right' }
            ];

            // Calculate exact widths to sum to tableWidth
            let currentX = pageMargin;

            // Header
            let y = 30; // Start Y for Table
            const headerHeight = 15;

            // Draw Header
            doc.font('Helvetica-Bold').fontSize(8);

            // Draw Headers Background or Lines? Model has simple text headers with line below
            // "COM GRID (bordas externas e verticais)"

            // Helper to draw row
            const drawRow = (rowY, cols, isHeader=false) => {
                let x = pageMargin;
                // Draw horizontal line top
                doc.moveTo(x, rowY).lineTo(x + tableWidth, rowY).stroke();

                cols.forEach((col, i) => {
                    // Vertical line left
                    doc.moveTo(x, rowY).lineTo(x, rowY + headerHeight).stroke();

                    if (col.text) {
                        doc.text(col.text, x + 2, rowY + 4, {
                            width: headers[i].width - 4,
                            align: headers[i].align,
                            height: headerHeight - 4,
                            ellipsis: true
                        });
                    }
                    x += headers[i].width;
                });
                // Vertical line right end
                doc.moveTo(x, rowY).lineTo(x, rowY + headerHeight).stroke();
                // Horizontal line bottom
                doc.moveTo(pageMargin, rowY + headerHeight).lineTo(pageMargin + tableWidth, rowY + headerHeight).stroke();
            };

            drawRow(y, headers, true);
            y += headerHeight;

            doc.font('Helvetica').fontSize(8);

            // Data
            let items = osData.itens || osData.items || [];
            if (items.length === 0 && osData.selectedPlots && farmData) {
                 // Fallback legacy
                 if (farmData.talhoes) {
                     osData.selectedPlots.forEach(plotName => {
                         const t = farmData.talhoes.find(pt => String(pt.name) === String(plotName));
                         if (t) {
                             items.push({
                                 talhao_nome: t.name,
                                 variedade: t.variedade || '',
                                 area_ha: t.area,
                             });
                         }
                     });
                 }
            }

            let totalArea = 0;
            let totalRateio = 0; // Assuming same for now

            items.forEach(item => {
                // Check Page Break
                if (y > doc.page.height - 100) { // Leave space for footer
                     // Close Side Box for this page
                     doc.rect(sideBoxX, 30, sideBoxWidth, y - 30).stroke();
                     doc.text('Obs .:', sideBoxX + 5, 35);

                     doc.addPage();
                     y = 30;
                     drawRow(y, headers, true); // Header again
                     y += headerHeight;
                     doc.font('Helvetica').fontSize(8);
                }

                const area = parseFloat(item.area_ha || 0);
                const rateio = area; // Logic for rateio?
                totalArea += area;
                totalRateio += rateio;

                const rowData = [
                    { text: farmCode },
                    { text: farmName },
                    { text: item.talhao_nome || item.talhao || '' },
                    { text: item.variedade || '' },
                    { text: formatNumber(area) },
                    { text: formatNumber(rateio) },
                    { text: osData.operacao_nome || osData.tipo_servico_desc || '' },
                    { text: formatNumber(item.quantidade || 0) }
                ];

                drawRow(y, rowData);
                y += headerHeight;
            });

            // Total Row
            const totalRow = [
                { text: '' }, { text: '' }, { text: '' }, { text: 'Total', align: 'right' },
                { text: formatNumber(totalArea) },
                { text: formatNumber(totalRateio) },
                { text: '' }, { text: '' }
            ];
            // Merge cells visually? simpler to just draw empty
            drawRow(y, totalRow);

            // Draw Side Box (Obs)
            // It goes from Top (30) to Current Y (y + headerHeight)
            const boxBottomY = y + headerHeight;
            doc.rect(sideBoxX, 30, sideBoxWidth, boxBottomY - 30).stroke();
            doc.font('Helvetica-Bold').fontSize(9).text('Obs .:', sideBoxX + 5, 35);

            return boxBottomY;
        };

        const tableEndY = drawMainTable();
        doc.moveDown(2);
        let currentYPos = tableEndY + 20;

        // --- REQUISITION OF PRODUCTS ---
        // Check if space exists, else new page
        if (currentYPos + 100 > doc.page.height) {
            doc.addPage();
            currentYPos = 30;
        } else {
             doc.y = currentYPos;
        }

        // Title Box
        doc.rect(pageMargin, currentYPos, contentWidth, 15).stroke();
        doc.font('Helvetica-Bold').fontSize(10).text('REQUISIÇÃO DE PRODUTOS', pageMargin, currentYPos + 3, { width: contentWidth, align: 'center' });
        currentYPos += 15;

        // Columns: Oper. | Produto | Descrição | Und. | Qtde HA | Qtde Total
        // Grid lines mandatory
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
             doc.moveTo(x, y).lineTo(x + contentWidth, y).stroke(); // Top Line

             cols.forEach((col, i) => {
                 doc.moveTo(x, y).lineTo(x, y + 15).stroke(); // Vertical Left
                 if (col.text) {
                     doc.text(col.text, x + 2, y + 4, {
                         width: prodHeaders[i].width - 4,
                         align: prodHeaders[i].align,
                         height: 11,
                         ellipsis: true
                     });
                 }
                 x += prodHeaders[i].width;
             });
             doc.moveTo(x, y).lineTo(x, y + 15).stroke(); // Vertical Right
             doc.moveTo(pageMargin, y + 15).lineTo(pageMargin + contentWidth, y + 15).stroke(); // Bottom
        };

        // Header
        doc.font('Helvetica-Bold').fontSize(8);
        drawProdRow(currentYPos, prodHeaders);
        currentYPos += 15;
        doc.font('Helvetica');

        const products = osData.produtos || osData.products || [];
        let totalProdQty = 0;

        products.forEach(prod => {
             if (currentYPos > doc.page.height - 50) {
                 doc.addPage();
                 currentYPos = 30;
                 doc.font('Helvetica-Bold');
                 drawProdRow(currentYPos, prodHeaders);
                 currentYPos += 15;
                 doc.font('Helvetica');
             }

             const dosage = prod.dosagem_por_ha || prod.dosage || 0;
             const qtyTotal = prod.qtde_total || prod.quantity || (dosage * (totalArea || 0)); // Fallback totalArea calc
             totalProdQty += qtyTotal;

             const row = [
                 { text: osData.operacao_nome || osData.operationId || '' },
                 { text: prod.codigo_externo || prod.produto_id || '' },
                 { text: prod.produto_nome || prod.name || '' },
                 { text: prod.unidade || prod.unit || '' },
                 { text: formatNumber(dosage) },
                 { text: formatNumber(qtyTotal) }
             ];
             drawProdRow(currentYPos, row);
             currentYPos += 15;
        });

        // Total Row
        const prodTotalRow = [
            { text: '' }, { text: '' }, { text: '' }, { text: '' }, { text: 'Total .:', align: 'right' },
            { text: formatNumber(totalProdQty) }
        ];
        drawProdRow(currentYPos, prodTotalRow);
        currentYPos += 15;

        // Signatures again if they fit? Model shows signatures at bottom of page usually.
        // We put them on Page 1. If user wants them on last page too:
        // "Manter assinaturas (se ficar na mesma página do bloco final) igual ao modelo."
        // We will add them here too if there is space, or new page.

        if (currentYPos < doc.page.height - 120) {
             const footerSignY2 = doc.page.height - 80;
             doc.moveTo(pageMargin, footerSignY2).lineTo(pageMargin + 200, footerSignY2).stroke();
             doc.text('TÉCNICO RESPONSÁVEL', pageMargin, footerSignY2 + 5, { width: 200, align: 'center' });

             doc.moveTo(pageWidth - pageMargin - 200, footerSignY2).lineTo(pageWidth - pageMargin, footerSignY2).stroke();
             doc.text('PRODUTOR', pageWidth - pageMargin - 200, footerSignY2 + 5, { width: 200, align: 'center' });
        }


        // --- MAP PAGE (Landscape) ---
        if (geojsonData) {
            doc.addPage({ size: 'A4', layout: 'landscape', margin: 28 });

            // Landscape Dimensions
            // A4 Landscape: 841.89 x 595.28 pts
            const lsPageWidth = doc.page.width;
            const lsPageHeight = doc.page.height;
            const lsMargin = 28;

            // Title
            doc.font('Helvetica-Bold').fontSize(14).text(`Mapa de Aplicação - O.S. ${osData.os_numero || osData.sequentialId || osId}`, lsMargin, lsMargin, { width: lsPageWidth - (lsMargin*2), align: 'center' });

            // Area Calculation
            const mapAreaX = lsMargin;
            const mapAreaY = lsMargin + 30;
            const mapAreaW = lsPageWidth - (lsMargin * 2);
            const mapAreaH = lsPageHeight - (lsMargin * 2) - 50; // Leave space for footer/title

            // Filter Features
            const farmFeatures = geojsonData.features.filter(f => {
                if (!f.properties) return false;
                const propKeys = Object.keys(f.properties);
                const codeKey = propKeys.find(k => k.toLowerCase() === 'fundo_agr');
                // Or try matching farm name if code is missing? Better rely on Code.
                const featureFarmCode = codeKey ? f.properties[codeKey] : null;
                return featureFarmCode && parseInt(featureFarmCode, 10) === parseInt(farmCode, 10);
            });

            if (farmFeatures.length > 0) {
                // Calculate Bounds
                const allCoords = farmFeatures.flatMap(f => f.geometry.type === 'Polygon' ? f.geometry.coordinates[0] : f.geometry.coordinates.flatMap(p => p[0]));
                const bbox = {
                    minX: Math.min(...allCoords.map(c => c[0])), maxX: Math.max(...allCoords.map(c => c[0])),
                    minY: Math.min(...allCoords.map(c => c[1])), maxY: Math.max(...allCoords.map(c => c[1])),
                };

                const geoWidth = bbox.maxX - bbox.minX;
                const geoHeight = bbox.maxY - bbox.minY;

                // Scale to Fit
                // scale = pixels / geoUnit
                const scaleX = mapAreaW / geoWidth;
                const scaleY = mapAreaH / geoHeight;
                const scale = Math.min(scaleX, scaleY) * 0.98; // 2% padding inside

                // Center Map
                const finalMapW = geoWidth * scale;
                const finalMapH = geoHeight * scale;
                const offsetX = mapAreaX + (mapAreaW - finalMapW) / 2;
                const offsetY = mapAreaY + (mapAreaH - finalMapH) / 2;

                // Transform Function (Flip Y for PDF coords)
                // PDF Y increases downwards. Geo Y increases upwards usually (Lat).
                // Wait, Shapefiles are usually projected or Lat/Lon.
                // If projected (meters), Y increases North (Up).
                // If standard Lat/Lon, Y (Lat) increases North (Up).
                // So (bbox.maxY - coord[1]) flips it correctly.

                const transformCoord = (coord) => [
                    (coord[0] - bbox.minX) * scale + offsetX,
                    (bbox.maxY - coord[1]) * scale + offsetY
                ];

                doc.save();
                doc.lineWidth(0.5);

                const labelsToDraw = [];

                farmFeatures.forEach(feature => {
                    const talhaoNome = findShapefileProp(feature.properties, ['CD_TALHAO', 'COD_TALHAO', 'TALHAO']) || '';

                    // Selected Logic
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

                    // Label Center
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

                // Draw Labels
                labelsToDraw.forEach(label => {
                    doc.fontSize(8).font('Helvetica');
                    const textWidth = doc.widthOfString(label.text);
                    const textHeight = doc.currentLineHeight();
                    const padding = 2;
                    const rectWidth = textWidth + (padding * 2);
                    const rectHeight = textHeight + (padding * 2);

                    // Draw White Box
                    doc.fillOpacity(1);
                    doc.fillColor('white');
                    doc.rect(label.x - (rectWidth / 2), label.y - (rectHeight / 2), rectWidth, rectHeight).fill();

                    // Draw Text
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

        // Generate Footer for all pages
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
