const { admin } = require('../services/firebase');

const authMiddleware = async (req, res, next) => {
  const token = req.headers.authorization?.split('Bearer ')[1];

  if (!token) {
    return res.status(401).send({ message: 'Acesso negado. Nenhum token fornecido.' });
  }

  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    const userDoc = await admin.firestore().collection('users').doc(decodedToken.uid).get();

    if (!userDoc.exists) {
      return res.status(404).send({ message: 'Utilizador não encontrado no Firestore.' });
    }

    req.user = {
      uid: decodedToken.uid,
      ...userDoc.data()
    };

    next();
  } catch (error) {
    console.error('Erro na autenticação do token:', error);
    return res.status(403).send({ message: 'Token inválido ou expirado.' });
  }
};

const companyAuthMiddleware = (req, res, next) => {
  const requestCompanyId = req.query.companyId || req.body.companyId;
  const userCompanyId = req.user.companyId;
  const userRole = req.user.role;

  if (userRole === 'super-admin') {
    return next();
  }

  if (!requestCompanyId) {
    return res.status(400).send({ message: 'O ID da empresa é obrigatório para esta requisição.' });
  }

  if (requestCompanyId !== userCompanyId) {
    return res.status(403).send({ message: 'Acesso negado. Você não tem permissão para aceder aos dados desta empresa.' });
  }

  next();
};

module.exports = { authMiddleware, companyAuthMiddleware };
