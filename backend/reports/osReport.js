const { setupDoc, getLogoBase64, formatNumber } = require('../utils/pdfGenerator');
const { getShapefileData, findShapefileProp } = require('../utils/geoUtils');

const MM_TO_PT = 72 / 25.4;
const PAGE_MARGIN = 10 * MM_TO_PT;
const FOOTER_RESERVED = 18;
const HEADER_HEIGHT = 46;

const findOsDocument = async (db, osId) => {
    const collections = ['serviceOrders', 'ordens_servico'];

    for (const collectionName of collections) {
        const osDoc = await db.collection(collectionName).doc(osId).get();
        if (osDoc.exists) {
            return osDoc;
        }
    }

    return null;
};

const safeString = (value, fallback = 'N/A') => {
    if (value === null || value === undefined || value === '') return fallback;
    return String(value);
};

const parseDate = (osData) => {
    if (osData.data && /^\d{4}-\d{2}-\d{2}$/.test(osData.data)) {
        const [y, m, d] = osData.data.split('-');
        return `${d}/${m}/${y}`;
    }

    if (osData.createdAt && typeof osData.createdAt.toDate === 'function') {
        return osData.createdAt.toDate().toLocaleDateString('pt-BR');
    }

    if (osData.createdAt) {
        const dt = new Date(osData.createdAt);
        if (!Number.isNaN(dt.getTime())) return dt.toLocaleDateString('pt-BR');
    }

    return new Date().toLocaleDateString('pt-BR');
};

const truncateText = (doc, text, width) => {
    const value = safeString(text, '');
    if (doc.widthOfString(value) <= width) return value;

    let truncated = value;
    while (truncated.length > 0 && doc.widthOfString(`${truncated}...`) > width) {
        truncated = truncated.slice(0, -1);
    }

    return truncated.length > 0 ? `${truncated}...` : '...';
};

const drawPageHeader = (doc, title, logoBase64) => {
    const { left, right, top } = doc.page.margins;
    const contentWidth = doc.page.width - left - right;

    if (logoBase64) {
        try {
            doc.image(logoBase64, left, top, { fit: [56, 30], align: 'left', valign: 'center' });
        } catch (error) {
            console.warn('Failed to render logo image:', error.message);
        }
    }

    doc.font('Helvetica-Bold').fontSize(14).text(title, left, top + 8, {
        width: contentWidth,
        align: 'center',
        lineBreak: false
    });

    const lineY = top + HEADER_HEIGHT - 6;
    doc.lineWidth(1).moveTo(left, lineY).lineTo(doc.page.width - right, lineY).stroke();

    return top + HEADER_HEIGHT;
};

const drawFooterOnAllPages = (doc, generatedBy, generatedAt) => {
    const pageCount = doc.bufferedPageRange().count;
    for (let i = 0; i < pageCount; i++) {
        doc.switchToPage(i);
        doc.font('Helvetica').fontSize(8).text(
            `Gerado por: ${generatedBy} em: ${generatedAt} - Página ${i + 1} de ${pageCount}`,
            doc.page.margins.left,
            doc.page.height - doc.page.margins.bottom + 6,
            { align: 'left', lineBreak: false }
        );
    }
};

const drawLabeledValue = (doc, label, value, x, y, width) => {
    doc.font('Helvetica-Bold').fontSize(9).text(label, x, y, { width, lineBreak: false });
    doc.font('Helvetica').fontSize(9).text(safeString(value), x, y + 11, { width, lineBreak: false });
};

const drawTableHeader = (doc, tableX, y, columns) => {
    const rowHeight = 16;
    doc.rect(tableX, y, columns.reduce((sum, col) => sum + col.width, 0), rowHeight).stroke();

    let x = tableX;
    columns.forEach((col, index) => {
        if (index > 0) {
            doc.moveTo(x, y).lineTo(x, y + rowHeight).stroke();
        }

        doc.font('Helvetica-Bold').fontSize(9).text(col.header, x + 3, y + 4, {
            width: col.width - 6,
            align: col.headerAlign || 'left',
            lineBreak: false
        });
        x += col.width;
    });

    return y + rowHeight;
};

const drawTableRow = (doc, tableX, y, columns, row, options = {}) => {
    const rowHeight = options.rowHeight || 15;
    const font = options.bold ? 'Helvetica-Bold' : 'Helvetica';

    doc.rect(tableX, y, columns.reduce((sum, col) => sum + col.width, 0), rowHeight).stroke();

    let x = tableX;
    columns.forEach((col, index) => {
        if (index > 0) {
            doc.moveTo(x, y).lineTo(x, y + rowHeight).stroke();
        }

        const raw = row[col.key];
        const text = col.truncate ? truncateText(doc.font(font).fontSize(8.5), raw, col.width - 6) : safeString(raw, '');
        doc.font(font).fontSize(8.5).text(text, x + 3, y + 3.5, {
            width: col.width - 6,
            align: col.align || 'left',
            lineBreak: false
        });
        x += col.width;
    });

    return y + rowHeight;
};

const ensurePageSpace = (doc, neededHeight, drawHeader) => {
    const limit = doc.page.height - doc.page.margins.bottom - FOOTER_RESERVED;
    if (doc.y + neededHeight <= limit) return false;

    doc.addPage();
    doc.y = drawHeader();
    return true;
};

const buildItems = (osData, farmData) => {
    const items = [...(osData.itens || osData.items || [])];
    if (items.length === 0 && Array.isArray(osData.selectedPlots) && Array.isArray(farmData?.talhoes)) {
        osData.selectedPlots.forEach((plotName) => {
            const talhao = farmData.talhoes.find((item) => String(item.name) === String(plotName));
            if (talhao) {
                items.push({
                    talhao_nome: talhao.name,
                    variedade: talhao.variedade || '',
                    area_ha: talhao.area || 0,
                    quantidade: 0
                });
            }
        });
    }

    return items;
};

const drawMapPage = (doc, geojsonData, farmCode, osData, osId, logoBase64) => {
    doc.addPage();
    const startY = drawPageHeader(doc, 'Mapa da O.S.', logoBase64);

    const pageTitle = `Mapa de Aplicação - O.S. ${safeString(osData.os_numero || osData.sequentialId || osId)}`;
    doc.font('Helvetica-Bold').fontSize(11).text(pageTitle, doc.page.margins.left, startY, {
        width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
        align: 'center'
    });

    const mapAreaX = doc.page.margins.left;
    const mapAreaY = startY + 20;
    const mapAreaWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const mapAreaHeight = doc.page.height - doc.page.margins.bottom - FOOTER_RESERVED - mapAreaY;

    doc.rect(mapAreaX, mapAreaY, mapAreaWidth, mapAreaHeight).stroke();

    const farmFeatures = (geojsonData.features || []).filter((feature) => {
        if (!feature.properties) return false;
        const propKeys = Object.keys(feature.properties);
        const codeKey = propKeys.find((key) => key.toLowerCase() === 'fundo_agr');
        if (!codeKey) return false;
        const featureFarmCode = feature.properties[codeKey];
        return featureFarmCode && parseInt(featureFarmCode, 10) === parseInt(farmCode, 10);
    });

    if (farmFeatures.length === 0) {
        doc.font('Helvetica').fontSize(9).text('Geometria da fazenda não encontrada no shapefile.', mapAreaX + 4, mapAreaY + 4);
        return;
    }

    const allCoords = farmFeatures.flatMap((feature) => {
        if (feature.geometry.type === 'Polygon') return feature.geometry.coordinates[0];
        return feature.geometry.coordinates.flatMap((polygon) => polygon[0]);
    });

    const bbox = {
        minX: Math.min(...allCoords.map((coord) => coord[0])),
        maxX: Math.max(...allCoords.map((coord) => coord[0])),
        minY: Math.min(...allCoords.map((coord) => coord[1])),
        maxY: Math.max(...allCoords.map((coord) => coord[1]))
    };

    const drawablePadding = 8;
    const drawableWidth = mapAreaWidth - (drawablePadding * 2);
    const drawableHeight = mapAreaHeight - (drawablePadding * 2);
    const sourceWidth = Math.max(1, bbox.maxX - bbox.minX);
    const sourceHeight = Math.max(1, bbox.maxY - bbox.minY);

    const scale = Math.min(drawableWidth / sourceWidth, drawableHeight / sourceHeight);
    const scaledWidth = sourceWidth * scale;
    const scaledHeight = sourceHeight * scale;
    const offsetX = mapAreaX + drawablePadding + (drawableWidth - scaledWidth) / 2;
    const offsetY = mapAreaY + drawablePadding + (drawableHeight - scaledHeight) / 2;

    const transformCoord = (coord) => [
        (coord[0] - bbox.minX) * scale + offsetX,
        (bbox.maxY - coord[1]) * scale + offsetY
    ];

    const selectedTalhoes = new Set((osData.itens || osData.items || []).map((item) => String(item.talhao_nome || item.talhao || '').toUpperCase()));
    if (Array.isArray(osData.selectedPlots)) {
        osData.selectedPlots.forEach((plot) => selectedTalhoes.add(String(plot).toUpperCase()));
    }

    const labelsToDraw = [];

    farmFeatures.forEach((feature) => {
        const talhaoNome = safeString(findShapefileProp(feature.properties, ['CD_TALHAO', 'COD_TALHAO', 'TALHAO']), 'N/A');
        const isSelected = selectedTalhoes.has(talhaoNome.toUpperCase());
        const polygons = feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates;

        polygons.forEach((polygon) => {
            const path = polygon[0];
            if (!path || path.length === 0) return;

            const firstPoint = transformCoord(path[0]);
            doc.moveTo(firstPoint[0], firstPoint[1]);
            for (let i = 1; i < path.length; i++) {
                const point = transformCoord(path[i]);
                doc.lineTo(point[0], point[1]);
            }
            doc.fillAndStroke(isSelected ? '#4caf50' : '#e0e0e0', isSelected ? '#2e7d32' : '#9e9e9e');
        });

        let minX = Infinity;
        let maxX = -Infinity;
        let minY = Infinity;
        let maxY = -Infinity;

        polygons.forEach((polygon) => {
            const outerRing = polygon[0] || [];
            outerRing.forEach((coord) => {
                const [x, y] = transformCoord(coord);
                minX = Math.min(minX, x);
                maxX = Math.max(maxX, x);
                minY = Math.min(minY, y);
                maxY = Math.max(maxY, y);
            });
        });

        if (Number.isFinite(minX) && Number.isFinite(minY)) {
            labelsToDraw.push({
                text: talhaoNome,
                x: (minX + maxX) / 2,
                y: (minY + maxY) / 2
            });
        }
    });

    labelsToDraw.forEach((label) => {
        doc.font('Helvetica').fontSize(8);
        const textWidth = doc.widthOfString(label.text) + 4;
        const textHeight = doc.currentLineHeight() + 2;

        doc.rect(label.x - (textWidth / 2), label.y - (textHeight / 2), textWidth, textHeight).fill('#ffffff');
        doc.fillColor('#000000').text(label.text, label.x - (textWidth / 2), label.y - (textHeight / 2) + 1, {
            width: textWidth,
            align: 'center',
            lineBreak: false
        });
    });
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

        const doc = setupDoc({ size: 'A4', layout: 'portrait', margin: PAGE_MARGIN, bufferPages: true });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="OS_${osId}.pdf"`);
        doc.pipe(res);

        const farmDocument = await db.collection('fazendas').doc(osData.fazenda_id || osData.farmId).get();
        const farmData = farmDocument.exists ? farmDocument.data() : null;
        const farmCode = farmData ? farmData.code : 'N/A';
        const farmName = osData.fazenda_nome || osData.farmName || (farmData ? farmData.name : 'N/A');

        const [geojsonData, logoBase64] = await Promise.all([
            getShapefileData(db, companyId),
            getLogoBase64(db, companyId)
        ]);

        const drawMainHeader = () => drawPageHeader(doc, 'OS - Ordem de Serviço / AGRICOLA', logoBase64);
        doc.y = drawMainHeader();

        const pageLeft = doc.page.margins.left;
        const pageRight = doc.page.width - doc.page.margins.right;
        const pageWidth = pageRight - pageLeft;

        const infoBoxY = doc.y;
        const infoBoxHeight = 88;
        const infoColGap = 14;
        const leftColX = pageLeft + 8;
        const leftColWidth = (pageWidth - infoColGap - 16) * 0.5;
        const rightColX = leftColX + leftColWidth + infoColGap;
        const rightColWidth = pageRight - 8 - rightColX;

        doc.rect(pageLeft, infoBoxY, pageWidth, infoBoxHeight).stroke();

        drawLabeledValue(doc, 'Matrícula Encarregado', osData.responsavel_matricula || osData.responsibleMatricula, leftColX, infoBoxY + 6, leftColWidth);
        drawLabeledValue(doc, 'Usuário Abertura', osData.usuario_abertura_nome || osData.generatedBy || generatedBy, leftColX, infoBoxY + 30, leftColWidth);
        drawLabeledValue(doc, 'Produtor', `${safeString(farmCode)} - ${safeString(farmName)}`, leftColX, infoBoxY + 54, leftColWidth);

        drawLabeledValue(doc, 'Nome', osData.responsavel_nome || osData.responsible, rightColX, infoBoxY + 6, rightColWidth);
        drawLabeledValue(doc, 'Data', parseDate(osData), rightColX, infoBoxY + 24, rightColWidth * 0.5 - 4);
        drawLabeledValue(doc, 'OS', osData.os_numero || osData.sequentialId || osId, rightColX + (rightColWidth * 0.5), infoBoxY + 24, rightColWidth * 0.5 - 4);
        drawLabeledValue(doc, 'Etapa', osData.tipo_servico_desc || osData.serviceType, rightColX, infoBoxY + 42, rightColWidth);

        const safra = osData.safra || '';
        const ciclo = osData.ciclo || '';
        const safraCiclo = (safra && ciclo) ? `${safra} - ${ciclo}` : (osData.safraCiclo || 'N/A');
        drawLabeledValue(doc, 'Safra/Ciclo', safraCiclo, rightColX, infoBoxY + 60, rightColWidth);

        doc.y = infoBoxY + infoBoxHeight + 8;

        const obsBoxHeight = 72;
        const obsTitleY = doc.y + 4;
        doc.rect(pageLeft, doc.y, pageWidth, obsBoxHeight).stroke();
        doc.font('Helvetica-Bold').fontSize(10).text('Obs.:', pageLeft, obsTitleY, { width: pageWidth, align: 'center' });

        doc.font('Helvetica').fontSize(9).text(safeString(osData.observacoes || osData.observations, ''), pageLeft + 6, obsTitleY + 16, {
            width: pageWidth - 12,
            height: obsBoxHeight - 22,
            align: 'left'
        });

        doc.y += obsBoxHeight + 8;

        const tableX = pageLeft;
        const tableWidth = pageWidth;

        const mainColumns = [
            { key: 'propriedade', header: 'Propriedade', width: tableWidth * 0.11 },
            { key: 'fundoAgr', header: 'Fundo Agr.', width: tableWidth * 0.18 },
            { key: 'talhao', header: 'Talhão', width: tableWidth * 0.10 },
            { key: 'variedade', header: 'Variedade', width: tableWidth * 0.14 },
            { key: 'area', header: 'Area', width: tableWidth * 0.09, align: 'right', headerAlign: 'right' },
            { key: 'areaRateio', header: 'Area Rateio', width: tableWidth * 0.12, align: 'right', headerAlign: 'right' },
            { key: 'operacao', header: 'Operação', width: tableWidth * 0.16, truncate: true },
            { key: 'quantidade', header: 'Quantidade', width: tableWidth * 0.10, align: 'right', headerAlign: 'right' }
        ];

        const items = buildItems(osData, farmData);
        let totalArea = 0;
        let totalAreaRateio = 0;

        const mainRows = items.map((item) => {
            const area = Number(item.area_ha || item.area || 0);
            const areaRateio = Number(item.area_rateio || area);
            totalArea += area;
            totalAreaRateio += areaRateio;

            return {
                propriedade: safeString(farmCode),
                fundoAgr: safeString(farmName),
                talhao: safeString(item.talhao_nome || item.talhao),
                variedade: safeString(item.variedade, ''),
                area: formatNumber(area),
                areaRateio: formatNumber(areaRateio),
                operacao: safeString(osData.operacao_nome || osData.operationName || osData.tipo_servico_desc, ''),
                quantidade: formatNumber(Number(item.quantidade || item.quantity || 0))
            };
        });

        mainRows.push({
            propriedade: '',
            fundoAgr: '',
            talhao: '',
            variedade: 'Total',
            area: formatNumber(totalArea),
            areaRateio: formatNumber(totalAreaRateio),
            operacao: '',
            quantidade: ''
        });

        doc.y = drawTableHeader(doc, tableX, doc.y, mainColumns);
        mainRows.forEach((row, index) => {
            const isNewPage = ensurePageSpace(doc, 16, drawMainHeader);
            if (isNewPage) {
                doc.y = drawTableHeader(doc, tableX, doc.y, mainColumns);
            }
            doc.y = drawTableRow(doc, tableX, doc.y, mainColumns, row, { bold: index === mainRows.length - 1, rowHeight: 15 });
        });

        doc.y += 8;

        const drawProductSectionTitle = () => {
            doc.font('Helvetica-Bold').fontSize(10).text('REQUISIÇÃO DE PRODUTOS', pageLeft, doc.y, {
                width: pageWidth,
                align: 'center'
            });
            doc.y += 4;
        };

        if (ensurePageSpace(doc, 24, drawMainHeader)) {
            // doc.y already reset
        }
        drawProductSectionTitle();

        const productColumns = [
            { key: 'operacao', header: 'Oper.', width: tableWidth * 0.14 },
            { key: 'produto', header: 'Produto', width: tableWidth * 0.12 },
            { key: 'descricao', header: 'Descrição', width: tableWidth * 0.34, truncate: true },
            { key: 'und', header: 'Und.', width: tableWidth * 0.10, align: 'center', headerAlign: 'center' },
            { key: 'qtdeHa', header: 'Qtde HA', width: tableWidth * 0.14, align: 'right', headerAlign: 'right' },
            { key: 'qtdeTotal', header: 'Qtde Total', width: tableWidth * 0.16, align: 'right', headerAlign: 'right' }
        ];

        const products = osData.produtos || osData.products || [];
        let totalProdQty = 0;
        const productRows = products.map((product) => {
            const dosage = Number(product.dosagem_por_ha || product.dosage || 0);
            const totalQty = Number(product.qtde_total || product.quantity || (dosage * totalArea));
            totalProdQty += totalQty;

            return {
                operacao: safeString(osData.operacao_nome || osData.operationId, ''),
                produto: safeString(product.codigo_externo || product.produto_id || product.id, ''),
                descricao: safeString(product.produto_nome || product.name, ''),
                und: safeString(product.unidade || product.unit, ''),
                qtdeHa: formatNumber(dosage),
                qtdeTotal: formatNumber(totalQty)
            };
        });

        productRows.push({
            operacao: '',
            produto: '',
            descricao: '',
            und: 'Total',
            qtdeHa: '',
            qtdeTotal: formatNumber(totalProdQty)
        });

        doc.y = drawTableHeader(doc, tableX, doc.y, productColumns);
        productRows.forEach((row, index) => {
            const isNewPage = ensurePageSpace(doc, 16, drawMainHeader);
            if (isNewPage) {
                drawProductSectionTitle();
                doc.y = drawTableHeader(doc, tableX, doc.y, productColumns);
            }
            doc.y = drawTableRow(doc, tableX, doc.y, productColumns, row, { bold: index === productRows.length - 1, rowHeight: 15 });
        });

        const signatureY = doc.page.height - doc.page.margins.bottom - FOOTER_RESERVED - 34;
        if (doc.y + 28 > signatureY) {
            doc.addPage();
            doc.y = drawMainHeader();
        }

        const lineY = doc.page.height - doc.page.margins.bottom - FOOTER_RESERVED - 24;
        const signWidth = (pageWidth - 20) / 2;

        doc.moveTo(pageLeft, lineY).lineTo(pageLeft + signWidth, lineY).stroke();
        doc.moveTo(pageLeft + signWidth + 20, lineY).lineTo(pageRight, lineY).stroke();

        doc.font('Helvetica-Bold').fontSize(9).text('TÉCNICO RESPONSÁVEL', pageLeft, lineY + 4, {
            width: signWidth,
            align: 'center'
        });
        doc.text('PRODUTOR', pageLeft + signWidth + 20, lineY + 4, {
            width: signWidth,
            align: 'center'
        });

        if (geojsonData) {
            drawMapPage(doc, geojsonData, farmCode, osData, osId, logoBase64);
        }

        drawFooterOnAllPages(doc, safeString(osData.usuario_abertura_nome || osData.generatedBy || generatedBy || 'Sistema'), new Date().toLocaleString('pt-BR'));
        doc.end();
    } catch (error) {
        console.error('Erro ao gerar PDF da O.S.:', error);
        if (!res.headersSent) {
            res.status(500).json({ message: `Erro ao gerar relatório: ${error.message}` });
        }
    }
};

module.exports = {
    generateOsPdf
};
