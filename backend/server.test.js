const { processarLogVoo } = require('./processing');

// Mocking Firebase Admin SDK
const mockUpdate = jest.fn();
const mockGet = jest.fn();
const mockCollection = jest.fn(() => ({
    doc: jest.fn(() => ({
        get: mockGet,
        update: mockUpdate,
    })),
}));

const mockDb = {
    collection: mockCollection,
};

const mockAdmin = {
    firestore: {
        FieldValue: {
            serverTimestamp: () => 'SERVER_TIMESTAMP',
        },
    },
};

describe('processarLogVoo', () => {

    beforeEach(() => {
        // Clear all mocks before each test
        mockUpdate.mockClear();
        mockGet.mockClear();
        mockCollection.mockClear();
    });

    test('deve processar um log de voo e calcular as áreas corretamente', async () => {
        // 1. Mock Data
        const aplicacaoId = 'testAplicacao123';
        const osId = 'testOS123';

        // Sample log: a simple straight line
        const logData = [
            '-21.175, -48.450',
            '-21.175, -48.455',
            '-21.175, -48.460',
        ].join('\n');
        const logBuffer = Buffer.from(logData, 'utf-8');

        // A square talhão that partially overlaps with the flight path
        const talhaoGeometria = {
            type: 'Polygon',
            coordinates: [[
                [-48.452, -21.170], // top-left
                [-48.458, -21.170], // top-right
                [-48.458, -21.180], // bottom-right
                [-48.452, -21.180], // bottom-left
                [-48.452, -21.170], // close loop
            ]]
        };

        const ordemServico = {
            id: osId,
            largura_faixa: 20, // 20 meters
            fazendaId: 'fazendaTest123',
            talhoes: [{ id: 'talhaoTest123', geometria: talhaoGeometria }]
        };

        // Mock Firestore responses
        mockGet.mockResolvedValue({
            exists: true,
            data: () => ({
                talhoes: [{ id: 'talhaoTest123', geometria: talhaoGeometria }]
            })
        });

        // 2. Execute the function
        await processarLogVoo(aplicacaoId, logBuffer, ordemServico, mockDb, mockAdmin);

        // 3. Assertions

        // Check if the final update to 'aplicacoes' collection was called
        expect(mockUpdate).toHaveBeenCalledTimes(2); // Once for aplicacao, once for OS

        const updateCallArgs = mockUpdate.mock.calls[0][0];

        // Check status
        expect(updateCallArgs.status).toBe('Concluído');

        // Check if geometries were created
        expect(updateCallArgs.geometria_aplicada).toBeDefined();
        expect(updateCallArgs.geometria_correta).toBeDefined(); // Intersection should exist

        // Check area calculations (approximate values)
        // These values depend on the exact implementation of turf.js and projection, so we check for a reasonable range.
        expect(updateCallArgs.area_aplicada_total_ha).toBeCloseTo(2.1, 1); // ~1km line * 20m width
        expect(updateCallArgs.area_correta_ha).toBeCloseTo(1.4, 1); // Part of the flight is inside the talhao
        expect(updateCallArgs.area_desperdicio_ha).toBeCloseTo(0.7, 1);
        expect(updateCallArgs.area_falha_ha).toBeGreaterThan(0);
        expect(updateCallArgs.percentual_cobertura).toBeGreaterThan(0);
        expect(updateCallArgs.percentual_cobertura).toBeLessThan(100);

        // Check if the service order status was also updated
        const osUpdateCall = mockUpdate.mock.calls[1][0];
        expect(osUpdateCall.status).toBe('Concluído');
    });
});
