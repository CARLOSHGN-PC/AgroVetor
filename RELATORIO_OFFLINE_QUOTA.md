# Relatório de Verificação e Solução: Retenção do Mapa Offline

## 1. O Problema Reportado
Você relatou que, ao usar o aplicativo offline, a imagem do satélite acabava se perdendo e exigindo recarregamento, especialmente se você saísse do aplicativo ou se passasse um tempo (ex: 1 hora). O mapa nativo também insistia em perder a referência do offline, acusando falhas.

## 2. Investigação no Mapbox SDK v11
Realizamos uma auditoria minuciosa nas classes que gerenciam os downloads e o cache do Mapbox Native (`AerialMapboxRuntime.java` e `AerialOfflinePackageManager.java`).

**A causa raiz foi encontrada:**
Por padrão, o Mapbox v11 aloca uma "Quota de Disco" (Disk Quota) muito pequena, em torno de 50MB a no máximo algo limitante na configuração padrão de algumas versões.
Quando o usuário baixa os contornos de uma fazenda (satélite em alta resolução), esses tiles de mapa pesam significativamente. Ao bater o limite dessa cota minúscula, o Mapbox inicia um **processo de expulsão automática** (eviction). Ele deleta os tiles antigos silenciosamente para manter o limite de 50MB.
Como resultado, quando você saía do app, o sistema operacional e o Mapbox limpavam esse cache excedente. Ao abrir o mapa offline de novo, os dados não estavam mais lá, quebrando o carregamento.

## 3. A Correção: Ampliação da Cota de Cache Permanente
Foi alterado o código em `AerialMapboxRuntime.java` para configurar explicitamente o limite do cache (`map.api.disk-quota`).
- **Novo Limite:** 500 MB (500L * 1024L * 1024L).
- Com esse novo limite generoso, você poderá baixar e manter múltiplos pacotes offline em alta resolução, e o Mapbox não os deletará silenciosamente, resolvendo o problema das imagens de satélite "sumirem" sozinhas.

## 4. O Fluxo de Download e "Bounding Box"
Também verifiquei o fluxo do `AerialOfflinePackageManager.java` responsável por fazer o download da região:
- A caixa de abrangência (Bounding Box) do shapefile (os limites Norte, Sul, Leste e Oeste) estão sendo lidos corretamente.
- Essa caixa é convertida para um polígono (Polygon) da API do Mapbox corretamente.
- O download do StylePack e da TileRegion não exige conexão de rede perfeita na hora de "revisar" (NetworkRestriction.NONE) e aceita tiles expirados localmente (`acceptExpired(true)`), o que é mandatório para usar offline "raiz".
- As lógicas de "retry" que quebravam o mapa foram consertadas em commits passados.

## 5. Próximos Passos
O aplicativo agora deve manter o mapa offline (imagem de satélite) gravado no disco (até 500MB) sem evaporar misteriosamente. Recomendo fazer o build dessa branch, deletar o pacote offline antigo no app, conectar-se ao WiFi, fazer um download limpo de um pacote, e fechar/desligar a internet para testar o carregamento nativo liso.
