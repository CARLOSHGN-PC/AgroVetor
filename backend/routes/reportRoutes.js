const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');
const { authMiddleware, companyAuthMiddleware } = require('../middlewares/authMiddleware');

// Apply authentication and company authorization to all report routes
router.use(authMiddleware, companyAuthMiddleware);

router.get('/brocamento/pdf', reportController.generateBrocamentoPDF);
router.get('/brocamento/csv', reportController.generateBrocamentoCSV);

router.get('/perda/pdf', reportController.generatePerdaPDF);
router.get('/perda/csv', reportController.generatePerdaCSV);

router.get('/cigarrinha/pdf', reportController.generateCigarrinhaPDF);
router.get('/cigarrinha/csv', reportController.generateCigarrinhaCSV);

router.get('/cigarrinha-amostragem/pdf', reportController.generateCigarrinhaAmostragemPDF);
router.get('/cigarrinha-amostragem/csv', reportController.generateCigarrinhaAmostragemCSV);


router.get('/colheita/pdf', reportController.generateColheitaPDF);
router.get('/colheita/csv', reportController.generateColheitaCSV);
router.get('/colheita/mensal/pdf', reportController.generateColheitaMensalPDF);
router.get('/colheita/mensal/csv', reportController.generateColheitaMensalCSV);

// Add other report routes here...

module.exports = router;
