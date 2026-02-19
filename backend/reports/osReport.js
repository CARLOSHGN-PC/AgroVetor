const { setupDoc, getLogoBase64, formatNumber } = require('../utils/pdfGenerator');
const { getShapefileData, findShapefileProp } = require('../utils/geoUtils');

const MARGIN = 28;
const FOOTER_SPACE = 18;
const CONTENT_WIDTH = 595.28 - (MARGIN * 2);

const findOsDocument = async (db, osId) => {
    const collections = ['serviceOrders', 'ordens_servico'];

    for (const collectionName of collections) {
        const osDoc = await db.collection(collectionName).doc(osId).get();
        if (osDoc.exists) return osDoc;
    }

    return null;
};

const normalizeDateTime = (osData) => {
    if (osData?.data && /^\d{4}-\d{2}-\d{2}$/.test(osData.data)) {
        const [y, m, d] = osData.data.split('-');
        return `${d}/${m}/${y}`;
    }

    const source = osData?.createdAt?.toDate ? osData.createdAt.toDate() : (osData?.createdAt ? new Date(osData.createdAt) : new Date());
    return source.toLocaleDateString('pt-BR');
};

const getGeneratedAt = () => new Date().toLocaleString('pt-BR');

const truncateText = (doc, text, width) => {
    const value = String(text ?? '');
    if (doc.widthOfString(value) <= width) return value;

    let base = value;
    while (base.length > 0 && doc.widthOfString(`${base}...`) > width) {
        base = base.slice(0, -1);
    }

    return `${base}...`;
};

const drawReportHeader = (doc, logoBase64) => {
    const topY = MARGIN;

    if (logoBase64) {
        try {
            if ((typeof logoBase64 === 'string' && logoBase64.startsWith('data:image')) || Buffer.isBuffer(logoBase64)) {
                doc.image(logoBase64, MARGIN, topY - 4, { width: 42, height: 42 });
            }
        } catch (error) {
            console.warn('Falha ao renderizar logo:', error.message);
        }
    }

    doc.font('Helvetica-Bold').fontSize(15).text('OS - Ordem de Serviço / AGRICOLA', MARGIN, topY + 5, {
        width: doc.page.width - (MARGIN * 2),
        align: 'center'
    });

    return topY + 52;
};

const drawFirstPage = (doc, osData, baseData, logoBase64) => {
    const yStart = drawReportHeader(doc, logoBase64);
    const pageBottom = doc.page.height - MARGIN - FOOTER_SPACE;

    const dataBoxY = yStart;
    const dataBoxH = 92;
    const leftX = MARGIN;
    const fullW = doc.page.width - (MARGIN * 2);
    const midX = leftX + (fullW * 0.48);

    doc.rect(leftX, dataBoxY, fullW, dataBoxH).stroke();
    doc.moveTo(midX, dataBoxY).lineTo(midX, dataBoxY + dataBoxH).stroke();

    doc.font('Helvetica-Bold').fontSize(9);

    const leftRows = [
        ['Matrícula Encarregado:', baseData.matricula],
        ['Usuário Abertura:', baseData.usuarioAbertura],
        ['Produtor:', `${baseData.farmCode}   ${baseData.farmName}`]
    ];

    const rightRows = [
        ['Nome:', baseData.responsavelNome],
        ['Data:', baseData.dataLabel],
        ['OS:', baseData.osNumero],
        ['Etapa:', baseData.etapa],
        ['Safra/Ciclo:', baseData.safraCiclo]
    ];

    let y = dataBoxY + 8;
    leftRows.forEach(([label, value]) => {
        doc.font('Helvetica-Bold').text(label, leftX + 8, y, { lineBreak: false });
        doc.font('Helvetica').text(value || 'N/A', leftX + 118, y, { width: (midX - leftX) - 126, lineBreak: false });
        y += 22;
    });

    y = dataBoxY + 6;
    rightRows.forEach(([label, value]) => {
        doc.font('Helvetica-Bold').text(label, midX + 8, y, { lineBreak: false });
        doc.font('Helvetica').text(value || 'N/A', midX + 72, y, { width: (leftX + fullW - midX) - 80, lineBreak: false });
        y += 17;
    });

    const obsY = dataBoxY + dataBoxH + 10;
    const signaturesTop = pageBottom - 56;
    const obsH = Math.max(100, signaturesTop - obsY - 10);

    doc.rect(leftX, obsY, fullW, obsH).stroke();
    doc.font('Helvetica-Bold').fontSize(9).text('Obs.:', leftX + 6, obsY + 4, { lineBreak: false });
    doc.font('Helvetica').fontSize(9).text(baseData.observacoes || '', leftX + 6, obsY + 18, {
        width: fullW - 12,
        height: obsH - 22,
        ellipsis: true
    });

    const leftSignX1 = leftX + 12;
    const leftSignX2 = leftX + (fullW / 2) - 30;
    const rightSignX1 = leftX + (fullW / 2) + 30;
    const rightSignX2 = leftX + fullW - 12;
    const lineY = signaturesTop + 20;

    doc.moveTo(leftSignX1, lineY).lineTo(leftSignX2, lineY).stroke();
    doc.moveTo(rightSignX1, lineY).lineTo(rightSignX2, lineY).stroke();

    doc.font('Helvetica-Bold').fontSize(10);
    doc.text('TÉCNICO RESPONSÁVEL', leftSignX1, lineY + 6, { width: leftSignX2 - leftSignX1, align: 'center' });
    doc.text('PRODUTOR', rightSignX1, lineY + 6, { width: rightSignX2 - rightSignX1, align: 'center' });
};

const drawTalhoesHeader = (doc, y, cols) => {
    const rowH = 14;
    let x = MARGIN;
    doc.rect(MARGIN, y, cols.reduce((s, c) => s + c.width, 0), rowH).stroke();
    doc.font('Helvetica-Bold').fontSize(9);
    cols.forEach((col) => {
        doc.moveTo(x + col.width, y).lineTo(x + col.width, y + rowH).stroke();
        doc.text(col.label, x + 2, y + 3, { width: col.width - 4, align: col.align || 'left', lineBreak: false });
        x += col.width;
    });
    return y + rowH;
};

const drawGridRows = (doc, rows, cols, options) => {
    const rowH = options.rowH || 14;
    let y = options.startY;
    const maxY = options.maxY;
    let index = options.startIndex || 0;

    doc.font('Helvetica').fontSize(8.5);

    while (index < rows.length) {
        if (y + rowH > maxY) break;

        const row = rows[index];
        let x = MARGIN;
        doc.rect(MARGIN, y, cols.reduce((s, c) => s + c.width, 0), rowH).stroke();

        cols.forEach((col, i) => {
            const raw = row[i] ?? '';
            const text = truncateText(doc, raw, col.width - 4);
            doc.moveTo(x + col.width, y).lineTo(x + col.width, y + rowH).stroke();
            doc.text(text, x + 2, y + 3, {
                width: col.width - 4,
                align: col.align || 'left',
                lineBreak: false
            });
            x += col.width;
        });

        y += rowH;
        index += 1;
    }

    return { y, index };
};

const drawTalhoesPages = (doc, tableRows, totals) => {
    const colDefs = [
        { label: 'Propriedade', width: 58 },
        { label: 'Fundo Agr.', width: 133 },
        { label: 'Talhão', width: 48 },
        { label: 'Variedade', width: 74 },
        { label: 'Area', width: 45, align: 'right' },
        { label: 'Area Rateio', width: 58, align: 'right' },
        { label: 'Operação', width: 160 },
        { label: 'Quantidade', width: 55, align: 'right' }
    ];

    const tableW = colDefs.reduce((s, c) => s + c.width, 0);
    const obsW = doc.page.width - MARGIN - (MARGIN + tableW);
    let currentIndex = 0;

    while (currentIndex < tableRows.length) {
        doc.addPage({ size: 'A4', layout: 'portrait', margin: MARGIN });

        const topY = MARGIN + 8;
        const headerEndY = drawTalhoesHeader(doc, topY, colDefs);
        const bodyTopY = headerEndY;
        const bodyMaxY = doc.page.height - MARGIN - FOOTER_SPACE - 170;
        const result = drawGridRows(doc, tableRows, colDefs, { startY: bodyTopY, maxY: bodyMaxY, startIndex: currentIndex, rowH: 14 });

        const bodyBottom = Math.max(result.y, bodyTopY + 240);
        doc.rect(MARGIN + tableW, topY, obsW, bodyBottom - topY).stroke();
        doc.font('Helvetica-Bold').fontSize(9).text('Obs.:', MARGIN + tableW + 6, topY + 8, { lineBreak: false });

        currentIndex = result.index;

        if (currentIndex >= tableRows.length) {
            doc.font('Helvetica-Bold').fontSize(9);
            doc.text('Total', MARGIN + 300, result.y + 6, { width: 40 });
            doc.text(formatNumber(totals.totalArea), MARGIN + 340, result.y + 6, { width: 45, align: 'right' });
            doc.text(formatNumber(totals.totalAreaRateio), MARGIN + 390, result.y + 6, { width: 58, align: 'right' });
        }
    }
};

const drawProductsBlock = (doc, productRows, totalProdQty) => {
    const colDefs = [
        { label: 'Oper.', width: 65 },
        { label: 'Produto', width: 80 },
        { label: 'Descrição', width: 240 },
        { label: 'Und.', width: 50 },
        { label: 'Qtde HA', width: 70, align: 'right' },
        { label: 'Qtde Total', width: 72, align: 'right' }
    ];

    let index = 0;

    while (index < productRows.length || index === 0) {
        doc.addPage({ size: 'A4', layout: 'portrait', margin: MARGIN });

        const titleY = MARGIN + 6;
        doc.rect(MARGIN, titleY, CONTENT_WIDTH, 24).stroke();
        doc.font('Helvetica-Bold').fontSize(12).text('REQUISIÇÃO DE PRODUTOS', MARGIN, titleY + 6, { width: CONTENT_WIDTH, align: 'center' });

        const headerY = titleY + 24;
        const headerEnd = drawTalhoesHeader(doc, headerY, colDefs);
        const result = drawGridRows(doc, productRows, colDefs, {
            startY: headerEnd,
            maxY: doc.page.height - MARGIN - FOOTER_SPACE - 80,
            startIndex: index,
            rowH: 14
        });

        index = result.index;

        if (index >= productRows.length) {
            const totalY = result.y + 6;
            doc.font('Helvetica-Bold').fontSize(9);
            doc.text('Total .:', MARGIN + 440, totalY, { width: 72, align: 'right' });
            doc.text(formatNumber(totalProdQty), MARGIN + 512, totalY, { width: 72, align: 'right' });

            const signY = doc.page.height - MARGIN - FOOTER_SPACE - 36;
            doc.moveTo(MARGIN + 12, signY).lineTo(MARGIN + 350, signY).stroke();
            doc.moveTo(MARGIN + 400, signY).lineTo(doc.page.width - MARGIN - 12, signY).stroke();
            doc.text('TÉCNICO RESPONSÁVEL', MARGIN + 12, signY + 6, { width: 338, align: 'center' });
            doc.text('PRODUTOR', MARGIN + 400, signY + 6, { width: doc.page.width - MARGIN - 412, align: 'center' });
        }
    }
};

const drawMapPage = async (doc, geojsonData, osData, farmCode) => {
    if (!geojsonData) return;

    doc.addPage({ size: 'A4', layout: 'landscape', margin: MARGIN });

    const m = MARGIN;
    const pageW = doc.page.width;
    const pageH = doc.page.height;
    const contentW = pageW - (2 * m);
    const contentH = pageH - (2 * m);
    const footerH = FOOTER_SPACE;
    const mapX = m;
    const mapY = m;
    const mapW = contentW;
    const mapH = contentH - footerH;


    const imageCandidate = osData.mapBuffer || osData.mapBase64 || osData.mapaBase64 || osData.mapImage || osData.mapaImagem;
    if (imageCandidate) {
        const mapBuffer = Buffer.isBuffer(imageCandidate)
            ? imageCandidate
            : (typeof imageCandidate === 'string' && imageCandidate.startsWith('data:image')
                ? Buffer.from(imageCandidate.split(',')[1], 'base64')
                : null);

        if (mapBuffer) {
            doc.image(mapBuffer, mapX, mapY, {
                fit: [mapW, mapH],
                align: 'center',
                valign: 'center'
            });
            return;
        }
    }

    const farmFeatures = geojsonData.features.filter((f) => {
        if (!f.properties) return false;
        const propKeys = Object.keys(f.properties);
        const codeKey = propKeys.find((k) => k.toLowerCase() === 'fundo_agr');
        if (!codeKey) return false;
        const featureFarmCode = f.properties[codeKey];
        return featureFarmCode && parseInt(featureFarmCode, 10) === parseInt(farmCode, 10);
    });

    doc.rect(mapX, mapY, mapW, mapH).stroke();

    if (!farmFeatures.length) {
        doc.fontSize(10).font('Helvetica').text('Geometria da fazenda não encontrada no shapefile.', mapX + 10, mapY + 10);
        return;
    }

    const allCoords = farmFeatures.flatMap((f) => (
        f.geometry.type === 'Polygon'
            ? f.geometry.coordinates[0]
            : f.geometry.coordinates.flatMap((p) => p[0])
    ));

    const bbox = {
        minX: Math.min(...allCoords.map((c) => c[0])),
        maxX: Math.max(...allCoords.map((c) => c[0])),
        minY: Math.min(...allCoords.map((c) => c[1])),
        maxY: Math.max(...allCoords.map((c) => c[1]))
    };

    const scaleX = mapW / Math.max(bbox.maxX - bbox.minX, 1);
    const scaleY = mapH / Math.max(bbox.maxY - bbox.minY, 1);
    const scale = Math.min(scaleX, scaleY) * 0.96;

    const usedW = (bbox.maxX - bbox.minX) * scale;
    const usedH = (bbox.maxY - bbox.minY) * scale;
    const offsetX = mapX + ((mapW - usedW) / 2);
    const offsetY = mapY + ((mapH - usedH) / 2);

    const transformCoord = (coord) => [
        ((coord[0] - bbox.minX) * scale) + offsetX,
        ((bbox.maxY - coord[1]) * scale) + offsetY
    ];

    const items = osData.itens || osData.items || [];

    farmFeatures.forEach((feature) => {
        const talhaoNome = findShapefileProp(feature.properties, ['CD_TALHAO', 'COD_TALHAO', 'TALHAO']) || 'N/A';
        const isSelected = Array.isArray(osData.selectedPlots)
            ? osData.selectedPlots.some((p) => String(p).toUpperCase() === String(talhaoNome).toUpperCase())
            : items.some((item) => String(item.talhao_nome || item.talhao).toUpperCase() === String(talhaoNome).toUpperCase());

        const fillColor = isSelected ? '#a5d6a7' : '#eceff1';
        const strokeColor = isSelected ? '#2e7d32' : '#78909c';
        const polygons = feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates;

        polygons.forEach((polygon) => {
            const path = polygon[0];
            if (!path || !path.length) return;
            const [sx, sy] = transformCoord(path[0]);
            doc.moveTo(sx, sy);
            for (let i = 1; i < path.length; i += 1) {
                const [px, py] = transformCoord(path[i]);
                doc.lineTo(px, py);
            }
            doc.fillColor(fillColor).strokeColor(strokeColor).lineWidth(0.7).fillAndStroke();
        });
    });
};

const applyFooters = (doc, generatedBy, generatedAt) => {
    const range = doc.bufferedPageRange();
    const total = range.count;

    for (let i = 0; i < total; i += 1) {
        doc.switchToPage(i);

        const m = doc.page.margins.left;
        const pageW = doc.page.width;
        const pageH = doc.page.height;
        const contentW = pageW - (2 * m);

        doc.font('Helvetica').fontSize(8).fillColor('black').text(
            `Gerado por: ${generatedBy} em: ${generatedAt} - Página ${i + 1} de ${total}`,
            m,
            pageH - m - 10,
            { width: contentW, align: 'left', lineBreak: false }
        );
    }
};

const generateOsPdf = async (req, res, db) => {
    try {
        const osId = req.query.osId || req.params.osId;
        const { companyId, generatedBy } = req.query;

        if (!osId || !companyId) {
            return res.status(400).json({ message: 'osId e companyId são obrigatórios' });
        }

        const osDoc = await findOsDocument(db, osId);
        if (!osDoc) return res.status(404).json({ message: 'OS não encontrada' });

        const osData = osDoc.data();
        if (osData.companyId !== companyId) {
            return res.status(404).json({ message: 'OS não encontrada' });
        }

        const farmDocument = await db.collection('fazendas').doc(osData.fazenda_id || osData.farmId).get();
        const farmData = farmDocument.exists ? farmDocument.data() : null;
        const farmCode = farmData ? farmData.code : 'N/A';
        const farmName = osData.fazenda_nome || osData.farmName || (farmData ? farmData.name : 'N/A');

        const doc = setupDoc({ size: 'A4', layout: 'portrait', margin: MARGIN, bufferPages: true });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="OS_${osId}.pdf"`);
        doc.pipe(res);

        const generatedAt = getGeneratedAt();
        const generatedUser = osData.usuario_abertura_nome || osData.generatedBy || generatedBy || 'Sistema';
        const logoBase64 = await getLogoBase64(db, companyId);
        const geojsonData = await getShapefileData(db, companyId);

        const items = [...(osData.itens || osData.items || [])];
        if (items.length === 0 && Array.isArray(osData.selectedPlots) && farmData?.talhoes) {
            osData.selectedPlots.forEach((plotName) => {
                const talhao = farmData.talhoes.find((pt) => String(pt.name) === String(plotName));
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

        const operacao = osData.operacao_nome || osData.operationName || osData.tipo_servico_desc || '';
        const tableRows = [];
        let totalArea = 0;
        let totalAreaRateio = 0;

        items.forEach((item) => {
            const area = Number(item.area_ha || 0);
            const areaRateio = Number(item.area_rateio ?? item.area_ha ?? 0);
            const quantidade = Number(item.quantidade || 0);

            totalArea += area;
            totalAreaRateio += areaRateio;

            tableRows.push([
                String(farmCode),
                String(farmName),
                String(item.talhao_nome || item.talhao || 'N/A'),
                String(item.variedade || ''),
                formatNumber(area),
                formatNumber(areaRateio),
                String(operacao),
                formatNumber(quantidade)
            ]);
        });

        const products = osData.produtos || osData.products || [];
        const productRows = [];
        let totalProdQty = 0;

        products.forEach((prod) => {
            const dosage = Number(prod.dosagem_por_ha || prod.dosage || 0);
            const qtyTotal = Number(prod.qtde_total || prod.quantity || (dosage * totalArea));
            totalProdQty += qtyTotal;

            productRows.push([
                String(osData.operacao_nome || osData.operationId || 'N/A'),
                String(prod.codigo_externo || prod.produto_id || prod.id || 'N/A'),
                String(prod.produto_nome || prod.name || ''),
                String(prod.unidade || prod.unit || ''),
                formatNumber(dosage),
                formatNumber(qtyTotal)
            ]);
        });

        const safraCiclo = osData.safra && osData.ciclo
            ? `${osData.safra} - ${osData.ciclo}`
            : (osData.safraCiclo || 'N/A');

        drawFirstPage(doc, osData, {
            matricula: osData.responsavel_matricula || osData.responsibleMatricula || 'N/A',
            usuarioAbertura: osData.usuario_abertura_nome || osData.generatedBy || generatedBy || 'N/A',
            farmCode,
            farmName,
            responsavelNome: osData.responsavel_nome || osData.responsible || 'N/A',
            dataLabel: normalizeDateTime(osData),
            osNumero: osData.os_numero || osData.sequentialId || osId,
            etapa: osData.tipo_servico_desc || osData.serviceType || 'N/A',
            safraCiclo,
            observacoes: osData.observacoes || osData.observations || ''
        }, logoBase64);

        drawTalhoesPages(doc, tableRows, { totalArea, totalAreaRateio });
        drawProductsBlock(doc, productRows, totalProdQty);
        await drawMapPage(doc, geojsonData, osData, farmCode);
        applyFooters(doc, generatedUser, generatedAt);

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
