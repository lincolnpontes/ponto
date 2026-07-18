# PONTO!

Jogo multiplayer inspirado na lógica matemática do Dobble, feito como PWA estático e compacto: HTML, CSS e JavaScript puros, sem framework, sem `node_modules` e sem processo de compilação.

## O que está pronto

- Baralho de 57 cartas, 8 símbolos por carta e exatamente 1 símbolo em comum entre quaisquer duas cartas.
- Construção matemática completa de 57 cartas e 57 símbolos, sem descartar nenhuma carta.
- Tema `Maiúsculas & números` com 57 PNGs próprios em `themes/letters-numbers/`; não há letras minúsculas.
- Layout vertical: carta observada em cima, carta do jogador embaixo.
- Toque no símbolo correto e punição de 3 segundos após um erro.
- Erros aparecem imediatamente no celular; acertos mostram uma tela curta de confirmação até o servidor decidir quem foi primeiro.
- Salas simultâneas com código, lista de salas abertas e senha opcional de 3 a 8 números.
- Cada perfil pode hospedar somente uma sala aberta; o anfitrião pode encerrá-la a qualquer momento.
- Inclusão e remoção de vários jogadores de treino aparecem imediatamente e entram em uma fila curta de confirmação ao fundo; não é preciso esperar entre os toques.
- Contagem regressiva por horário do servidor: todos os aparelhos revelam a rodada no mesmo instante, depois que as 16 imagens estão carregadas.
- Progressão fiel dos quatro modos: cartas ganhas ou descartadas permanecem no topo correto, e Batata Quente transfere a mão inteira.
- Cada carta tem uma disposição visual imutável: posição, tamanho e rotação acompanham a própria carta quando ela muda de lugar ou permanece entre rodadas.
- Transferências entre a carta central e a pilha do jogador têm animação física de movimento.
- Duração rápida de 8, clássica de 16, longa de 32 ou completa de até 55 rodadas.
- Empates abrem uma rodada extra apenas entre os jogadores empatados.
- Login obrigatório por nome único e senha de 4 números; perfis antigos com 3 números ainda conseguem entrar para trocar a senha.
- Perfil administrativo `Lincoln` para configurações protegidas; jogadores comuns não veem essa área.
- O administrador pode listar/excluir jogadores, redefinir senhas para `1234` e encerrar qualquer sala, inclusive salas fantasmas.
- Modos 1 a 4 do manual. `Batata quente` e `Presente de grego` ficam limitados a 4 jogadores.
- Modo demonstração local com adversários de treino.
- Backend Google Apps Script + Sheets com estado ativo em cache compartilhado, persistência no Sheets e bloqueio atômico somente para decidir jogadas.
- PWA instalável e cache dos arquivos para abertura rápida.
- Botão de instalação ao lado do indicador de sincronização.

## Estrutura compacta

```text
index.html                         interface
style.css                         visual responsivo
app.js                            jogo, baralho, salas e sincronização
config.js                         URL padrão do Google Apps Script
manifest.json                     instalação PWA
service-worker.js                 cache offline
themes/letters-numbers/           tema isolado e seus 57 símbolos
google-apps-script/Code.gs        backend multiplayer
scripts/generate_theme.py         gerador determinístico dos PNGs
```

## Rodar localmente

Na pasta do projeto:

```powershell
python -m http.server 8787
```

Depois abra `http://localhost:8787`.

## Conectar ao Google Apps Script / Sheets

1. Abra [script.google.com](https://script.google.com) e crie um projeto.
2. Cole o conteúdo de `google-apps-script/Code.gs` no arquivo `Code.gs`.
3. Como essa URL já está integrada ao PONTO!, abra **Implantar → Gerenciar implantações**.
4. Edite a implantação, escolha **Nova versão** e confirme em **Implantar**.

Em uma instalação nova, o perfil administrativo é criado como `Lincoln`, com PIN inicial `0784`. Em instalações antigas, o PIN `784` continua válido até ser alterado. Sempre que o `Code.gs` mudar, atualize a implantação existente escolhendo **Nova versão**.

A primeira chamada cria automaticamente no seu Google Drive a planilha `PONTO! — Banco de dados`, com as abas `PROFILES`, `ROOMS`, `EVENTS` e `MATCHES`.

A implantação principal fica definida em `config.js`, portanto aparelhos novos já iniciam com a URL correta.

## Como a disputa é decidida

O app financeiro consultava uma revisão a cada 8 segundos e sincronizava um banco inteiro. Aqui cada toque envia apenas um evento pequeno. Enquanto a partida está aberta, as leituras usam o cache compartilhado do Apps Script em ciclos de até 250 ms, sem reabrir ou regravar a planilha a cada consulta. O Sheets recebe somente mudanças reais de estado.

O mais importante: o backend executa cada `claim` dentro de `LockService.getScriptLock()`. Mesmo que dois pedidos cheguem quase juntos, o primeiro pedido correto trava a rodada; os seguintes recebem `late` e não alteram o placar. O horário decisivo é o recebimento no servidor, não o relógio do celular.

## A matemática

Para 8 símbolos por carta, usamos o plano projetivo de ordem 7:

```text
7² + 7 + 1 = 57
```

Isso gera 57 cartas, 57 símbolos, 8 símbolos em cada carta e 8 ocorrências de cada símbolo. Qualquer par de cartas compartilha exatamente um símbolo.

## Adicionar outros temas

Crie outra pasta em `themes/` seguindo a mesma estrutura:

```text
themes/meu-tema/
  theme.json
  symbols/00.png ... 56.png
```

Os IDs de `00` a `56` são a identidade matemática dos símbolos. A arte pode mudar totalmente entre temas, mas cada pasta precisa conter os 57 arquivos.
