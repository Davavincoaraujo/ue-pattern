# ue-pattern

Agente autônomo para construir componentes **AEM Universal Editor** em projetos Next.js headless. Funciona com qualquer ferramenta de IA que leia instruções em Markdown e execute comandos de terminal: Claude Code, Cursor, GitHub Copilot, Codex, Gemini CLI, Windsurf, Aider e similares.

Você descreve o componente; o agente consulta o padrão, gera o esqueleto, implementa, roda os gates (validação, typecheck, lint, testes), confere o visual contra o Figma ou uma imagem de referência e itera até passar. Ele só devolve o controle quando termina ou quando a decisão é sua.

| Peça | Onde | Papel |
|---|---|---|
| **Agente** (fonte única) | [agent/AGENT.md](agent/AGENT.md) | Ciclo de construção, regras e critérios de parada |
| **Adaptadores** | [AGENTS.md](AGENTS.md), [adapters/](adapters/) | O mesmo agente no formato de cada ferramenta (gerados) |
| **CLI** | `dist/cli.js` | Consulta, validação, scaffold e validação visual. Independe da ferramenta |
| **Padrão** | `reference/autoria/`, `reference/construcao/`, [docs/](docs/) | Documentação completa |
| **Skill (Claude Code)** | [SKILL.md](SKILL.md) | Mesmo conteúdo no formato de skill |

## Configuração

### 1. Instalar o CLI e o padrão (igual para todas as ferramentas)

```sh
git clone https://github.com/Davavincoaraujo/ue-pattern.git ~/.ue-pattern
cd ~/.ue-pattern
npm install
export UE_PATTERN_DIR=~/.ue-pattern
```

O `npm install` já compila. Requisitos: Node 18.20+ e, para os comandos visuais, Chrome (`CHROME_EXECUTABLE_PATH` se não estiver no caminho padrão). Coloque o `export` no seu `~/.zshrc` ou `~/.bashrc`.

Verifique, a partir da raiz de um projeto:

```sh
node $UE_PATTERN_DIR/dist/cli.js buscar "quando usar subItems"
node $UE_PATTERN_DIR/dist/cli.js validar-grupo global
```

### 2. Ligar o agente à sua ferramenta

| Ferramenta | O que fazer |
|---|---|
| **Claude Code** | `ln -s $UE_PATTERN_DIR/adapters/claude-code/ue-pattern-builder.md ~/.claude/agents/` (global) ou em `<projeto>/.claude/agents/`. Opcional como skill: `ln -s $UE_PATTERN_DIR ~/.claude/skills/ue-pattern` |
| **Cursor** | Copie `adapters/cursor/ue-pattern.mdc` para `<projeto>/.cursor/rules/` |
| **GitHub Copilot** | Copie `adapters/copilot/ue-pattern.instructions.md` para `<projeto>/.github/instructions/` |
| **Codex, Gemini CLI, Windsurf, Aider e outros** | Copie [AGENTS.md](AGENTS.md) para a raiz do projeto (ou aponte a ferramenta para ele). Gemini CLI: configure `contextFileName` como `AGENTS.md` |
| **Qualquer outra** | Cole o conteúdo de [agent/AGENT.md](agent/AGENT.md) como instrução de sistema ou de projeto |

Os adaptadores são gerados de `agent/AGENT.md`. Para alterar o agente, edite só esse arquivo e rode `npm run gerar-adaptadores`.

### 3. Permitir o CLI sem prompt (opcional)

Cada ferramenta pede aprovação para comandos de terminal. Libere só o CLI, nunca `git commit`, `git push` nem deploy. No Claude Code, em `settings.json`:

```json
{ "permissions": { "allow": ["Bash(node ~/.ue-pattern/dist/cli.js:*)"] } }
```

Nas outras, use o equivalente (lista de comandos permitidos ou aprovação única por sessão).

### 4. Adaptar ao seu projeto

- **Arquivo de instruções do projeto** (`AGENTS.md`, `CLAUDE.md`, `.cursorrules`...). O agente o lê primeiro e ele vence em caso de conflito. Coloque ali o que é específico: nomes dos grupos, namespace do AEM, caminho do DAM, regras de git, pastas proibidas.
- **`src/scaffold.ts`.** O esqueleto usa `/content/dam/seu-projeto` (filtro de asset) e `/content/seu-projeto/pt/` (mock do teste). Troque pelos seus valores e rode `npm run build`.
- **Modelo e ferramentas.** Defina no formato da sua ferramenta. O agente precisa de leitura, busca, edição de arquivos e execução de comandos.

### 5. Variáveis de ambiente

| Variável | Padrão | Uso |
|---|---|---|
| `UE_PATTERN_DIR` | — | Pasta do clone, usada pelo agente para achar o CLI |
| `UE_PATTERN_PROJECT_PATH` | diretório atual | Raiz do projeto (também `--projeto`) |
| `UE_PATTERN_BASE_URL` | `http://localhost:3000` | Servidor para `spec` e `comparar` |
| `UE_PATTERN_OUTPUT_PATH` | `outputs/` | Onde `comparar` grava os PNGs |
| `UE_PATTERN_KNOWLEDGE_PATH` | `reference/` | Pasta de documentos |
| `UE_PATTERN_SKILLS_PATH` | `~/.claude/skills` | Origem do `sync-knowledge` |
| `CHROME_EXECUTABLE_PATH` | detectado | Chrome para Playwright |

## Usar o agente

Dentro do projeto, peça em linguagem natural:

```
Construa o componente "hero-banner" no grupo "landing" seguindo o agente ue-pattern:
título e descrição em rich text, imagem de fundo, um CTA de link.
Spec do Figma: e2e/pixel-perfect/specs/hero-banner.figma.json
```

O brief rende mais com: grupo, nome, campos, tipo de conteúdo repetido, CTA ou efeito de scroll, e a referência visual (spec ou PNG).

**O agente para e pergunta** quando: o grupo não existe, precisaria mudar código compartilhado de forma não aditiva, dois padrões de conteúdo são igualmente válidos, falta referência visual, ou um gate falha após 3 rodadas.

**O agente nunca** faz commit, push, `git stash` ou deploy, e não escreve comentários no código. O teste do dialog no editor fica como pendência no relatório final.

## Usar o CLI sem o agente

```sh
alias ue="node $UE_PATTERN_DIR/dist/cli.js"

ue buscar "quando usar subItems"
ue criar meu-grupo hero --titulo "Hero" --campos "title:Título:richtext,image:Imagem:asset"
ue criar meu-grupo hero --titulo "Hero" --campos "title:Título:richtext,image:Imagem:asset" --gravar
ue validar meu-grupo/sections/hero/v1
ue validar-grupo meu-grupo
ue spec exemplo.figma.json --frame mobile
ue comparar ~/figma/hero-desktop.png /pagina-exemplo --largura 1440
```

Referência completa dos comandos: [SKILL.md](SKILL.md).

## Manter a documentação

`reference/` vem de duas skills locais (origem configurável) por `npm run sync-knowledge`, que remove marcas e arquivos proprietários na cópia. Depois: `npm run build && npm test`.

## Desenvolvimento

```sh
npm run typecheck
npm test
npm run build
```

Dependências de runtime: `playwright-core`, `pixelmatch` e `pngjs`.
