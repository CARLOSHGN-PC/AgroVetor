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

const formatDate = (dateInput) => {
    if (!dateInput) return '';
    // Handle Firestore Timestamp
    if (dateInput && typeof dateInput.toDate === 'function') {
        dateInput = dateInput.toDate();
    }

    let date;
    if (dateInput instanceof Date) {
        date = dateInput;
    } else {
        // If string is YYYY-MM-DD:
        if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
             date = new Date(dateInput + 'T00:00:00'); // Local midnight
        } else {
             date = new Date(dateInput);
        }
    }

    if (isNaN(date.getTime())) return String(dateInput);

    return date.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        timeZone: 'UTC'
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
        try {
            if ((typeof logoBase64 === 'string' && logoBase64.startsWith('data:image')) || Buffer.isBuffer(logoBase64)) {
                doc.image(logoBase64, doc.page.margins.left, 15, { width: 40 });
            }
        } catch (e) {
            console.warn("Failed to render logo image:", e.message);
        }
    }

    let fontSize = 18;
    doc.font('Helvetica-Bold').fontSize(fontSize);
    const maxTitleWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right - 60;

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

const analyzeColumns = (doc, headers, data, pageWidth, margins) => {
    const availableWidth = pageWidth - margins.left - margins.right;
    const padding = 10;

    doc.fontSize(8).font('Helvetica');

    const maxWidths = headers.map(header => doc.widthOfString(header) + padding);
    const isNumericCol = headers.map(() => true); // Assume true, disprove if non-numeric found

    data.forEach(row => {
        row.forEach((cell, i) => {
            if (i < maxWidths.length) {
                const cellText = String(cell);
                const width = doc.widthOfString(cellText) + padding;
                if (width > maxWidths[i]) {
                    maxWidths[i] = width;
                }

                // Check for numeric content to determine column alignment
                // Allow empty strings to not disqualify numeric status
                if (cell !== '' && cell !== null && cell !== undefined) {
                    const isNum = (typeof cell === 'number' || (typeof cell === 'string' && /^[0-9,.]+([%])?$/.test(cell.trim())));
                    if (!isNum) {
                        isNumericCol[i] = false;
                    }
                }
            }
        });
    });

    // If a column is all empty, default to left (false) or keep true?
    // Keeping true centers it, which is fine.

    const totalRequiredWidth = maxWidths.reduce((sum, w) => sum + w, 0);
    let columnWidths;

    if (totalRequiredWidth <= availableWidth) {
        const extraSpace = availableWidth - totalRequiredWidth;
        // Distribute extra space proportionally
        columnWidths = maxWidths.map(w => w + (extraSpace * (w / totalRequiredWidth)));
    } else {
        const scaleFactor = availableWidth / totalRequiredWidth;
        columnWidths = maxWidths.map(w => w * scaleFactor);
    }

    return { columnWidths, isNumericCol };
};

// Backwards compatibility wrapper if needed, but we update usages
const calculateColumnWidths = (doc, headers, data, pageWidth, margins) => {
    return analyzeColumns(doc, headers, data, pageWidth, margins).columnWidths;
};

const drawTable = async (doc, headers, data, title, logoBase64, startY, customColumnWidths = null) => {
    const margins = doc.page.margins;
    const pageWidth = doc.page.width;

    // Analyze columns for widths and types
    // If customColumnWidths is provided, we still need isNumericCol.
    // Ideally customColumnWidths should come with types, but for now we re-scan for types if needed.
    // Optimization: Calculate once.

    const analysis = analyzeColumns(doc, headers, data, pageWidth, margins);
    const columnWidths = customColumnWidths || analysis.columnWidths;
    const isNumericCol = analysis.isNumericCol;

    let currentY = startY;
    const rowHeight = 18;
    const textPadding = 5;

    const drawRowContent = (rowData, y, isHeader = false, isSummary = false) => {
        const startX = margins.left;

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

            // Font Scaling
            let fontSize = 8;
            doc.fontSize(fontSize);
            if (doc.widthOfString(cellText) > maxTextWidth) {
                 while (doc.widthOfString(cellText) > maxTextWidth && fontSize > 5) {
                     fontSize -= 0.5;
                     doc.fontSize(fontSize);
                 }
            }

            // Alignment: Center if column is numeric, otherwise Left
            const align = isNumericCol[i] ? 'center' : 'left';

            doc.text(cellText, currentX + textPadding, y + (rowHeight - doc.currentLineHeight()) / 2, {
                width: maxTextWidth,
                align: align,
                lineBreak: false
            });

            currentX += colWidth;
        });

        return y + rowHeight;
    };

    currentY = drawRowContent(headers, currentY, true);

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

    // We iterate manually to handle merged cells for labels
    for (let i = 0; i < rowData.length; i++) {
        if (i >= columnWidths.length) break;

        let cell = rowData[i];
        let cellText = String(cell);

        // Skip rendering empty cells if we are processing them as part of a merge logic
        // But here we process cell by cell.
        // Logic: If current cell is empty, we just move X.
        // If current cell is Text (Label) -> Check if we can merge with preceding empty cells.

        const isNumber = (typeof cell === 'number' || (typeof cell === 'string' && /^[0-9,.]+([%])?$/.test(cell.trim())));

        // If cell is empty, just advance X. Unless we want to support "Next cell merges this".
        // Easier approach: If current cell is a Label (non-empty, non-number), check preceding empty cells.

        let drawX = currentX;
        let drawWidth = columnWidths[i];
        let align = isNumber ? 'center' : 'left';

        if (cellText && !isNumber) {
            // It's a label. Check left neighbors for emptiness.
            let mergeStartIndex = i;
            let extraWidth = 0;

            // Look back
            for (let j = i - 1; j >= 0; j--) {
                if (!rowData[j] || rowData[j] === '') {
                    extraWidth += columnWidths[j];
                    mergeStartIndex = j;
                } else {
                    break;
                }
            }

            if (extraWidth > 0) {
                // Adjust draw position to start from the first empty cell
                // We need to calculate X position of mergeStartIndex.
                // We can't easily get it from 'currentX' alone without re-summing.
                // So let's re-calculate X for mergeStartIndex.
                let tempX = startX;
                for(let k=0; k<mergeStartIndex; k++) tempX += columnWidths[k];

                drawX = tempX;
                drawWidth = extraWidth + columnWidths[i];
                align = 'right'; // Right align labels that span multiple columns to stick to the data
            }
        }

        if (cellText) {
            const maxTextWidth = drawWidth - (textPadding * 2);

            // NO FONT SHRINKING as requested
            // If it overflows, it might wrap or cut. But with merge logic, it likely fits.
            doc.fontSize(8);

            doc.text(cellText, drawX + textPadding, currentY + (rowHeight - doc.currentLineHeight()) / 2, {
                width: maxTextWidth,
                align: align,
                lineBreak: false,
                ellipsis: true // Use ellipsis if it absolutely fails to fit
            });
        }

        currentX += columnWidths[i];
    }

    return currentY + rowHeight;
}


module.exports = {
    setupDoc,
    getLogoBase64,
    generatePdfHeader,
    generatePdfFooter,
    drawTable,
    formatNumber,
    formatDate,
    calculateColumnWidths,
    drawSummaryRow,
    analyzeColumns // Export for external use if needed
};
