const { setupDoc, getLogoBase64, generatePdfHeader, generatePdfFooter, drawTable, formatNumber, calculateColumnWidths } = require('../utils/pdfGenerator');
const { getShapefileData, findTalhaoForTrap, findShapefileProp } = require('../utils/geoUtils');
const admin = require('firebase-admin');

const generateOsPdf = async (req, res, db) => {
    try {
        const { osId, companyId, generatedBy } = req.query;

        if (!osId) {
            return res.status(400).json({ message: 'ID da Ordem de Serviço não fornecido.' });
        }

        if (!companyId) {
            return res.status(400).json({ message: 'ID da empresa não fornecido.' });
        }

        const osDoc = await db.collection('ordens_servico').doc(osId).get();
        if (!osDoc.exists) {
            return res.status(404).json({ message: 'OS não encontrada' });
        }

        const osData = osDoc.data();
        if (osData.companyId !== companyId) {
            return res.status(404).json({ message: 'OS não encontrada' });
        }

        const doc = setupDoc();
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="OS_${osId}.pdf"`);
        doc.pipe(res);

        // Fetch additional data if needed (e.g., Farm details, Person details)
        // Frontend sends fazenda_id and fazenda_nome, so we might not need to fetch, but we need the code.
        const farmDocument = await db.collection('fazendas').doc(osData.fazenda_id || osData.farmId).get();
        const farmData = farmDocument.exists ? farmDocument.data() : null;
        const farmCode = farmData ? farmData.code : 'N/A';
        const farmName = osData.fazenda_nome || osData.farmName || (farmData ? farmData.name : 'N/A');

        const geojsonData = await getShapefileData(db, companyId);
        const logoBase64 = await getLogoBase64(db, companyId);

        // --- PAGE 1: Tables (Model Match) ---
        await generatePdfHeader(doc, 'OS - Ordem de Serviço / AGRICOLA', logoBase64);

        // Header Rows (Matching Model)
        const headerY = doc.y;
        doc.fontSize(9).font('Helvetica');

        // Row 1: Date and OS Number (Right aligned in header usually, but model has them in specific places)
        // Adjusting based on standard header or custom drawing.
        // generatePdfHeader handles the main title. We add specific fields below.

        const topY = doc.y - 15; // Move up a bit into the header space if needed, or just start below

        // Custom Header Fields Box
        doc.rect(30, doc.y, 535, 65).stroke();

        const row1Y = doc.y + 5;
        // Col 1: Matrícula Encarregado / Nome
        doc.font('Helvetica-Bold').text('Matrícula Encarregado:', 35, row1Y);
        doc.font('Helvetica').text(osData.responsavel_matricula || osData.responsibleMatricula || 'N/A', 140, row1Y);

        doc.font('Helvetica-Bold').text('Nome:', 250, row1Y);
        doc.font('Helvetica').text(osData.responsavel_nome || osData.responsible || 'N/A', 290, row1Y);

        // Right side info (Data, OS, Etapa, Safra/Ciclo) - simulating the top header row of the image

        const row2Y = row1Y + 15;
        doc.font('Helvetica-Bold').text('Usuário Abertura:', 35, row2Y);
        doc.font('Helvetica').text(osData.usuario_abertura_nome || osData.generatedBy || generatedBy || 'N/A', 140, row2Y);

        const row3Y = row2Y + 15;
        doc.font('Helvetica-Bold').text('Produtor:', 35, row3Y);
        doc.font('Helvetica').text(`${farmCode}   ${farmName}`, 140, row3Y);

        // Extra info often found in header:
        // Data, OS, Etapa, Safra/Ciclo, Página
        doc.font('Helvetica-Bold').text('Data:', 400, row1Y);
        // Prioritize manually selected date
        let dateStr = 'N/A';
        if (osData.data) {
            const [y, m, d] = osData.data.split('-'); // YYYY-MM-DD
            dateStr = `${d}/${m}/${y}`;
        } else if (osData.createdAt) {
            dateStr = new Date(osData.createdAt).toLocaleDateString('pt-BR');
        } else {
            dateStr = new Date().toLocaleDateString('pt-BR');
        }

        doc.font('Helvetica').text(dateStr, 430, row1Y);

        doc.font('Helvetica-Bold').text('OS:', 490, row1Y);
        doc.font('Helvetica').text(osData.os_numero || osData.sequentialId || osId, 515, row1Y);

        doc.font('Helvetica-Bold').text('Etapa:', 400, row2Y);
        doc.font('Helvetica').text(osData.tipo_servico_desc || osData.serviceType || 'N/A', 440, row2Y);

        doc.font('Helvetica-Bold').text('Safra/Ciclo:', 400, row3Y);
        const safra = osData.safra || '';
        const ciclo = osData.ciclo || '';
        const safraCiclo = (safra && ciclo) ? `${safra} - ${ciclo}` : (osData.safraCiclo || 'N/A');
        doc.font('Helvetica').text(safraCiclo, 460, row3Y);

        doc.moveDown(4);

        // --- Main Table ---
        // Columns: Propriedade | Fundo Agr. | Talhão | Variedade | Area | Area Rateio | Operação | Quantidade

        const mainTableHeaders = [
            'Propriedade', 'Fundo Agr.', 'Talhão', 'Variedade', 'Área', 'Área Rateio', 'Operação', 'Quantidade'
        ];

        // Prepare table data
        const tableRows = [];
        let totalArea = 0;

        const items = osData.itens || osData.items || [];
        // If items is empty but selectedPlots exists (legacy), convert.
        if (items.length === 0 && osData.selectedPlots) {
             // Fetch plot details from farmData if available
             if (farmData && farmData.talhoes) {
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

        items.forEach(item => {
            tableRows.push([
                farmCode, // Propriedade
                farmName, // Fundo Agr.
                item.talhao_nome || item.talhao || 'N/A', // Talhão
                item.variedade || '', // Variedade
                formatNumber(item.area_ha || 0), // Área
                formatNumber(item.area_ha || 0), // Área Rateio (assuming same for now)
                osData.operacao_nome || osData.operationName || osData.tipo_servico_desc || '', // Operação
                formatNumber(item.quantidade || 0) // Quantidade
            ]);
            totalArea += (item.area_ha || 0);
        });

        // Add Total Row
        tableRows.push([
            '', '', '', 'Total', formatNumber(totalArea), formatNumber(totalArea), '', ''
        ]);

        const startY = doc.y;

        // Draw Main Table
        // Need custom column widths to match image
        // Prop(10%), Fundo(25%), Talhao(10%), Var(10%), Area(10%), Rateio(10%), Oper(15%), Qtde(10%)
        const tableWidth = 535;
        const colWidths = [
            tableWidth * 0.08,
            tableWidth * 0.22,
            tableWidth * 0.08,
            tableWidth * 0.12,
            tableWidth * 0.10,
            tableWidth * 0.10,
            tableWidth * 0.20,
            tableWidth * 0.10
        ];

        drawTable(doc, mainTableHeaders, tableRows, {
            startY: startY,
            colWidths: colWidths,
            fontSize: 8,
            headerColor: '#FFFFFF', // Image has white header background with lines? Or transparent. Standard is grey usually.
            textColor: '#000000'
        });

        doc.moveDown(1);

        // --- Observations Box ---
        if (osData.observacoes || osData.observations) {
            doc.font('Helvetica-Bold').text('Obs.:', { continued: true });
            doc.font('Helvetica').text(` ${osData.observacoes || osData.observations}`);
            doc.rect(30, doc.y - 10, 535, 40).stroke(); // Box around obs
            doc.moveDown(3);
        } else {
             doc.font('Helvetica-Bold').text('Obs.:');
             doc.rect(30, doc.y, 535, 40).stroke();
             doc.moveDown(3);
        }

        // --- Product Requisition Table ---
        // Title
        doc.font('Helvetica-Bold').fontSize(10).text('REQUISIÇÃO DE PRODUTOS', { align: 'center' });
        doc.moveDown(0.5);

        // Columns: Oper. | Produto | Descrição | Und. | Qtde HA | Qtde Total
        const prodHeaders = ['Oper.', 'Produto', 'Descrição', 'Und.', 'Qtde HA', 'Qtde Total'];

        const prodRows = [];
        const products = osData.produtos || osData.products || [];

        let totalProdQty = 0;

        products.forEach(prod => {
            const dosage = prod.dosagem_por_ha || prod.dosage || 0;
            const qtyTotal = prod.qtde_total || prod.quantity || (dosage * totalArea);
            prodRows.push([
                osData.operacao_nome || osData.operationId || 'N/A', // Oper. (Using name as ID is internal)
                prod.codigo_externo || prod.produto_id || prod.id || 'N/A', // Produto (Code/ID)
                prod.produto_nome || prod.name || '', // Descrição
                prod.unidade || prod.unit || '', // Und.
                formatNumber(dosage), // Qtde HA
                formatNumber(qtyTotal) // Qtde Total
            ]);
            totalProdQty += qtyTotal;
        });

        // Total Row for Products
        prodRows.push([
            '', '', '', '', 'Total:', formatNumber(totalProdQty)
        ]);

        const prodColWidths = [
            tableWidth * 0.15,
            tableWidth * 0.10,
            tableWidth * 0.35,
            tableWidth * 0.10,
            tableWidth * 0.15,
            tableWidth * 0.15
        ];

        drawTable(doc, prodHeaders, prodRows, {
            colWidths: prodColWidths,
            fontSize: 8
        });

        // --- Footer Signatures ---
        const footerY = doc.page.height - 100;
        doc.moveTo(30, footerY).lineTo(250, footerY).stroke();
        doc.moveTo(315, footerY).lineTo(565, footerY).stroke();

        doc.fontSize(9).font('Helvetica-Bold');
        doc.text('TÉCNICO RESPONSÁVEL', 30, footerY + 5, { width: 220, align: 'center' });
        doc.text('PRODUTOR', 315, footerY + 5, { width: 250, align: 'center' });


        // --- PAGE 2: Map (Preserved & Attached) ---
        if (geojsonData) {
            doc.addPage();
            await generatePdfHeader(doc, 'Mapa da O.S.', logoBase64);
            doc.fontSize(12).text(`Mapa de Aplicação - O.S. ${osData.os_numero || osData.sequentialId || osId}`, { align: 'center' });
            doc.moveDown();

            const mapWidth = 535;
            const mapHeight = 600;
            const mapX = 30;
            const mapY = doc.y;

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

                    // Logic to check if selected. Legacy uses array of strings, new might use object.
                    // Support both.
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
