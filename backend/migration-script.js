// migration-script.js
const admin = require('firebase-admin');

// 1. INICIALIZAÇÃO DO FIREBASE ADMIN SDK
// Pega a configuração da variável de ambiente, assim como o servidor faz.
if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    console.error('ERRO: A variável de ambiente FIREBASE_SERVICE_ACCOUNT_JSON não está definida.');
    process.exit(1);
}
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const companyNameToMigrate = "Cacu Comercio e Industria de Acucar e Alcool LTDA";
const BATCH_SIZE = 400;

const collectionsToMigrate = [
    'users',
    'fazendas',
    'personnel',
    'registros',
    'perdas',
    'cigarrinha',
    'cigarrinhaAmostragem',
    'planos',
    'harvestPlans',
    'armadilhas',
    'locationHistory',
    'historicalHarvests',
    'configChangeHistory',
    'sync_history_store',
    'notifications'
];

async function migrateData() {
    console.log(`Iniciando a migração para a empresa: "${companyNameToMigrate}"`);

    // 2. ENCONTRAR O ID DA EMPRESA
    const companiesRef = db.collection('companies');
    const companySnapshot = await companiesRef.where('name', '==', companyNameToMigrate).limit(1).get();

    if (companySnapshot.empty) {
        console.error(`ERRO: Empresa "${companyNameToMigrate}" não encontrada no banco de dados. A migração foi cancelada.`);
        return;
    }

    const companyId = companySnapshot.docs[0].id;
    console.log(`Empresa encontrada com sucesso. ID: ${companyId}`);

    let totalMigratedCount = 0;

    // 3. ITERAR E MIGRAR CADA COLEÇÃO
    for (const collectionName of collectionsToMigrate) {
        console.log(`\nProcessando coleção: "${collectionName}"...`);

        // Firestore não suporta query "where not exists", então pegamos todos e filtramos no lado do cliente.
        // Para coleções grandes, isso pode ser lento, mas é a abordagem mais segura para garantir que todos os documentos sejam verificados.
        const collectionRef = db.collection(collectionName);
        const snapshot = await collectionRef.get();

        const docsToMigrate = snapshot.docs.filter(doc => !doc.data().companyId);

        if (docsToMigrate.length === 0) {
            console.log(` -> Nenhum documento para migrar em "${collectionName}".`);
            continue;
        }

        console.log(` -> Encontrados ${docsToMigrate.length} documentos para migrar.`);

        // Processa em lotes para não sobrecarregar o Firestore
        for (let i = 0; i < docsToMigrate.length; i += BATCH_SIZE) {
            const batch = db.batch();
            const chunk = docsToMigrate.slice(i, i + BATCH_SIZE);

            chunk.forEach(doc => {
                batch.update(doc.ref, { companyId: companyId });
            });

            await batch.commit();
            console.log(`   - Lote de ${chunk.length} documentos migrado com sucesso.`);
        }
        totalMigratedCount += docsToMigrate.length;
    }

    console.log(`\n--- Migração Concluída ---`);
    console.log(`Total de ${totalMigratedCount} documentos atualizados com o ID da empresa.`);
}

migrateData().catch(error => {
    console.error("Ocorreu um erro fatal durante a migração:", error);
});