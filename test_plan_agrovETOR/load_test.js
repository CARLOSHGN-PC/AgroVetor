
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';

// --- Configuração do Teste ---
// Este teste foi projetado para um estresse moderado na API.
// Simula 150 usuários simultâneos (VUs) acessando o sistema por 3 minutos.
export const options = {
  stages: [
    { duration: '30s', target: 50 },  // Rampa de subida para 50 usuários em 30s
    { duration: '1m', target: 150 }, // Rampa de subida para 150 usuários em 1m
    { duration: '1m', target: 150 }, // Mantém 150 usuários por 1m
    { duration: '30s', target: 0 },   // Rampa de descida para 0 usuários
  ],
  thresholds: {
    // 95% das requisições devem terminar em menos de 800ms
    'http_req_duration': ['p(95)<800'],
    // A taxa de erro deve ser inferior a 2%
    'http_req_failed': ['rate<0.02'],
    // A rota de login deve ser rápida, 95% abaixo de 400ms
    'http_req_duration{endpoint:login}': ['p(95)<400'],
    // A rota de fazendas deve responder em até 1s
    'http_req_duration{endpoint:fazendas}': ['p(95)<1000'],
  },
};

// --- Métricas Customizadas ---
// Para uma análise mais detalhada dos resultados.
const loginDuration = new Trend('login_duration');
const getFazendaDuration = new Trend('get_fazenda_duration');
const errorRate = new Rate('error_rate');
const successRate = new Rate('success_rate');

// --- Configuração do Ambiente ---
// Altere para a URL do seu ambiente de teste.
const BASE_URL = 'https://meu-sistema-staging.onrender.com/api';

// --- Dados de Teste ---
// Use credenciais de um usuário de teste que exista no ambiente.
const USER_CREDENTIALS = {
  email: 'qa-tester@agrovETOR.com',
  password: 'a_password_that_is_secure_and_valid',
};

// --- Script Principal (Fluxo do Usuário Virtual) ---
export default function () {
  // 1. Etapa: Autenticação do Usuário
  const loginRes = http.post(
    `${BASE_URL}/login`,
    JSON.stringify(USER_CREDENTIALS),
    {
      headers: { 'Content-Type': 'application/json' },
      tags: { endpoint: 'login' }, // Tag para filtrar métricas
    }
  );

  // Adiciona a duração da requisição de login à nossa métrica customizada
  loginDuration.add(loginRes.timings.duration);

  const loginSuccess = check(loginRes, {
    'login successful (status 200)': (r) => r.status === 200,
    'login response contains token': (r) => r.json('token') !== undefined,
  });

  if (!loginSuccess) {
    errorRate.add(1); // Incrementa a taxa de erro se o login falhar
    console.error('Login failed. Stopping VU.');
    // Interrompe a execução deste VU se o login falhar.
    return;
  }

  successRate.add(1);

  // Extrai o token JWT da resposta de login
  const authToken = loginRes.json('token');

  // Pausa realista para simular o tempo que um usuário levaria para navegar
  sleep(1);

  // 2. Etapa: Acesso a um Recurso Protegido (Fazendas)
  // Simula o acesso a uma fazenda específica. Em um cenário real,
  // o ID poderia ser dinâmico (ex: pego de uma lista inicial).
  const fazendaId = 123; // ID de exemplo
  const authHeaders = {
    headers: {
      'Authorization': `Bearer ${authToken}`,
      'Content-Type': 'application/json',
    },
    tags: { endpoint: 'fazendas' }, // Tag para filtrar métricas
  };

  const fazendaRes = http.get(`${BASE_URL}/fazendas/${fazendaId}`, authHeaders);

  // Adiciona a duração da requisição de fazendas à nossa métrica customizada
  getFazendaDuration.add(fazendaRes.timings.duration);

  const getFazendaSuccess = check(fazendaRes, {
    'get fazenda successful (status 200)': (r) => r.status === 200,
    'get fazenda response is valid': (r) => r.json('id') === fazendaId,
  });

  if (!getFazendaSuccess) {
    errorRate.add(1); // Incrementa a taxa de erro
  } else {
    successRate.add(1);
  }

  // Pausa adicional para simular o comportamento do usuário
  sleep(2);
}
