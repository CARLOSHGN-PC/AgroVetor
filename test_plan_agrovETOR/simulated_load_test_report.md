
# Relatório Simulado de Teste de Carga - AgroVetor API

**Data do Teste:** 2024-10-27
**Ambiente:** `https://meu-sistema-staging.onrender.com`
**Executor:** Jules, QA & Security Engineer
**Ferramenta:** k6 (v0.41.0)

---

## 1. Resumo Executivo

O objetivo deste teste foi avaliar a performance e a resiliência da API AgroVetor sob um estresse moderado. O teste simulou **150 usuários virtuais (VUs)** concorrentes realizando um fluxo de autenticação e consulta de dados por um período de **3 minutos**.

**Resultado Geral: `FALHOU`**

A aplicação **não atendeu** aos critérios de performance definidos. Embora a taxa de erros tenha permanecido baixa (1.5%), o tempo de resposta da rota `GET /api/fazendas/:id` degradou significativamente sob carga, com o percentil 95 (p(95)) excedendo o limite de 1000ms.

---

## 2. Configuração do Teste

- **VUs Máximos:** 150
- **Duração Total:** 3 minutos
- **Fluxo de Usuário:**
  1. `POST /api/login` para obter token JWT.
  2. `GET /api/fazendas/:id` usando o token para autenticação.
- **Critérios de Sucesso (Thresholds):**
  - `http_req_duration` (p(95)): < 800ms
  - `http_req_failed` (taxa): < 2%
  - `http_req_duration{endpoint:fazendas}` (p(95)): < 1000ms

---

## 3. Métricas Principais (Resultados Simulados)

| Métrica                                | Valor (Resultado Simulado)                                  | Comentário                                                                                                 |
| -------------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| **Requisições Totais (http_reqs)**     | 19,845                                                      | Um volume razoável de requisições foi processado durante o teste.                                          |
| **Taxa de Requisições/s (rps)**        | `avg=110.25`                                                | A aplicação sustentou uma média de ~110 requisições por segundo.                                           |
| **Duração da Requisição (http_req_duration)** | `avg=450.12ms`, **`p(95)=1350.78ms`**                  | **Falhou:** O p(95) geral excedeu o limite de 800ms, principalmente devido à lentidão na rota de fazendas. |
| **Taxa de Erro (http_req_failed)**     | `1.50%`                                                     | **Passou:** A taxa de erro ficou abaixo do limite de 2%, indicando que a API é resiliente, embora lenta.     |
| **Duração Login (login_duration)**     | `avg=150.34ms`, `p(95)=380.11ms`                            | **Passou:** A autenticação permaneceu rápida e estável, como esperado.                                      |
| **Duração Fazendas (get_fazenda_duration)** | `avg=890.56ms`, **`p(95)=1988.45ms`**                  | **Falhou:** Este é o principal ponto de falha. O tempo de resposta quase dobrou o limite aceitável.      |

---

## 4. Análise e Identificação de Gargalos (Bottlenecks)

A análise dos resultados aponta para uma degradação clara da performance à medida que o número de usuários aumenta, especificamente na consulta de dados autenticados. O endpoint de login, sendo uma operação mais simples, não demonstrou problemas.

Com base na arquitetura (Node.js + PostgreSQL no Render), os seguintes gargalos são os mais prováveis:

### Gargalo 1: Consultas Lentas no Banco de Dados (Causa Mais Provável)
A rota `GET /api/fazendas/:id` provavelmente executa uma consulta no PostgreSQL que não está otimizada. Sob carga, com 150 VUs fazendo essa consulta repetidamente, o banco de dados se torna o principal ponto de contenção.
- **Evidência:** A alta latência (p(95) de ~2s) especificamente nesta rota, enquanto o login permanece rápido.
- **Ação Recomendada:** Analisar a query com `EXPLAIN ANALYZE`. Verificar se os índices corretos (especialmente na chave primária `id` e chaves estrangeiras) estão sendo utilizados.

### Gargalo 2: Saturação do Pool de Conexões do PostgreSQL
O Render e o PostgreSQL têm um limite no número de conexões ativas. Com 150 usuários, a aplicação Node.js pode estar tentando abrir mais conexões do que o banco de dados suporta, ou o pool de conexões (ex: `pg-pool`) está mal configurado. Isso causa um "congestionamento", onde as requisições ficam em fila esperando uma conexão livre.
- **Evidência:** Aumento acentuado no tempo de resposta quando o número de VUs atinge o pico. A taxa de erro de 1.5% pode ser composta por timeouts de conexão.
- **Ação Recomendada:** Monitorar o número de conexões ativas no painel do PostgreSQL no Render. Ajustar o tamanho do pool de conexões na aplicação para um valor compatível com o plano do banco de dados.

### Gargalo 3: Saturação da CPU/Memória na Instância do Render
Apesar de ser menos provável que o banco de dados, o próprio servidor da aplicação pode ser um gargalo. O Node.js é single-threaded, e se a rota `/api/fazendas/:id` realizar algum processamento intensivo de CPU (ex: manipulação de dados complexos em JavaScript) antes de responder, o event loop pode ficar bloqueado sob carga.
- **Evidência:** Se o tempo de resposta de *todas* as rotas (incluindo login) degradasse de forma semelhante, isso apontaria para o servidor.
- **Ação Recomendada:** Monitorar as métricas de CPU e Memória no painel do Render durante o teste. Considerar um upgrade do plano de serviço se a utilização consistentemente atingir 100%.

---

## 5. Próximos Passos

1.  **Otimizar a consulta** da rota `GET /api/fazendas/:id`.
2.  **Revisar e ajustar a configuração** do pool de conexões com o banco de dados.
3.  **Executar o teste novamente** após as otimizações para validar a melhoria.
