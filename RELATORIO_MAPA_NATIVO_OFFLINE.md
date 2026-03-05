# Relatório de Resolução: Erro Fatal no Mapa Nativo e Falso Offline

## 1. Análise do Problema
O usuário relatou que o aplicativo AgroVetor estava apresentando erros críticos ao tentar abrir o módulo de monitoramento aéreo (Mapa Nativo) mesmo quando conectado ao WiFi.
Os erros apresentados eram:
- *"Contornos offline indisponíveis no cache local. Conecte-se para atualizar."*
- *"Falha no mapa nativo por erro fatal. Retornando para modo web."*

Isso indicava um problema de **Falso Negativo de Conexão** (o aplicativo achava que estava sem internet, mesmo tendo) e um **Bloqueio Incorreto** (a falta de polígonos/contornos impedia o mapa base de carregar).

## 2. Causas Raízes Identificadas

### 2.1. Falso Negativo no `isNetworkAvailable()` (Android API 29+)
No Android, a verificação nativa de internet (`ConnectivityManager.getActiveNetwork()`) estava retornando `null` ou não conseguindo validar o transporte (WIFI/CELLULAR) em alguns dispositivos e configurações de rede (ex: portais cativos, troca rápida de redes). Isso fazia com que o `NativeAerialMapActivity` e o `AerialMapboxRuntime` acreditassem que o dispositivo estava offline de forma forçada, impedindo o carregamento do mapa online e ativando a cadeia de "fallback" (modo de segurança) que exige pacotes offline prontos.

### 2.2. Rigidez no Carregamento de Contornos (`app.js`)
Quando a Webview do aplicativo (via Capacitor) reportava estado offline (`navigator.onLine === false`) – muitas vezes em sincronia com a falha acima – o aplicativo tentava carregar os contornos (shapefiles dos talhões) do armazenamento local. Se os contornos não estivessem cacheados na hora, a função `loadContoursOfflineSafe` disparava um erro em tela e interrompia abruptamente o carregamento.

### 2.3. Queda em Efeito Dominó (Erro Fatal)
Como o dispositivo reportava "Sem Internet" nativamente, ele tentava usar os "Styles" (estilos de mapa) e "Tiles" guardados no disco. Sem um pacote validado, a API do Mapbox disparava o evento `notifyError`.
O frontend (`docs/app.js`), ao receber o erro nativo, acionava a mensagem laranja que foi "Falha no mapa nativo por erro fatal" e desistia, voltando para o mapa web em branco.

## 3. Soluções Aplicadas

### 3.1. Reestruturação da Validação de Rede (`NetworkUtils.java`)
Foi criado um arquivo utilitário dedicado (`android/app/src/main/java/com/agrovetor/app/aerial/NetworkUtils.java`) para checar a rede.
- Agora o aplicativo cruza a informação da API nova (`NetworkCapabilities`) com a API legada (`getActiveNetworkInfo().isConnected()`).
- Isso garante que se o Android de alguma forma mascarar o transporte, o aplicativo ainda vai saber que a internet está ativa e usar o Mapbox online.
- As classes `NativeAerialMapActivity` e `AerialMapboxRuntime` foram atualizadas para usar essa nova lógica imune a falsos negativos.

### 3.2. Resiliência no Frontend (`docs/app.js`)
A função `loadContoursOfflineSafe` foi atualizada.
- Agora, se o `App.state.useNativeAerialMap` for verdadeiro e os contornos offline estiverem ausentes, o sistema apenas exibe um alerta no console e permite que a inicialização do Mapa Nativo continue.
- Dessa forma, o mapa, o terreno, e o cache offline abrem perfeitamente mesmo que a empresa não tenha shapefiles sincronizados ou se o cache de contornos foi corrompido. Eliminamos a falha forçada.

## 4. Conclusão
O Mapa Nativo agora vai inicializar normalmente (via WiFi/4G ou modo Offline genuíno) sem exibir erros fatais, e o erro de pinch-to-zoom (configurado nos commits anteriores) já está resolvido e pronto para uso.
