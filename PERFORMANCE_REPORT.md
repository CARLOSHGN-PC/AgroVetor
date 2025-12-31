# Relatório Técnico de Performance e Arquitetura - AgroVetor

**Data:** 16 de Outubro de 2023
**Autor:** Jules (Senior Software Architect)
**Alvo:** Android 12+ (Galaxy A12/A13), 3-4GB RAM, 25k-50k registros.

---

## 1. Resumo Executivo

A aplicação atual possui uma base sólida de funcionalidades, mas sofre de uma arquitetura monolítica que não escala para o volume de dados projetado (50k+ registros). O principal gargalo é o **carregamento antecipado (Eager Loading)** de todos os dados na inicialização e o processamento pesado de mapas no lado do cliente.

Para atingir a estabilidade desejada em dispositivos de entrada (Galaxy A12), é imperativo migrar de "Carregar Tudo" para "Carregar sob Demanda" e remover o processamento de Shapefiles do dispositivo móvel.

---

## 2. Análise Profunda da Arquitetura Atual

### 🛑 Pontos Críticos (Gargalos)

1.  **O Monolito `app.js` (13.000+ linhas)**
    *   **Problema:** O navegador precisa baixar, analisar e compilar 13k linhas de código antes de renderizar o primeiro pixel interativo. Em dispositivos Android low-end, o tempo de *Parsing/Compiling* do JS pode travar a UI por 2-4 segundos.
    *   **Impacto:** "Tela branca" prolongada e lentidão na resposta ao toque inicial.

2.  **Carregamento de Dados (Memory Hog)**
    *   **Código:** `App.data.listenToAllData()` (Linha ~900 em `app.js`).
    *   **Problema:** Ao iniciar, a aplicação abre *listeners* (ouvintes em tempo real) para `registros`, `perdas`, `personnel`, `fazendas`, etc.
    *   **Cenário 25k Registros:** Isso carrega instantaneamente dezenas de megabytes de JSON para a memória RAM. O *Garbage Collector* do Android entra em ação agressiva, causando "engasgos" (Jank) na rolagem e navegação.
    *   **Risco:** Crash silencioso do navegador por OOM (Out of Memory) em segundo plano.

3.  **Processamento de Mapa no Cliente (`shpjs`)**
    *   **Código:** `App.mapModule.handleShapefileUpload` e `loadAndCacheShapes`.
    *   **Problema:** O app baixa um `.zip`, descompacta e converte binário SHP para GeoJSON usando a CPU do celular. Em seguida, usa `proj4` para reprojetar coordenadas.
    *   **Impacto:** Bloqueia a Thread Principal por segundos. Se o mapa for grande (>5MB), o app é morto pelo sistema operacional.

4.  **Renderização de Listas (DOM)**
    *   **Problema:** Funções como `renderGerenciamento` ou `renderHistory` injetam HTML puro (`innerHTML +=`) em loops.
    *   **Impacto:** "Layout Thrashing". O navegador recalcula o layout da página inteira a cada item adicionado, destruindo a performance de renderização.

---

## 3. Soluções Estruturais (PWA + Capacitor)

### ✅ A. Modularização (ES6 Modules) - *Prioridade 1*
Dividir o `app.js` em módulos nativos. Isso permite que o navegador carregue apenas o essencial inicialmente e faça cache granular.

**Nova Estrutura Proposta:**
```text
docs/js/
├── boot.js          (Entry Point - apenas inicialização)
├── core/
│   ├── Auth.js      (Firebase Auth)
│   ├── Database.js  (Firestore + IndexedDB Wrapper)
│   └── Router.js    (Gestão de Abas e Navegação)
├── modules/
│   ├── Map.js       (Mapbox, Layers, SHP logic)
│   ├── Forms.js     (Lançamentos Broca, Perda, etc.)
│   ├── Sync.js      (Sincronização Offline)
│   └── Reports.js   (Geração de PDF/Excel)
└── utils/
    └── DOM.js       (Helpers de renderização otimizada)
```

### ✅ B. Lazy Loading de Dados (Estratégia Híbrida) - *Prioridade 2*
Abandonar o `listenToAllData`. Implementar o padrão **"Subscribe on View"**.

*   **Inicialização:** Carrega apenas `User`, `CompanyConfig` e `Announcements`.
*   **Aba Dashboard:** Carrega/Ouve `registros` e `perdas` (com limite/filtro de data padrão: últimos 30 dias).
*   **Aba Cadastros:** Carrega `fazendas` e `personnel`.
*   **Resultado:** O app inicia usando ~70% menos RAM.

### ✅ C. Mapa: Processamento no Backend - *Prioridade 3*
Mover a lógica pesada para o servidor.

1.  **Frontend:** Envia o `.zip` para `/api/maps/process`.
2.  **Backend:**
    *   Descompacta e converte SHP -> GeoJSON.
    *   Simplifica a geometria (reduz precisão decimal e remove vértices redundantes).
    *   Salva o JSON otimizado no Storage ou retorna diretamente.
3.  **Frontend:** Recebe um JSON leve pronto para o Mapbox.

---

## 4. Estratégia Offline (Ajuste "Cirúrgico")

A estratégia atual de `OfflineDB` (IndexedDB) é boa, mas a *leitura* ainda depende muito da memória RAM (`App.state.registros`).

**Ajuste Recomendado:**
Para listas longas (Histórico, Gerenciamento), não usar `App.state`.
Ler diretamente do IndexedDB com **Paginação**.
*   *Exemplo:* `App.data.getRegistros({ limit: 50, offset: 0 })`.
*   Isso mantém a memória livre, carregando apenas o que o usuário vê.

---

## 5. Plano de Ação Imediato

Este é o roteiro para transformar a análise em código sem quebrar o app:

1.  **Refatoração Estrutural (Modularização):**
    *   Criar a pasta `js/modules`.
    *   Extrair `Auth`, `Data` e `UI` do monolito.
    *   Validar funcionamento do Login e Menu.

2.  **Implementar Carregamento Sob Demanda:**
    *   Alterar `showTab(id)` no Router.
    *   Adicionar lógica: `if (id === 'dashboard' && !Data.isLoaded('registros')) Data.load('registros')`.

3.  **Otimização de Renderização:**
    *   Substituir loops de `innerHTML +=` por `document.createDocumentFragment()` e *append* único no final.

---

**Conclusão:**
O app não precisa ser reescrito do zero, mas a arquitetura de dados ("carregar tudo") é incompatível com o crescimento para 50k registros em Androids intermediários. A modularização e o carregamento preguiçoso (lazy loading) resolverão 90% dos problemas de travamento e consumo de memória.
