# Relatório de Atualização: Falha de Inicialização do Mapa Nativo

## 1. Problema Restante Identificado
O usuário enviou uma nova imagem indicando que a mensagem *"Falha no mapa nativo por erro fatal. Retornando para modo web"* continuava aparecendo em algumas situações.
A análise identificou que quando o aplicativo está abrindo o mapa nativo (Mapbox SDK v11), ele tenta carregar o "Style" (estilo do mapa).
Se o usuário estiver *completamente sem internet* e *não possuir pacotes offline baixados/em cache* para aquela região (ou se o cache foi limpo pelo SO), o carregamento do Style falha após o timeout (9 segundos) ou por erro de rede imediato (`MapLoadingError`).

## 2. A Falha na Lógica Original
Anteriormente, o código no arquivo `NativeAerialMapActivity.java` da plataforma Android assumia que:
- Se o carregamento do estilo falhasse, ele procuraria opções de fallback.
- Se *todas as opções de fallback falhassem*, ele checava se a rede foi detectada como ligada no início do carregamento.
- Se a rede parecia ligada, mas o mapa não baixou (ex: conexão falsa, captive portal, proxy corporativo bloqueando Mapbox), ele emitia um `notifyError("Falha ao carregar mapa offline")`.

**A Reação do Frontend:**
O arquivo `app.js` escutava qualquer erro que não fosse `offline_package_missing` e ativava o **fallback definitivo**, desabilitando o mapa nativo e acionando o alerta *"Falha no mapa nativo por erro fatal. Retornando para modo web."* (linha 13805).

## 3. A Correção Implementada
A lógica de `NativeAerialMapActivity.java` foi simplificada e fortalecida.
Foi alterada a função `proceedToNextStyleOrFail` para que, ao se esgotarem as tentativas de carregar o estilo de mapa, ele **não acione mais o `notifyError` fatal**.

Em vez de matar o processo e retornar para web, ele agora vai disparar **apenas** a notificação `notifyOfflinePackageMissing` contendo a mensagem:
*"Mapa offline indisponível para o zoom/área atual. Ajuste o zoom ou baixe novamente."*

**Impacto Positivo:**
- O Frontend (`app.js`) sabe tratar o aviso de `offline_package_missing`.
- Em vez de derrubar o mapa nativo para sempre na sessão do usuário, ele vai exibir um aviso não-fatal, dando a chance de o usuário conectar-se e tentar de novo, ou dar zoom out para uma área onde exista cache.

## 4. Conclusão Final
As barreiras que forçavam a desativação do mapa nativo foram removidas:
1. Problema de detecção de rede corrigido com a nova classe `NetworkUtils`.
2. O aplicativo não interrompe mais a inicialização se os contornos vetoriais (talhões) falharem.
3. Se os tiles de mapa base falharem por falta de internet absoluta/sem cache, em vez de voltar pro web de forma fatal, ele sinaliza gentilmente que a região offline está faltando.
