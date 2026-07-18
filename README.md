# PONTO!

Jogo multiplayer inspirado na lógica matemática do Dobble, feito como PWA estático e compacto: HTML, CSS e JavaScript puros, sem framework, sem `node_modules` e sem processo de compilação.

## O que está pronto

- Baralho de 57 cartas, 8 símbolos por carta e exatamente 1 símbolo em comum entre quaisquer duas cartas.
- Construção matemática completa de 57 cartas e 57 símbolos, sem descartar nenhuma carta.
- Tema `Maiúsculas & números` com 57 PNGs próprios em `themes/letters-numbers/`; não há letras minúsculas.
- Layout vertical: carta observada em cima, carta do jogador embaixo.
- Toque no símbolo correto e punição de 3 segundos após um erro.
- Salas simultâneas com código, lista de salas abertas e senha opcional de 3 a 8 números.
- Perfil protegido por PIN de 3 números e ranking por vitórias ou aproveitamento, sempre sem jogadores de treino.
- Modos 1 a 4 do manual. `Batata quente` e `Presente de grego` ficam limitados a 4 jogadores.
- Modo demonstração local com adversários de treino.
- Backend Google Apps Script + Sheets com bloqueio atômico para decidir quem tocou primeiro.
- PWA instalável e cache dos arquivos para abertura rápida.

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
3. Clique em **Implantar → Nova implantação → Aplicativo da Web**.
4. Em **Executar como**, escolha sua conta. Em **Quem pode acessar**, escolha **Qualquer pessoa**.
5. Autorize o script e copie a URL terminada em `/exec`.
6. No PONTO!, abra **Perfil → Sincronização e ajustes**, cole a URL e toque em **Testar e salvar**.

A primeira chamada cria automaticamente no seu Google Drive a planilha `PONTO! — Banco de dados`, com as abas `PROFILES`, `ROOMS`, `EVENTS` e `MATCHES`.

A URL da implantação principal já fica definida em `config.js`. Em um aparelho novo, o app usa essa URL automaticamente; uma URL salva manualmente nos ajustes continua tendo prioridade.

## Como a disputa é decidida

O app financeiro consultava uma revisão a cada 8 segundos e sincronizava um banco inteiro. Aqui cada toque envia apenas um evento pequeno. Enquanto a sala está aberta, uma nova consulta começa 250 ms após a resposta anterior, sem criar pedidos sobrepostos.

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
