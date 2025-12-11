const PDFDocument = require('pdfkit');

// Helper to format numbers
const formatNumber = (num) => {
    if (typeof num !== 'number' || isNaN(num)) {
        return num;
    }
    return parseFloat(num.toFixed(2)).toLocaleString('pt-BR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
};

const setupDoc = (options = {}) => {
    const defaultOptions = { margin: 30, size: 'A4', layout: 'landscape', bufferPages: true };
    return new PDFDocument({ ...defaultOptions, ...options });
};

const getLogoBase64 = async (db, companyId) => {
    try {
        if (!companyId) return null;

        let logoBase64 = null;
        const configDoc = await db.collection('config').doc(companyId).get();
        if (configDoc.exists && configDoc.data().logoBase64) {
            logoBase64 = configDoc.data().logoBase64;
        }

        if (!logoBase64) {
            const oldestCompanyQuery = await db.collection('companies').orderBy('createdAt', 'asc').limit(1).get();
            if (!oldestCompanyQuery.empty) {
                const oldestCompanyId = oldestCompanyQuery.docs[0].id;
                const defaultConfigDoc = await db.collection('config').doc(oldestCompanyId).get();
                if (defaultConfigDoc.exists && defaultConfigDoc.data().logoBase64) {
                    logoBase64 = defaultConfigDoc.data().logoBase64;
                }
            }
        }
        return logoBase64;
    } catch (error) {
        console.error("Não foi possível carregar o logotipo:", error.message);
        return null;
    }
}

const generatePdfHeader = async (doc, title, logoBase64) => {
    if (logoBase64) {
        doc.image(logoBase64, doc.page.margins.left, 15, { width: 40 });
    }

    // Auto-adjust title font size to fit width
    let fontSize = 18;
    doc.font('Helvetica-Bold').fontSize(fontSize);
    const maxTitleWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right - 60; // -60 for logo space/padding

    while (doc.widthOfString(title) > maxTitleWidth && fontSize > 10) {
        fontSize--;
        doc.fontSize(fontSize);
    }

    doc.text(title, { align: 'center' });
    doc.moveDown(2);
    return doc.y;
};

const generatePdfFooter = (doc, generatedBy = 'N/A') => {
    const pageCount = doc.bufferedPageRange().count;
    for (let i = 0; i < pageCount; i++) {
        doc.switchToPage(i);

        const footerY = doc.page.height - doc.page.margins.bottom + 10;
        doc.fontSize(8).font('Helvetica')
           .text(`Gerado por: ${generatedBy} em: ${new Date().toLocaleString('pt-BR')} - Página ${i + 1} de ${pageCount}`,
                 doc.page.margins.left,
                 footerY,
                 { align: 'left', lineBreak: false });
    }
};

const calculateColumnWidths = (doc, headers, data, pageWidth, margins) => {
    const availableWidth = pageWidth - margins.left - margins.right;
    const padding = 10; // 5px padding on each side

    doc.fontSize(8).font('Helvetica'); // Base font for calculation

    // Initialize max widths with header widths
    const maxWidths = headers.map(header => doc.widthOfString(header) + padding);

    // Scan data for max content width
    data.forEach(row => {
        row.forEach((cell, i) => {
            if (i < maxWidths.length) {
                const cellText = String(cell);
                const width = doc.widthOfString(cellText) + padding;
                if (width > maxWidths[i]) {
                    maxWidths[i] = width;
                }
            }
        });
    });

    const totalRequiredWidth = maxWidths.reduce((sum, w) => sum + w, 0);

    if (totalRequiredWidth <= availableWidth) {
        // Distribute extra space proportionally
        const extraSpace = availableWidth - totalRequiredWidth;
        const distributedWidths = maxWidths.map(w => w + (extraSpace * (w / totalRequiredWidth)));
        return distributedWidths;
    } else {
        // Scale down proportionally
        const scaleFactor = availableWidth / totalRequiredWidth;
        return maxWidths.map(w => w * scaleFactor);
    }
};

const drawTable = async (doc, headers, data, title, logoBase64, startY) => {
    const margins = doc.page.margins;
    const pageWidth = doc.page.width;
    const columnWidths = calculateColumnWidths(doc, headers, data, pageWidth, margins);

    let currentY = startY;
    const rowHeight = 18;
    const textPadding = 5;

    const drawRowContent = (rowData, y, isHeader = false, isSummary = false) => {
        const startX = margins.left;

        // Background
        if (isHeader) {
            doc.font('Helvetica-Bold').fontSize(8);
            doc.rect(startX, y, pageWidth - margins.left - margins.right, rowHeight).fillAndStroke('#E8E8E8', '#E8E8E8');
            doc.fillColor('black');
        } else if (isSummary) {
            doc.font('Helvetica-Bold').fontSize(8);
            doc.rect(startX, y, pageWidth - margins.left - margins.right, rowHeight).fillAndStroke('#f0f0f0', '#f0f0f0');
            doc.fillColor('black');
        } else {
            doc.font('Helvetica').fontSize(8);
            doc.fillColor('black');
        }

        let currentX = startX;

        rowData.forEach((cell, i) => {
            if (i >= columnWidths.length) return;

            const colWidth = columnWidths[i];
            const maxTextWidth = colWidth - (textPadding * 2);
            let cellText = String(cell);

            // Text Scaling: Reduce font size if text is too wide
            let fontSize = 8;
            doc.fontSize(fontSize);
            if (doc.widthOfString(cellText) > maxTextWidth) {
                 while (doc.widthOfString(cellText) > maxTextWidth && fontSize > 5) {
                     fontSize -= 0.5;
                     doc.fontSize(fontSize);
                 }
            }

            // Align numbers to right, text to left (heuristic)
            const align = (typeof cell === 'number' || (typeof cell === 'string' && cell.match(/^[0-9,.]+$/))) ? 'center' : 'left';

            doc.text(cellText, currentX + textPadding, y + (rowHeight - doc.currentLineHeight()) / 2, {
                width: maxTextWidth,
                align: align,
                lineBreak: false // Enforce no line breaks
            });

            currentX += colWidth;
        });

        return y + rowHeight;
    };

    // Draw Header
    currentY = drawRowContent(headers, currentY, true);

    // Draw Data
    for (const row of data) {
        if (currentY > doc.page.height - margins.bottom - rowHeight) {
            doc.addPage();
            currentY = await generatePdfHeader(doc, title, logoBase64);
            currentY = drawRowContent(headers, currentY, true);
        }
        currentY = drawRowContent(row, currentY);
    }

    return currentY;
};

// Helper for drawing a single summary row
const drawSummaryRow = async (doc, rowData, currentY, columnWidths, title, logoBase64) => {
    const margins = doc.page.margins;
    const rowHeight = 18;
    const textPadding = 5;

    if (currentY > doc.page.height - margins.bottom - rowHeight) {
        doc.addPage();
        currentY = await generatePdfHeader(doc, title, logoBase64);
    }

    const startX = margins.left;
    doc.font('Helvetica-Bold').fontSize(8);
    doc.rect(startX, currentY, doc.page.width - margins.left - margins.right, rowHeight).fillAndStroke('#f0f0f0', '#f0f0f0');
    doc.fillColor('black');

    let currentX = startX;
    rowData.forEach((cell, i) => {
         if (i >= columnWidths.length) return;
         const colWidth = columnWidths[i];
         const maxTextWidth = colWidth - (textPadding * 2);
         let cellText = String(cell);

         const align = (typeof cell === 'number' || (typeof cell === 'string' && cell.match(/^[0-9,.]+$/))) ? 'center' : 'left';

         doc.text(cellText, currentX + textPadding, currentY + (rowHeight - doc.currentLineHeight()) / 2, {
             width: maxTextWidth,
             align: align,
             lineBreak: false
         });
         currentX += colWidth;
    });

    return currentY + rowHeight;
}


module.exports = {
    setupDoc,
    getLogoBase64,
    generatePdfHeader,
    generatePdfFooter,
    drawTable,
    formatNumber,
    calculateColumnWidths,
    drawSummaryRow
};
