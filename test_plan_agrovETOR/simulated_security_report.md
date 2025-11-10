
# Relatório de Análise de Vulnerabilidades - AgroVetor API

**Scan ID:** `AV-2024-10-27-001`
**Data:** 2024-10-27
**Alvo:** `https://meu-sistema-staging.onrender.com/api/`
**Ferramenta de Simulação:** OWASP ZAP (Simulated Output)
**Engenheiro de Segurança:** Jules

---

## Resumo Executivo

| Risco     | Contagem |
| :-------- | :------: |
| Crítico   |    2     |
| Alto      |    0     |
| Médio     |    3     |
| Baixo     |    0     |
| **Total** |  **5**   |

Foram identificadas **5 vulnerabilidades**, sendo **2 classificadas como Críticas** e **3 como Médias**. As falhas críticas representam um risco iminente de comprometimento do servidor e vazamento de dados. A correção dessas falhas deve ser tratada com a **máxima prioridade**.

---

## Detalhes das Vulnerabilidades

### 1. [CRÍTICO] Insecure File Upload - Remote Code Execution
- **CWE-434:** Unrestricted Upload of File with Dangerous Type
- **URL Afetada:** `POST /api/upload-shp`
- **Descrição:**
  A funcionalidade de upload de arquivos `.shp` não valida adequadamente o conteúdo dos arquivos enviados. Isso permite que um atacante envie um arquivo contendo um web shell (um script executável) disfarçado de arquivo `.zip`. Uma vez que o arquivo está no servidor, o atacante pode acessá-lo via URL e executar comandos arbitrários no sistema operacional do container do Render.
- **Prova de Conceito (PoC):**
  1. Um arquivo `shell.js` (um web shell Node.js) foi compactado em `malicious.zip`.
  2. A seguinte requisição foi enviada para a API:
     ```http
     POST /api/upload-shp HTTP/1.1
     Host: meu-sistema-staging.onrender.com
     Content-Type: multipart/form-data; boundary=----WebKitFormBoundary...

     ------WebKitFormBoundary...
     Content-Disposition: form-data; name="file"; filename="malicious.zip"
     Content-Type: application/zip

     [...conteúdo binário do zip...]
     ------WebKitFormBoundary...--
     ```
  3. A API respondeu com sucesso e o arquivo foi salvo em um diretório publicamente acessível (ex: `/uploads`).
  4. Ao acessar `https://.../uploads/shell.js?cmd=whoami`, o servidor respondeu com o nome do usuário do sistema (`app-user`), confirmando a execução remota de código.
- **Remediação:**
  - **Nunca confie no `Content-Type` ou na extensão do arquivo.**
  - **Valide a assinatura do arquivo (magic bytes)** para garantir que ele é realmente um arquivo ZIP.
  - **Use uma biblioteca antivírus** para escanear o conteúdo do arquivo no servidor.
  - **Armazene os arquivos fora do web root**, em um diretório não acessível publicamente. O acesso deve ser feito através de um script que sirva os arquivos de forma controlada.
  - **Renomeie os arquivos** no upload para um nome aleatório, sem a extensão original.

### 2. [CRÍTICO] SQL Injection - Authentication Bypass
- **CWE-89:** Improper Neutralization of Special Elements used in an SQL Command
- **URL Afetada:** `POST /api/login`
- **Descrição:**
  Os parâmetros `email` e `password` na requisição de login não são devidamente sanitizados e são vulneráveis a injeção de SQL. Um atacante pode injetar comandos SQL no campo de email para manipular a consulta de autenticação e obter acesso a qualquer conta sem precisar da senha.
- **Prova de Conceito (PoC):**
  - O seguinte payload JSON foi enviado para a rota de login:
    ```json
    {
      "email": "' OR '1'='1' --",
      "password": "qualquercoisa"
    }
    ```
  - A query no backend, provavelmente algo como `SELECT * FROM users WHERE email = '${email}'`, se torna `SELECT * FROM users WHERE email = '' OR '1'='1' --'`, que é sempre verdadeira.
  - A API retornou um token JWT válido para o primeiro usuário da tabela (geralmente o administrador), concedendo acesso total ao atacante.
- **Remediação:**
  - **Utilize exclusivamente Parameterized Queries (Prepared Statements).** Nunca concatene strings para montar consultas SQL.
  - Exemplo em Node.js com a biblioteca `pg`:
    ```javascript
    // RUIM: Vulnerável
    const query = `SELECT * FROM users WHERE email = '${email}'`;

    // BOM: Seguro
    const query = 'SELECT * FROM users WHERE email = $1';
    const values = [email];
    db.query(query, values);
    ```

### 3. [MÉDIO] Missing Rate Limiting on Authentication
- **CWE-307:** Improper Restriction of Excessive Authentication Attempts
- **URL Afetada:** `POST /api/login`
- **Descrição:**
  A API não impõe um limite no número de tentativas de login falhas para um determinado usuário ou endereço IP. Isso torna a aplicação vulnerável a ataques de **Brute Force** (adivinhar a senha de um usuário conhecido) e **Credential Stuffing** (testar listas de credenciais vazadas).
- **Remediação:**
  - Implemente um mecanismo de rate limiting. Por exemplo, use um middleware como `express-rate-limit` no Node.js.
  - Bloqueie o IP por 5 minutos após 10 tentativas falhas.
  - Considere implementar um CAPTCHA após um pequeno número de falhas.

### 4. [MÉDIO] User Enumeration via Error Messages
- **CWE-209:** Generation of Error Message Containing Sensitive Information
- **URL Afetada:** `POST /api/login`
- **Descrição:**
  A API retorna mensagens de erro diferentes dependendo se o email existe ou não no banco de dados.
  - Se o email não existe: `{"error": "Usuário não encontrado"}`
  - Se o email existe mas a senha está errada: `{"error": "Senha incorreta"}`
  Isso permite que um atacante confirme quais emails são usuários válidos no sistema para usar em ataques futuros.
- **Remediação:**
  - Utilize uma única mensagem de erro genérica para todas as falhas de autenticação.
  - Exemplo: `{"error": "Credenciais inválidas"}`.

### 5. [MÉDIO] Security Headers Not Set
- **CWE-693:** Protection Mechanism Failure
- **URL Afetada:** Todas as rotas da API.
- **Descrição:**
  As respostas da API não incluem cabeçalhos de segurança HTTP. A ausência desses cabeçalhos aumenta a superfície de ataque para vetores como Cross-Site Scripting (XSS), clickjacking e sniffing de tráfego.
- **Cabeçalhos Faltando (Exemplos):**
  - `Strict-Transport-Security (HSTS)`: Força o uso de HTTPS.
  - `X-Content-Type-Options: nosniff`: Impede que o navegador "adivinhe" o tipo de conteúdo.
  - `Content-Security-Policy (CSP)`: Controla de onde os recursos podem ser carregados.
- **Remediação:**
  - Adicione os cabeçalhos de segurança a todas as respostas da API.
  - Em aplicações Express.js (Node.js), isso pode ser facilmente feito com o middleware `helmet`: `app.use(helmet());`.
