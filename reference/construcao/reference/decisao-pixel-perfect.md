# Pixel-perfect: decisão e protocolo

## Decisão 11 — Pixel-perfect é protocolo, não capricho

A implementação sai "quase" quando falta uma destas três coisas. Todas
obrigatórias:

**1. A ponte do Figma aberta.** Use o MCP **`figma-console`** (Southleft) —
plugin Figma Desktop Bridge + WebSocket local `:9223`, ferramentas
`mcp__figma-console__*`. **Não** o Dev Mode MCP oficial
(`mcp__plugin_figma_figma__*`, `mcp.figma.com`): aquele entrega design context
curado, este expõe a Plugin API crua, que é o que permite ler `lineHeight.unit`,
`strokeAlign` e `boundVariables` sem interpretação.

`figma_get_status({ probe: true })` precisa retornar sucesso. Sem ela, medir vira estimar por screenshot — e é daí que
nasce o "quase". Sem ponte: avisar e parar, não implementar.

**2. Token antes de px.** Ordem: `boundVariables` do nó → token `--ds-*` do
DS (**skill `seu-design-system`** — 197 tokens, 340 classes,
consultar sempre) → criar token se o valor repete 3+ vezes → só então literal,
com comentário. Medido em 2026-09-26: o projeto tinha **2,5% de cobertura por
token**, 456 valores px distintos e 154 cores hex hardcoded. Isso é
transcrição manual, e transcrição manual erra por 1px.

**3. Verificação numérica, não visual — com Playwright, sempre.** Nunca
concluir que bate sem ter medido. Harness no projeto:

```bash
npm run dev                       # o playwright.config nao sobe sozinho
npx playwright test pixel-perfect
```

- `scripts/pixel-perfect/spec.ts` — comparador puro (px, ratio, em, cor)
- `e2e/pixel-perfect.spec.ts` — lê `e2e/pixel-perfect/specs/*.figma.json` e
  mede `getComputedStyle` do DOM real
- Tolerância **zero** em espaçamento, tamanho e tipografia

Compara valor computado, não imagem: sem ruído de antialiasing, por isso a
tolerância pode ser zero. Diff de imagem entra só como rede secundária.

### Os cinco erros da primeira execução real (2026-09-26)

Todos com teste que falha hoje. Nenhum foi falta de informação — a fase de
verificação foi pulada.

1. **Container primeiro.** `max-width` + `margin-inline: auto` antes de medir
   qualquer filho. Sem isso o layout quebra inteiro, e nenhuma medida de filho
   adianta. Padding difere por breakpoint: o frame desktop costuma SER a caixa;
   o mobile vive num wrapper com padding — suba a cadeia de pais no Figma.
2. **Assets saem do `exportAsync`**, nunca "parecidos" do DAM. PNG 2x para
   imagem, SVG para ícone. Máx. 3 nós por chamada (timeout de 5s); o base64 é
   salvo em arquivo, decodifique de lá.
3. **Leia a estrutura, não só as medidas.** `fills: [{type:"IMAGE"}]` no frame
   = imagem é **fundo**, não `<img>` filho. O padding é do conteúdo sobreposto.
4. **Ícone do Figma já traz a moldura e o estado.** Não redesenhe borda/fundo
   em CSS — vira borda dupla.
5. **Token só entra se foi lido do bundle.** `grep -- "--ds-color-" bundle.css`.
   O dump do time pode ter nomes que não existem no publicado.

### O que o de-para numérico NÃO pega

Diff de computed style compara propriedade a propriedade — **não enxerga
sequência**. Um carrossel renderizado acima do título passa com 0 divergências.

Por isso todo spec declara `order`, verificado por `boundingBox`:

```json
"order": { "mobile": { "by": "y", "selectors": ["…título", "…picture", "…ul"] } }
```

`by: "y"` empilhado, `by: "x"` em linha. Seletor ausente é ignorado.

### Três regras do spec

- **Escopo:** todo seletor começa na raiz do componente
  (`[data-aue-model="grupo--nome"] …`). Sem isso o `.first()` pega outro
  componente da página.
- **Dois breakpoints, um spec:** `frames.mobile` sobrescreve **por
  propriedade**, não por grupo.
- **Tolerância zero ≠ igualdade de float:** `1.2 × 24 = 28.799999999999997`.
  O comparador usa `EPSILON_FLOAT = 1e-6` — absorve ruído IEEE754 e continua
  reprovando `0.001px` real.

### As armadilhas que mais custam

| Figma | CSS | Erro comum |
| --- | --- | --- |
| `lineHeight {PIXELS}` | `value / fontSize`, sem arredondar | 22px/16 = 1,375 virar 1,4 → +0,4px por linha |
| `lineHeight {AUTO}` | não declarar | Figma usa métrica da fonte; browser usa ~1,2 |
| `letterSpacing {PERCENT}` | `value / 100` em `em` | Escrever como `px` |
| `strokeAlign: INSIDE` | `border` + `box-sizing: border-box` | Sem border-box a caixa cresce 2×`strokeWeight` |
| `strokeAlign: OUTSIDE` | `outline` / `box-shadow` | `border` empurra o layout |
| Sizing **Fill** | `flex: 1 1 0%` | `flex-grow: 1` sozinho mantém `basis: auto` e muda o resultado |
| `padding` | ler os 4 lados | Assumir simétrico |
| Constraints | **não** são breakpoints | Inferir responsivo sem frame Mobile |

### Atomic Design

Átomo não conhece CMS (nada de `getEditorProps` em átomo) e **não tem margem
externa** — espaçamento é do pai via `gap`, igual ao auto-layout. Margem em
átomo é a causa nº 1 de espaçamento que não bate quando o componente é reusado.

### Design System

Storybook: `https://cdn.exemplo.com`
Índice consultável: `.../index.json` (553 entradas — o Storybook é SPA e não
responde a fetch simples; o JSON responde).

Tem ~70 componentes (HTML + Web Component) e `Utilities/Classes` com
Typography, Spacing, Colors, Border, Elevation, Gradients, zIndex.
**Conferir o DS antes de reimplementar qualquer coisa.** Prefixo de token:
`--ds-*`.

### Conduta obrigatória

1. **Sem ponte, sem implementação.** Falhou o probe, avisar e parar.
2. **Não medi, não escrevo.** Dizer "não consegui medir X" em vez de estimar
   um valor plausível. Estimativa plausível é indistinguível de medição até
   alguém conferir — foi essa a causa real do "quase".
3. **Nunca arredondar** `line-height`.
4. **Divergência é declarada antes**, não descoberta depois.
5. **Relatório numérico ao entregar**, não "ficou igual ao Figma".

### Fronteira honesta

0px é exigível em espaçamento, tamanho, cor, raio, borda e valores
tipográficos declarados. **Não** é possível em rasterização de glifo — Figma
tem motor de texto próprio, o browser usa o do SO. Diferença sub-pixel de
antialiasing não é defeito. Tudo fora disso é obrigação.

Protocolo completo de 5 fases, plano de 4 fases para automatizar a
verificação, tabela de tradução Figma→CSS e checklist:
`reference/padrao-pixel-perfect.md`.

---

