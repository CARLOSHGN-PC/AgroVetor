# Instruções para Importação de Dados do CHB para o Firestore

Este documento fornece um guia passo a passo para usar o script `import_chb_data.py` para carregar dados de colheita históricos de uma planilha Excel para o banco de dados Firestore da sua aplicação.

## 1. Pré-requisitos

Antes de começar, certifique-se de que você tem o seguinte:

- **Python 3.x** instalado em seu computador. Você pode baixá-lo em [python.org](https://www.python.org/downloads/).
- **pip**, o gerenciador de pacotes do Python, que geralmente já vem instalado com o Python.
- Um arquivo de planilha **Excel (.xlsx)** exportado do sistema CHB.
- O **ID da Empresa (`companyId`)** para a qual os dados serão importados.

## 2. Instalação das Dependências

O script requer algumas bibliotecas Python para funcionar. Abra o seu terminal (Prompt de Comando, PowerShell ou Terminal) e instale-as com o seguinte comando:

```bash
pip install pandas firebase-admin openpyxl
```

## 3. Configuração das Credenciais do Firebase

Para que o script possa se conectar ao seu banco de dados Firestore, ele precisa de credenciais de segurança.

### a. Obtenha o Arquivo de Credenciais

1.  Acesse o **Console do Firebase** do seu projeto: [https://console.firebase.google.com/](https://console.firebase.google.com/)
2.  Clique no ícone de engrenagem (Configurações do projeto) ao lado de "Visão geral do projeto" e selecione **"Configurações do projeto"**.
3.  Vá para a aba **"Contas de serviço"**.
4.  Clique no botão **"Gerar nova chave privada"**.
5.  Um arquivo JSON será baixado para o seu computador. **Guarde este arquivo em um local seguro**, pois ele concede acesso total ao seu projeto Firebase.

### b. Configure a Variável de Ambiente

O script encontra as credenciais através de uma variável de ambiente. Você precisa configurar essa variável para apontar para o arquivo JSON que você acabou de baixar.

**No Windows (usando o Prompt de Comando):**

Substitua `"C:\caminho\para\seu\arquivo.json"` pelo caminho completo do seu arquivo de credenciais.

```bash
setx FIREBASE_APPLICATION_CREDENTIALS "C:\caminho\para\seu\arquivo.json"
```

**Importante:** Após executar este comando, você precisará **fechar e reabrir o terminal** para que a alteração tenha efeito.

**No macOS ou Linux (usando o Terminal):**

Substitua `"/caminho/para/seu/arquivo.json"` pelo caminho completo do seu arquivo de credenciais.

```bash
export FIREBASE_APPLICATION_CREDENTIALS="/caminho/para/seu/arquivo.json"
```

**Nota:** O comando `export` define a variável apenas para a sessão atual do terminal. Para torná-la permanente, adicione a linha acima ao seu arquivo de perfil do shell (como `~/.bashrc`, `~/.zshrc` ou `~/.profile`) e reinicie o terminal.

## 4. Preparação do Arquivo Excel

O script espera que sua planilha Excel tenha colunas específicas.

-   **Nomes das Colunas:** O arquivo deve conter pelo menos as três colunas a seguir: `codigofazenda`, `toneladas` e `atr`. Os nomes não diferenciam maiúsculas de minúsculas e podem ter espaços (ex: "Codigo Fazenda" funciona).
-   **Formato dos Dados:**
    -   `codigofazenda`: O código que identifica a fazenda.
    -   `toneladas`: O valor numérico das toneladas (pode usar vírgula ou ponto como separador decimal).
    -   `atr`: O valor do ATR (também pode usar vírgula ou ponto).

## 5. Executando o Script

Com tudo configurado, você pode executar a importação.

1.  Navegue até o diretório raiz do projeto no seu terminal.
2.  Execute o script usando o seguinte formato de comando:

    ```bash
    python backend/import_chb_data.py <caminho_para_o_arquivo.xlsx> <companyId>
    ```

### Exemplo Prático:

Suponha que seu arquivo Excel se chama `relatorio_chb.xlsx` e está na sua pasta de Downloads, e seu `companyId` é `agro-tech-123`.

**No Windows:**

```bash
python backend/import_chb_data.py "C:\Users\SeuUsuario\Downloads\relatorio_chb.xlsx" "agro-tech-123"
```

**No macOS ou Linux:**

```bash
python backend/import_chb_data.py "/Users/SeuUsuario/Downloads/relatorio_chb.xlsx" "agro-tech-123"
```

O script exibirá o progresso no terminal, informando quantos registros foram lidos e salvos.

## 6. Verificação

Após a conclusão do script, você pode verificar se os dados foram importados corretamente acessando o **Firestore Database** no seu Console do Firebase e procurando pela coleção `historicalHarvests`. Lá, você encontrará os novos documentos criados pelo script.