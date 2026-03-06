# Relatório de Análise: "Plugin is not implemented" & Zoom Indesejado

## 1. Erro `"AerialMap" plugin is not implemented on android`
- **Análise do Problema:** Esse erro nativo do Capacitor ocorre exclusivamente quando o código JavaScript tenta invocar um módulo nativo (neste caso, o `AerialMapPlugin`) que não foi encontrado compilado dentro do APK instalado no dispositivo.
- **Causa Raiz:** O código Java nativo que escrevemos nos commits anteriores estava correto, porém, o aplicativo (APK) que você está testando neste exato momento foi compilado *antes* dessas alterações recentes em Java terem sido empacotadas no Android Studio. Em outras palavras, a interface Web tentou chamar uma função, mas o "cérebro" Java do app ainda está usando a versão anterior sem o plugin atualizado.
- **Ação Tomada:** O comando `npx cap sync android` foi rodado para garantir que a ponte entre o JS e o Android esteja 100% atualizada, e rodamos a compilação local (que passou com sucesso "BUILD SUCCESSFUL").
- **Solução Imediata:** Para resolver esse erro específico da tela (que está travando o mapa cinza), **você precisa gerar um novo APK (Rebuild Project)** do Android Studio a partir da master com os commits que faremos agora, e instalá-lo no celular. O código que trata os mapas já está lá esperando para ser compilado e rodado.

## 2. Bug do Zoom Global (Pinch-to-zoom)
- **Análise do Problema:** Você relatou que, em qualquer módulo, ao tentar fazer o gesto de "pinça" (pinch-to-zoom), a tela da aplicação inteira está dando zoom in/out e quebrando o layout, dificultando a aprovação e uso do app.
- **Causa Raiz:** A tag HTML `<meta name="viewport" content="maximum-scale=1, user-scalable=no">` que havia sido adicionada não é suficiente para bloquear o zoom nativo nas versões mais recentes dos navegadores (como o Chrome no Android ou Safari no iOS), pois eles ignoram essa restrição por motivos de acessibilidade padrão.
- **Solução Implementada:**
  - Foi adicionada uma regra CSS dura diretamente no `index.html`: `touch-action: pan-x pan-y;` e `overscroll-behavior: none;`. Isso diz ao celular que a tela só deve aceitar "rolagem" (para os lados e para cima/baixo), bloqueando fisicamente o gesto de pinça no nível do sistema operativo.
  - Além disso, no arranque do aplicativo (`docs/app.js`), adicionamos um bloqueio via JavaScript para interceptar o evento `gesturestart` (o início do movimento de pinça) e abortá-lo (`e.preventDefault()`).

### Conclusão e Próximo Passo
Essas duas correções estabilizarão a interface Web e permitirão que o botão de "Preparar Offline" funcione quando rodado em um APK atualizado. O código atual já foi aprovado e compilado internamente aqui no sandbox.
