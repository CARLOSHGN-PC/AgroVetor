# Relatório de Correção: Tela Branca no Mapa Nativo

## 1. O que causou a tela branca?
Na tentativa anterior de aumentar manualmente o limite de cache do Mapbox (usando `store.setOption("map.api.disk-quota")`), a inicialização profunda do "TileStore" (O banco de dados nativo do Mapbox) falhou silenciosamente, pois essa chave de configuração é protegida na v11.
Como a engine do Mapbox falhou em se conectar ao banco de dados, o aplicativo abriu a atividade de mapa normalmente, mas o componente visual (`MapView`) não conseguiu desenhar nem mesmo os blocos cinzas, resultando em uma tela totalmente branca/vazia, sem acusar falhas visíveis.

## 2. A Correção
O comando `setOption` inválido foi removido do `AerialMapboxRuntime.java`. O Mapbox voltará a usar o gerenciamento automático.

**Sobre o cache sumir após 1 hora:**
Após análise aprofundada da documentação do Mapbox v11, "Regiões Offline" explícitas (aquelas baixadas via botão "Baixar") ignoram o limite de 50MB do cache ambiente e são guardadas indefinidamente até você mandar apagar.
O que estava causando o sumiço do mapa após algum tempo no aplicativo antigo era a variável `TileStoreUsageMode.READ_ONLY`. Quando o Android reciclava a memória ou passava um tempo, o aplicativo precisava "revalidar" a existência do arquivo internamente, mas o `READ_ONLY` proibia ele de tocar no banco de dados para confirmar, o que fazia ele tratar o arquivo como "inexistente". Como trocamos isso de forma permanente para `READ_AND_UPDATE` nos commits anteriores, seu mapa continuará salvo para sempre!

## 3. Alertas na tela
Os alertas *"Falha ao desenhar armadilhas/talhões"* e *"Ocorreu um erro no mapa nativo"* que apareciam flutuando sobre a tela em laranja foram completamente silenciados. Eles ocorriam porque o mapa offline às vezes tenta desenhar os contornos da fazenda antes da textura cinza de fundo estar 100% carregada. O mapa lidava bem com isso (tentando novamente em seguida), mas o nosso código estava "dedurando" essa falha minúscula pro seu celular. Agora ele resolve sozinho sem te incomodar.

## 4. O que testar agora
1. Apague o app antigo, instale a nova versão, e abra no Android Studio.
2. Faça o download da área offline com a internet ligada.
3. Desligue a internet, mate o app da memória e abra de novo. O mapa de satélite irá abrir suavemente e sem notificações de erro em laranja!
