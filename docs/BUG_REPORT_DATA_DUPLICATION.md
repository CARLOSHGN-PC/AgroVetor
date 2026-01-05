# Relatório de Incidente: Duplicação de Dados no Controle de Frota

**Data:** 05/01/2026
**Módulo:** Gestão de Frota / Controle de KM
**Severidade:** Alta (Corrupção de Dados)

## 1. O Problema (Causa Raiz)

O sistema estava criando múltiplos registros idênticos (duplicados ou triplicados) ao clicar no botão "Salvar" ou "Confirmar Saída" apenas uma vez.

**Análise Técnica:**
O problema ocorria devido à forma como o ciclo de vida da aplicação Single Page Application (SPA) estava gerenciando os eventos do DOM.

1.  O arquivo `app.js` gerencia a navegação. Toda vez que o usuário clicava no menu "Controle de KM" ou "Gestão de Frota", a função `App.ui.showTab()` chamava `App.fleet.init()`.
2.  A função `App.fleet.init()` chamava `this.setupEventListeners()`.
3.  A função `setupEventListeners()` executava comandos como:
    ```javascript
    document.getElementById('btnSaveFrota').addEventListener('click', () => this.saveVehicle());
    ```
4.  **O Erro:** O método `addEventListener` **adiciona** um novo ouvinte. Ele não substitui os anteriores.
5.  **Cenário de Reprodução:**
    *   O usuário abre a aba "Frota" (1 ouvinte adicionado).
    *   O usuário vai para o "Dashboard".
    *   O usuário volta para a aba "Frota" (2º ouvinte adicionado).
    *   O usuário clica em "Salvar".
    *   **Resultado:** O navegador dispara o evento 2 vezes. A função `saveVehicle()` roda 2 vezes. O banco de dados recebe 2 gravações idênticas simultâneas.

## 2. A Solução Implementada

Foi implementado um padrão de **Inicialização Idempotente**. Isso garante que, não importa quantas vezes a função de inicialização seja chamada, o resultado (configuração dos eventos) ocorra apenas uma vez.

**Código da Correção (`docs/js/fleet.js`):**

```javascript
const FleetModule = {
    isInitialized: false, // Nova flag de controle

    init() {
        // Se já estiver inicializado, para a execução imediatamente.
        if (this.isInitialized) return;

        this.setupEventListeners();

        // Marca como inicializado para bloquear futuras chamadas.
        this.isInitialized = true;
    },
    // ...
```

## 3. Estado dos Dados

Além da correção da duplicação, foi implementado o método `onShow()`.
Anteriormente, ao sair e voltar da tela, os dados do formulário persistiam (ex: placa digitada pela metade), o que causava confusão.
Agora, sempre que a aba é aberta, o sistema força uma limpeza dos formulários (`clearFleetForm`), garantindo que o usuário comece uma operação limpa.

## 4. Conclusão

O sistema agora está protegido contra múltiplas vinculações de eventos. A navegação entre abas não acumula mais processos em segundo plano, e a performance foi estabilizada.
