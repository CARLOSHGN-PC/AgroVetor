const { setupDoc, getLogoBase64, generatePdfFooter } = require('../utils/pdfGenerator');

async function generateOrdemServicoOficialPdf(req, res, db) {
    const { id } = req.params;
    const doc = setupDoc();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=ordem_servico_${id}.pdf`);
    doc.pipe(res);

    try {
        const osRef = db.collection('serviceOrders').doc(id);
        const snap = await osRef.get();
        if (!snap.exists) {
            res.status(404).json({ message: 'O.S. não encontrada.' });
            return;
        }
        const osData = snap.data();
        const logoBase64 = await getLogoBase64(db, osData.companyId);
        if (logoBase64) {
            try { doc.image(Buffer.from(logoBase64, 'base64'), 30, 20, { fit: [100, 60] }); } catch {}
        }

        doc.font('Helvetica-Bold').fontSize(15).text('OS - Ordem de Serviço / AGRICOLA', 150, 30);
        doc.font('Helvetica').fontSize(10);
        doc.text(`Data: ${new Date().toLocaleDateString('pt-BR')}`, 30, 95);
        doc.text(`Nº OS: ${osData.sequentialId || id}`, 200, 95);
        doc.text(`Etapa: ${osData.etapa || '-'}`, 360, 95);

        let y = 120;
        const row = (label, value, x = 30) => { doc.font('Helvetica-Bold').text(`${label}:`, x, y); doc.font('Helvetica').text(String(value || '-'), x + 95, y); y += 16; };
        row('Matrícula', osData.responsibleMatricula || '-');
        row('Nome', osData.responsible || '-');
        row('Produtor', osData.farmName || '-');
        row('Usuário abertura', osData.generatedBy || osData.createdBy || '-');
        row('Safra/Ciclo', osData.safraCiclo || '-');

        y += 8;
        doc.font('Helvetica-Bold').text('Talhões', 30, y); y += 14;
        doc.fontSize(9).font('Helvetica-Bold');
        doc.text('Fundo Agr.', 30, y); doc.text('Talhão', 110, y); doc.text('Variedade', 190, y); doc.text('Área', 300, y); doc.text('Operação', 360, y); doc.text('Quantidade', 470, y);
        y += 12;
        doc.font('Helvetica');
        (osData.selectedPlotItems || []).forEach(item => {
            if (y > 710) { doc.addPage(); y = 40; }
            doc.text(String(osData.farmCode || ''), 30, y);
            doc.text(String(item.talhaoNome || item.talhaoId || ''), 110, y);
            doc.text(String(item.variedade || ''), 190, y);
            doc.text(Number(item.area || 0).toFixed(2), 300, y);
            doc.text(String(osData.operacaoNome || ''), 360, y);
            doc.text(Number(item.area || 0).toFixed(2), 470, y);
            y += 12;
        });
        y += 8;
        doc.font('Helvetica-Bold').text(`Total área: ${Number(osData.totalArea || 0).toFixed(2)} ha`, 30, y);

        y += 24;
        doc.font('Helvetica-Bold').text('REQUISIÇÃO DE PRODUTOS', 30, y);
        y += 14;
        doc.fontSize(9).text('Oper.', 30, y).text('Produto', 80, y).text('Und.', 280, y).text('Qtde/HA', 330, y).text('Qtde Total', 420, y);
        y += 12;
        doc.font('Helvetica');
        (osData.produtos || []).forEach(item => {
            if (y > 740) { doc.addPage(); y = 40; }
            doc.text(String(osData.operacaoNome || ''), 30, y);
            doc.text(String(item.produto_nome || item.produto_id || ''), 80, y);
            doc.text(String(item.unidade || ''), 280, y);
            doc.text(Number(item.dosagem_por_ha || 0).toFixed(3), 330, y);
            doc.text(Number(item.qtde_total || 0).toFixed(3), 420, y);
            y += 12;
        });

        generatePdfFooter(doc, osData.generatedBy || osData.createdBy || '-');
        doc.end();
    } catch (error) {
        console.error('Erro ao gerar PDF oficial da O.S.', error);
        if (!res.headersSent) res.status(500).json({ message: 'Erro ao gerar PDF da O.S.' });
        doc.end();
    }
}

module.exports = { generateOrdemServicoOficialPdf };
