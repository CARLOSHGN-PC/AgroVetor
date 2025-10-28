const { db } = require('./firebase');

const formatNumber = (num) => {
    if (typeof num !== 'number' || isNaN(num)) {
        return num;
    }
    return parseFloat(num.toFixed(2)).toLocaleString('pt-BR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
};

const generatePdfHeader = async (doc, title, companyId) => {
    try {
        let logoBase64 = null;
        if (companyId) {
            const configDoc = await db.collection('config').doc(companyId).get();
            if (configDoc.exists && configDoc.data().logoBase64) {
                logoBase64 = configDoc.data().logoBase64;
            }
        }

        if (logoBase64) {
            doc.image(logoBase64, doc.page.margins.left, 15, { width: 40 });
        }

    } catch (error) {
        console.error("Não foi possível carregar o logotipo:", error.message);
    }

    doc.fontSize(18).font('Helvetica-Bold').text(title, { align: 'center' });
    doc.moveDown(2);
    return doc.y;
};

const generatePdfFooter = (doc, generatedBy = 'N/A') => {
    const pageCount = doc.bufferedPageRange().count;
    for (let i = 0; i < pageCount; i++) {
        doc.switchToPage(i);

        const footerY = doc.page.height - doc.page.margins.bottom + 10;
        doc.fontSize(8).font('Helvetica')
           .text(`Gerado por: ${generatedBy} em: ${new Date().toLocaleString('pt-BR')}`,
                 doc.page.margins.left,
                 footerY,
                 { align: 'left', lineBreak: false });
    }
};

const drawRow = (doc, rowData, y, isHeader = false, isFooter = false, customWidths, textPadding = 5, rowHeight = 18, columnHeadersConfig = [], isClosed = false) => {
    const startX = doc.page.margins.left;
    const fontSize = 8;

    if (isHeader || isFooter) {
        doc.font('Helvetica-Bold').fontSize(fontSize);
        doc.rect(startX, y, doc.page.width - doc.page.margins.left - doc.page.margins.right, rowHeight).fillAndStroke('#E8E8E8', '#E8E8E8');
        doc.fillColor('black');
    } else {
        doc.font('Helvetica').fontSize(fontSize);
        if (isClosed) {
            doc.rect(startX, y, doc.page.width - doc.page.margins.left - doc.page.margins.right, rowHeight).fillAndStroke('#f0f0f0', '#f0f0f0');
            doc.fillColor('#999');
        } else {
            doc.fillColor('black');
        }
    }

    let currentX = startX;
    let maxRowHeight = rowHeight;

    rowData.forEach((cell, i) => {
        let columnId = null;
        if (Array.isArray(columnHeadersConfig) && i < columnHeadersConfig.length && columnHeadersConfig[i]) {
            columnId = columnHeadersConfig[i].id;
        }

        const cellWidth = customWidths[i] - (textPadding * 2);
        const textOptions = { width: cellWidth, align: 'left', continued: false };

        if (['talhoes', 'variedade'].includes(columnId)) {
            textOptions.lineBreak = true;
            textOptions.lineGap = 2;
        } else {
            textOptions.lineBreak = false;
        }

        const textHeight = doc.heightOfString(String(cell), textOptions);
        maxRowHeight = Math.max(maxRowHeight, textHeight + textPadding * 2);

        doc.text(String(cell), currentX + textPadding, y + textPadding, textOptions);
        currentX += customWidths[i];
    });
    return y + maxRowHeight;
};

const checkPageBreak = async (doc, y, title, neededSpace = 40, companyId) => {
    if (y > doc.page.height - doc.page.margins.bottom - neededSpace) {
        doc.addPage();
        return await generatePdfHeader(doc, title, companyId);
    }
    return y;
};

module.exports = {
    formatNumber,
    generatePdfHeader,
    generatePdfFooter,
    drawRow,
    checkPageBreak,
};
