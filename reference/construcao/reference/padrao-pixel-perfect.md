# Protocolo Pixel-Perfect — Figma → React/TypeScript/CSS Modules

> Status: **v1 — em convergência**
> Última revisão: 2026-09-26
> Escopo: projeto Next.js + AEM (`seu-projeto`)
> Documentos irmãos: [`padrao-listas-e-subitems.md`](../../autoria/reference/padrao-listas-e-subitems.md) · [`padrao-seo-texto.md`](../../autoria/reference/padrao-seo-texto.md) · [`padrao-content-fragments.md`](../../autoria/reference/padrao-content-fragments.md)

## Por que fica "quase"

Este documento existe por causa de um feedback específico: a implementação sai
**quase** igual ao Figma, e quase não serve. Antes de propor método, o
diagnóstico — medido nos 175 CSS Modules do projeto:

| Métrica                   | Valor            | O que deveria ser            |
| ------------------------- | ---------------- | ---------------------------- |
| Declarações CSS totais    | 15.368           | —                            |
| Usos de `var(--token)`    | 387              | —                            |
| **Cobertura por token**   | **2,5%**         | > 60%                        |
| Valores `px` distintos    | **456**          | 8–12 (escala de espaçamento) |
| Cores hex distintas       | **154**          | ~20 (paleta)                 |
| `font-size` distintos     | **82**           | ~8 (escala tipográfica)      |
| `line-height` sem unidade | 236 de 453 (52%) | ver abaixo                   |

456 valores de espaçamento distintos não é estilo — é **transcrição manual**.
Cada componente foi medido à mão, um valor por vez. Transcrição manual não
falha de forma grosseira; falha por 1px, 2px, meio ponto de line-height. É
exatamente a definição de "quase".

E `#0055ff` — a cor da marca — aparece **166 vezes hardcoded**, enquanto
`var(--ds-color-primary)` aparece 18. O token existe. Quase ninguém usa.

### A matemática do "quase"

O erro mais caro é o `line-height`, e é demonstrável.

A API do Figma retorna line-height como objeto com unidade:
`{ value, unit: "PIXELS" | "PERCENT" }` ou `{ unit: "AUTO" }`
([LineHeight](https://www.figma.com/plugin-docs/api/LineHeight/)).

Suponha um parágrafo: `fontSize: 16`, `lineHeight: { value: 22, unit: "PIXELS" }`.

| Implementação                    | Altura da linha | Erro por linha |
| -------------------------------- | --------------- | -------------- |
| `line-height: 22px`              | 22,0px          | 0              |
| `line-height: 1.375`             | 22,0px          | 0              |
| `line-height: 1.4` ← arredondado | 22,4px          | **+0,4px**     |

Em um parágrafo de 6 linhas, 0,4px vira **2,4px de deriva**. O texto abaixo
desce. O card fica mais alto. A seção inteira "não bate" — e nenhum valor
isolado está visivelmente errado. É por isso que o erro é difícil de achar
olhando.

**Regra:** `lineHeight.unit === "PIXELS"` → `value / fontSize`, **sem
arredondar**. `unit === "PERCENT"` → `value / 100`. `unit === "AUTO"` → não
declarar `line-height` (deixa o browser usar o default da fonte) e **registrar
isso**, porque AUTO no Figma usa a métrica da fonte, que não é 1,2 do browser.

---

## Qual MCP do Figma — são dois, e não é indiferente

Esta sessão tem **duas** integrações com Figma. O protocolo abaixo usa a
primeira. Confundir as duas é perder tempo.

| MCP                           | Identificador                | Como conecta                                              | Papel                                                                                             |
| ----------------------------- | ---------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| **figma-console** (Southleft) | `mcp__figma-console__*`      | Plugin **Figma Desktop Bridge** + WebSocket local `:9223` | **Este protocolo.** Plugin API crua: valores exatos do nó, variables, parity, screenshot, escrita |
| Figma Dev Mode MCP (oficial)  | `mcp__plugin_figma_figma__*` | HTTP `https://mcp.figma.com`, exige OAuth                 | `get_design_context`, Code Connect. Contexto curado, não medição crua                             |

**Para pixel-perfect, use o figma-console.** A razão é direta: ele expõe a
Plugin API sem intermediário (`figma_execute`, `figma_get_variables`,
`figma_get_component_for_development`), então dá pra ler `lineHeight.unit`,
`strokeAlign`, `boundVariables` e `paddingLeft` exatamente como o arquivo tem.
O MCP oficial entrega um "design context" já interpretado — mais conveniente
para gerar um primeiro esboço, menos adequado quando o requisito é 0px de
divergência.

Instalação no ambiente (verificado em 2026-09-26):

- `figma-console` → a configuração de MCP da sua ferramenta, via `npx`, plugin em
  `~/.figma-console-mcp/plugin/`
- `plugin:figma:figma` → instalado, **não autenticado**. Requer OAuth antes de
  qualquer uso.

---

## Pré-requisito: a ponte do Figma precisa estar aberta

Sem a bridge, a extração vira leitura de screenshot — e leitura de screenshot
é estimativa, não medição. **Toda vez que a implementação saiu "quase", vale
checar se a ponte estava de pé.**

```
figma_get_status({ probe: true })
```

Se retornar `"No active file connected"`:

1. Abrir o Figma **Desktop** com o arquivo alvo
2. Plugins → Development → **Figma Desktop Bridge**
3. Run
4. Esperar ~3s e rodar `figma_get_status({ probe: true })` de novo

Manifest: `~/.figma-console-mcp/plugin/manifest.json`

> **Regra dura:** sem `probeResult.success === true`, não começar a
> implementar. Dizer que a ponte está fora e parar. Implementar por screenshot
> é o que produz o "quase".

---

## O protocolo — 5 fases

Nenhuma fase é opcional. A fase 4 é a que hoje não existe, e é a que fecha o
"quase".

```
1. EXTRAIR   → valores autoritativos do nó, nunca do screenshot
2. MAPEAR    → valor bruto vira token; só o que não é token vira px
3. IMPLEMENTAR → CSS Module + atomic
4. VERIFICAR → diff visual + parity check, não "olhar e achar parecido"
5. REGISTRAR → o que divergiu e por quê
```

### Fase 1 — Extrair

```
figma_get_component_for_development({ nodeId, fileUrl, codebasePath })
```

Traz árvore profunda (depth 4), `boundVariables` (quais tokens o designer
amarrou), `reactions`, `layoutSizing`, `autoResize`, constraints e imagem 2x.

Complementar com:

```
figma_get_variables()      → resolve IDs de variável para nome + valor
figma_get_text_styles()    → escala tipográfica declarada
figma_get_styles()         → cores e efeitos como estilos
```

**O que extrair sempre, por nó:**

| Grupo       | Propriedades                                                                                                                                      |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Caixa       | `absoluteBoundingBox` (x, y, w, h), `layoutSizingHorizontal`, `layoutSizingVertical`, `minWidth`, `maxWidth`                                      |
| Auto-layout | `layoutMode`, `itemSpacing`, `counterAxisSpacing`, `paddingTop/Right/Bottom/Left`, `primaryAxisAlignItems`, `counterAxisAlignItems`, `layoutWrap` |
| Texto       | `fontSize`, `fontName.family`, `fontName.style`, `lineHeight`, `letterSpacing`, `textCase`, `textDecoration`, `autoResize`, `textAlignHorizontal` |
| Pintura     | `fills`, `strokes`, `strokeWeight`, `strokeAlign`, `opacity`, `blendMode`                                                                         |
| Forma       | `cornerRadius` ou os 4 cantos, `effects`                                                                                                          |
| Token       | `boundVariables` — **prioridade máxima**, ver Fase 2                                                                                              |

**Nunca** derivar valor de screenshot. Screenshot serve pra conferir, não pra
medir.

### Fase 2 — Mapear para token antes de escrever px

Esta é a fase que não existe hoje, e é a causa dos 456 valores distintos.

Ordem de precedência:

1. O nó tem `boundVariables` para essa propriedade? → usar o token
   correspondente no CSS
2. Existe token equivalente no DS (`--ds-*`)? → usar
3. O valor se repete em 3+ lugares do projeto? → **criar token** antes de usar
4. Só então → valor literal, com comentário dizendo por que não é token

> Um valor literal que aparece uma vez é um valor. Um valor literal que
> aparece quarenta vezes é um token que ninguém criou.

### Fase 3 — Implementar

CSS Module + Atomic Design (ver seções abaixo). Traduzir com a tabela da
próxima seção — a maioria dos erros de 1–2px nasce aqui.

### Fase 4 — Verificar (a fase que falta)

Sem esta fase, o "quase" só é descoberto por você, depois, manualmente. Duas
verificações, nesta ordem:

**4a. Parity check estrutural**

```
figma_check_design_parity({
  nodeId,
  codeSpec: { filePath, typography: {...}, spacing: {...}, visual: {...},
              tokens: { usedTokens, hardcodedValues } },
  canonicalSource: "design",
})
```

Retorna score de paridade, discrepâncias categorizadas e itens de correção.
Compara número com número — não depende de olho.

**4b. Diff visual**

```
figma_capture_screenshot({ nodeId })   → referência
```

Renderizar o componente na mesma largura do frame do Figma, capturar, e
comparar as duas imagens. Diferença aceitável: **0px em espaçamentos e
tamanhos**; antialiasing de texto pode divergir.

> Se não for possível gerar o diff automaticamente, sobrepor as duas imagens
> com `difference` no editor de imagem ainda é melhor que olhar lado a lado.
> Comparação lado a lado não detecta 2px. Sobreposição detecta.

### Fase 5 — Registrar

Toda divergência intencional (ex: o Figma pede algo que quebra acessibilidade,
ou o DS não tem o token) vira comentário no CSS Module **e** linha na seção de
aprendizados deste documento. Divergência não registrada volta como bug.

---

## Tabela de tradução Figma → CSS

A maior fonte de erro silencioso. Cada linha aqui já causou um "quase".

### Auto-layout

| Figma                          | CSS                                     | Armadilha                                                                                                                      |
| ------------------------------ | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `layoutMode: "HORIZONTAL"`     | `display: flex; flex-direction: row`    | —                                                                                                                              |
| `layoutMode: "VERTICAL"`       | `display: flex; flex-direction: column` | —                                                                                                                              |
| `itemSpacing`                  | `gap`                                   | Com `layoutWrap`, `counterAxisSpacing` vira `row-gap`                                                                          |
| `paddingLeft/Right/Top/Bottom` | `padding`                               | **Nunca assumir simétrico** — ler os 4                                                                                         |
| `primaryAxisAlignItems`        | `justify-content`                       | `SPACE_BETWEEN` → `space-between`                                                                                              |
| `counterAxisAlignItems`        | `align-items`                           | `BASELINE` existe nos dois                                                                                                     |
| Sizing **Fixed**               | `width: <N>px`                          | —                                                                                                                              |
| Sizing **Hug**                 | `width: fit-content` / `flex: 0 0 auto` | —                                                                                                                              |
| Sizing **Fill**                | `flex: 1 1 0%`                          | `flex: 1` usa `flex-basis: 0%` — igual, mas seja explícito. `flex-grow: 1` sozinho mantém `basis: auto` e **muda o resultado** |

### Texto

| Figma                            | CSS                             | Armadilha                                                  |
| -------------------------------- | ------------------------------- | ---------------------------------------------------------- |
| `fontSize`                       | `font-size`                     | —                                                          |
| `fontName.style`                 | `font-weight`                   | "Medium" ≠ sempre 500 — conferir o `@font-face` registrado |
| `lineHeight {PIXELS}`            | `value / fontSize` unitless     | **Não arredondar** (ver matemática acima)                  |
| `lineHeight {PERCENT}`           | `value / 100`                   | —                                                          |
| `lineHeight {AUTO}`              | não declarar                    | Figma usa métrica da fonte, browser usa ~1,2 — divergem    |
| `letterSpacing {PIXELS}`         | `<value>px`                     | —                                                          |
| `letterSpacing {PERCENT}`        | `<value / 100>em`               | Percent no Figma é relativo ao fontSize = `em`             |
| `textCase: "UPPER"`              | `text-transform: uppercase`     | Muda a largura — não converter no conteúdo                 |
| `autoResize: "WIDTH_AND_HEIGHT"` | `width: fit-content`            | —                                                          |
| `autoResize: "HEIGHT"`           | largura fixa, altura automática | —                                                          |

### Traço, borda e efeito

| Figma                      | CSS                                        | Armadilha                                                                  |
| -------------------------- | ------------------------------------------ | -------------------------------------------------------------------------- |
| `strokeAlign: "INSIDE"`    | `border` + `box-sizing: border-box`        | Sem `border-box`, a borda **aumenta** a caixa em 2×`strokeWeight`          |
| `strokeAlign: "OUTSIDE"`   | `outline` ou `box-shadow: 0 0 0 Npx <cor>` | `border` empurra o layout; `outline` não                                   |
| `strokeAlign: "CENTER"`    | não tem equivalente                        | Decidir e **registrar** (Fase 5)                                           |
| `effects: DROP_SHADOW`     | `box-shadow: X Y blur spread cor`          | `spread` costuma ser esquecido                                             |
| `effects: BACKGROUND_BLUR` | `backdrop-filter: blur()`                  | Precisa de fundo semitransparente                                          |
| `cornerRadius` individual  | `border-radius: TL TR BR BL`               | Ordem diferente da do Figma                                                |
| `opacity` do nó            | `opacity`                                  | ≠ opacidade do `fill` — o fill só afeta a cor                              |
| Gradiente linear           | `linear-gradient(<deg>, …)`                | `gradientTransform` do Figma **não** é grau de CSS — converter, não chutar |

### Responsivo

Constraints do Figma descrevem o comportamento do frame, não breakpoints.
**Não inferir breakpoint de constraint.** Se o Figma não tem frame para aquela
largura, perguntar — não inventar.

Quando houver frames Desktop e Mobile, extrair **os dois** e comparar campo a
campo. Erro recorrente já registrado no projeto: usar o `line-height` do
desktop no mobile quando são 140% e 120%.

---

## Design System

**Storybook:** https://cdn.exemplo.com

**Consulta programática** (o Storybook é SPA e não responde a fetch simples;
o índice, sim):

```bash
curl -s https://cdn.exemplo.com
```

553 entradas. Estrutura:

| Seção                       | Conteúdo                                                                                                                                                                         |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DesignSystem/Components/*` | ~70 componentes, cada um em **HTML** e **Web Component**                                                                                                                         |
| `Utilities/Classes/*`       | `Typography`, `Spacing`, `Colors`, `ColorCombinations`, `Border`, `Elevation`, `Gradients`, `Glassmorphism`, `Opacity`, `Scrollbar`, `zIndex`, `Waves`, `Flex`, `SkeletonLoader` |
| `DesignSystem/Templates/*`  | Composições prontas (Cards, Feedback, Calendar, Filter flow)                                                                                                                     |
| `DesignSystem/Services/*`   | `BodyScrollManager`, `ComponentToggle`, `InfiniteScroll`, `Instances`                                                                                                            |
| `Images/*`                  | Icons, Logos, Flags, Illustration, Animation                                                                                                                                     |

**Antes de criar qualquer coisa, procurar em `Utilities/Classes` e em
`Components`.** O DS já tem Accordion, Carousel, Card, Tabs, Modal, Breadcrumbs,
Pagination, Tag, TextLink, Table, Timeline — vários dos quais o projeto
reimplementou.

O prefixo de token é `--ds-*` (`--ds-color-primary`,
`--ds-font-family-primary`, `--ds-color-cta`). O projeto já carrega esses
tokens, mas `globals.css` **não declara nenhuma custom property própria** — o
que explica os 154 hex hardcoded.

---

## Atomic Design no projeto

A estrutura já existe em `src/frontend/components/sections/ui/`:

```
atoms/        elemento indivisível — CardImage, SearchButton
molecules/    átomos combinados — SectionHeader, PartnerCard, FeatureColumn
organisms/    molécula + contexto — CardOverlayImage, CardProduct
sections/     organismo + dados do CMS + instrumentação UE
```

Regras:

- **Átomo não conhece CMS.** Nada de `getEditorProps` dentro de átomo —
  instrumentação entra no organism ou na section.
- **Átomo não tem margem externa.** Espaçamento é responsabilidade do pai
  (`gap`), igual ao auto-layout do Figma. Margem em átomo é a causa nº 1 de
  espaçamento que "não bate" quando o componente é reusado.
- **Um átomo = um nó do Figma.** Se no Figma é um componente, no código é um
  átomo. Se a hierarquia diverge, a tradução vira adivinhação.
- **Variação de átomo é prop, não novo átomo** — desde que o contrato de
  campos não mude (mesma regra da Decisão 2 em
  [`padrao-listas-e-subitems.md`](../../autoria/reference/padrao-listas-e-subitems.md)).

---

## CSS moderno aplicável

| Recurso              | Uso                              | Por que importa aqui                                         |
| -------------------- | -------------------------------- | ------------------------------------------------------------ |
| Custom properties    | Camada de token                  | Resolve os 456 px distintos                                  |
| `clamp()`            | Tipografia e espaçamento fluidos | Só quando o Figma tem 2+ frames; com um frame só, é invenção |
| Container queries    | Componente responde ao container | Card em grid de 2 ou 4 colunas sem media query               |
| Propriedades lógicas | `padding-inline`, `margin-block` | Já em uso (`--section-padding-inline`)                       |
| CSS nesting nativo   | Aninhar dentro do Module         | Menos repetição de seletor                                   |
| `:has()`             | Estado do pai pelo filho         | Substitui classe extra em JS                                 |
| `subgrid`            | Alinhar linhas entre cards       | Cards de alturas diferentes alinhando título/botão           |
| `aspect-ratio`       | Imagem sem CLS                   | Figma dá w/h do frame de imagem                              |
| `text-wrap: balance` | Títulos                          | Cuidado: muda a quebra vs Figma — só onde o design permite   |

Antes de usar qualquer um, conferir suporte para a matriz de browsers do
portal. `subgrid` e `text-wrap: balance` são os mais recentes da lista.

---

## Checklist pixel-perfect por componente

**Antes**

- [ ] `figma_get_status({ probe: true })` retornou sucesso
- [ ] Frames Desktop **e** Mobile identificados (ou ausência confirmada)
- [ ] `figma_get_component_for_development` rodado com `codebasePath`
- [ ] `boundVariables` lidos e resolvidos com `figma_get_variables`

**Durante**

- [ ] Nenhum valor veio de screenshot
- [ ] `line-height` calculado sem arredondar
- [ ] `letterSpacing` PERCENT convertido para `em`
- [ ] Os 4 paddings lidos individualmente
- [ ] Hug/Fill/Fixed traduzidos com `flex` explícito
- [ ] `strokeAlign` conferido antes de escrever `border`
- [ ] Todo valor repetido 3+ vezes virou token
- [ ] Componente do DS conferido antes de reimplementar
- [ ] Átomo sem margem externa e sem `getEditorProps`

**Depois**

- [ ] `figma_check_design_parity` rodado, score registrado
- [ ] Screenshot do código comparado por sobreposição, não lado a lado
- [ ] Divergências intencionais comentadas no CSS e registradas abaixo

---

## Regra inegociável — validar com Playwright, sempre

**Nunca concluir que algo bate sem ter medido.** Não existe "ficou igual ao
Figma" baseado em olhar. Toda entrega passa pelo de-para:

```
Figma (spec)  ←→  Playwright (getComputedStyle do DOM real)
```

O harness está em:

| Caminho                                        | Papel                                        |
| ---------------------------------------------- | -------------------------------------------- |
| `scripts/pixel-perfect/spec.ts`                | Tipos + comparador puro (px, ratio, em, cor) |
| `scripts/pixel-perfect/__tests__/spec.test.ts` | 18 testes do comparador                      |
| `e2e/pixel-perfect.spec.ts`                    | Runner Playwright — lê os specs e mede o DOM |
| `e2e/pixel-perfect/specs/*.figma.json`         | Um spec por componente, versionado           |

### Como rodar

```bash
npm run dev                      # em outro terminal — o config nao sobe sozinho
npx playwright test pixel-perfect
```

### O que ele reporta

Sem tolerância em espaçamento, tamanho e tipografia. Saída real do formato:

```
✗ SectionHeader @ desktop (1440px) — 12 propriedades comparadas
  2 divergências:
    [data-testid='section-header'] · paddingLeft
      esperado 24px
      recebido 23px  Δ 1px
    [data-testid='section-header'] h2 · lineHeight
      esperado 40px (1.25 × 32px)
      recebido 44.8px  Δ 4.8px
```

Compara **valor computado**, não imagem — por isso não tem ruído de
antialiasing e por isso a tolerância é zero. Cores do browser (`rgb(...)`) são
normalizadas para hex antes de comparar com o Figma.

### O contrato do spec

`e2e/pixel-perfect/specs/EXEMPLO.figma.json.template` tem o formato completo.
Cada valor carrega sua unidade e sua origem:

```json
"lineHeight": {
  "value": 1.25, "unit": "ratio", "source": "figma",
  "note": "40px / 32px — nao arredondar"
}
```

`unit` pode ser `px`, `ratio` (line-height), `em` (letter-spacing) ou `color`.
`source` é `figma` ou `manual` — e `manual` exige `note` explicando por quê.

O spec é **commitado**. Quando o design muda, o diff aparece no PR. Hoje
mudança de design é invisível no code review.

---

## Como chegar lá — o plano honesto

### Onde 0px é possível, e onde não é

Prometer o impossível é a outra forma de entregar "quase". A fronteira:

| Categoria                                                   | 0px é possível?                                                                      |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Espaçamento, padding, gap, margens                          | ✅ **Sim, sempre.** É número contra número                                           |
| Largura, altura, max-width, aspect-ratio                    | ✅ Sim                                                                               |
| Cor, opacidade, raio, borda, sombra                         | ✅ Sim                                                                               |
| `font-size`, `font-weight`, `line-height`, `letter-spacing` | ✅ Sim — os valores declarados batem exatamente                                      |
| **Rasterização do glifo** (antialiasing do texto)           | ❌ **Não.** Figma tem motor de texto próprio; o browser usa o do sistema operacional |
| Largura final de uma linha de texto                         | ⚠️ Pode variar ~1px por causa do item acima                                          |
| Comportamento entre breakpoints sem frame                   | ❌ Não existe no design — é invenção                                                 |

**O compromisso que dá pra cobrar:** toda caixa, todo espaçamento e todo valor
declarado fecha em **0px**. A diferença de antialiasing de texto não é defeito
e não é corrigível por nenhum dos dois lados.

Tudo fora dessa fronteira — e são 95% dos casos — é obrigação.

### Por que "quase" ainda passa hoje

Porque **nada falha**. Não existe nenhum ponto no fluxo em que uma divergência
de 2px pare o trabalho. O único detector é você, olhando, depois. Detector
humano no fim da esteira é o desenho mais caro possível.

A solução não é "prestar mais atenção". É **colocar um detector no meio da
esteira**.

### A ideia que muda o jogo: comparar valor computado, não imagem

Diff de imagem parece a resposta óbvia, mas tem um defeito fatal: o ruído de
antialiasing gera falha falsa, as pessoas sobem a tolerância pra parar de
reclamar, e a tolerância engole os 2px reais. Diff de imagem sozinho sempre
degenera.

A comparação exata é outra:

```
Figma node  →  spec.json  →  Playwright lê getComputedStyle do DOM real  →  diff numérico
```

O resultado não é "as imagens diferem em 0,4%". É:

```
✗ SectionHeader > .title
    padding-left   esperado 24px   recebido 23px
    line-height    esperado 22px   recebido 22.4px
```

Acionável, determinístico, sem ruído. Diff de imagem entra depois, como rede
secundária pra o que o computed style não pega (gradiente, sobreposição de
sombra, ordem de camada).

### As 4 fases

**Fase A — Camada de token** _(bloqueia tudo)_

`globals.css` não declara nenhuma custom property. Enquanto isso for verdade,
cada valor é uma transcrição manual e a taxa de erro é constante.

Saída: `src/app/tokens.css` com a escala derivada do Figma
(`figma_export_tokens` → DTCG → CSS vars) mapeada sobre `--ds-*`. Meta
realista: espaçamento, tipografia e cor. **Não** tokenizar tudo de uma vez.

**Fase B — Spec versionado por componente**

Ao lado de cada componente, um `<Componente>.figma.json` **commitado**:

```json
{
  "nodeId": "695:313",
  "fileUrl": "https://figma.com/design/...",
  "extractedAt": "2026-09-26",
  "frames": { "desktop": 1440, "mobile": 390 },
  "elements": {
    ".root": {
      "paddingTop": 64,
      "paddingInline": 24,
      "gap": 32,
      "maxWidth": 1200
    },
    ".title": {
      "fontSize": 32,
      "lineHeight": 1.25,
      "letterSpacing": -0.32,
      "fontWeight": 600
    }
  }
}
```

Vira a fonte de verdade versionada. Quando o design muda, o diff do spec
aparece no PR — hoje uma mudança de design é invisível no code review.

**Fase C — Teste que falha** _(o detector)_

Playwright já está configurado (`playwright.config.ts`, viewport 1440×1200) e
o Storybook 10 já está no projeto. Falta o teste:

```ts
// e2e/pixel-perfect.spec.ts (esboço)
for (const [selector, expected] of Object.entries(spec.elements)) {
  const el = page.locator(selector);
  const computed = await el.evaluate((n) => {
    const c = getComputedStyle(n);
    const r = n.getBoundingClientRect();
    return {
      paddingTop: c.paddingTop,
      gap: c.gap,
      fontSize: c.fontSize,
      lineHeight: c.lineHeight,
      width: r.width,
      height: r.height,
    };
  });
  expect(px(computed.paddingTop)).toBe(expected.paddingTop); // 0px de tolerância
}
```

Renderizar o componente isolado via Storybook, na largura exata do frame do
Figma. Sem tolerância em espaçamento e tamanho.

**Fase D — Diff de imagem como rede secundária**

`toHaveScreenshot` do Playwright contra a referência do
`figma_capture_screenshot`, com tolerância **só** para antialiasing de texto.
Entra depois da Fase C, nunca no lugar dela.

### O que eu me comprometo a fazer diferente

A causa real do "quase" não foi desatenção. Foi eu **preencher lacuna com
valor plausível em silêncio**. Quando não conseguia medir, eu estimava — e
estimativa plausível é indistinguível de medição até você conferir.

A partir daqui:

1. **Sem ponte, sem implementação.** `figma_get_status({ probe: true })`
   primeiro. Falhou, eu aviso e paro.
2. **Não medi, não escrevo.** Se uma propriedade não está no nó, eu digo
   "não consegui medir X" em vez de chutar um valor que parece certo.
3. **Nunca arredondar.** `line-height` é `value / fontSize`. 1.375 fica 1.375.
4. **Divergência é sempre declarada.** Se o Figma pede algo que o CSS não faz
   (`strokeAlign: CENTER`), eu falo antes, não depois.
5. **Relatório numérico ao entregar.** Não "ficou igual ao Figma", e sim a
   tabela de propriedades comparadas e o que divergiu.

---

## Post-mortem — primeira execução do protocolo (2026-09-26)

Componente `global/portfolio`, do zero, a partir do nó Figma `4183:4006`.
A primeira entrega saiu com o **layout quebrado**. Nenhuma das causas foi
falta de informação: as medidas estavam certas e o protocolo estava escrito.
**A fase 4 (verificação) foi pulada.**

Os cinco erros viraram as cinco regras abaixo. Todos têm agora um teste que
falha, não uma recomendação.

### 1. Container antes de qualquer outra medida

**Erro:** a seção não tinha `max-width` nem `margin-inline: auto`. Renderizou
com 1440 de largura num design de 1136 — a mídia sangrava na borda e os cards
espalhavam.

**Regra:** a **primeira** linha do CSS raiz de uma seção é a caixa. Antes de
medir qualquer filho, confira: qual é a largura do frame no Figma, e qual é o
container equivalente no projeto? Neste repositório o padrão é
`max-width: 1136px; margin-inline: auto`, como em `sections/media-text/v1`.

**Padding é diferente por breakpoint.** O frame Figma de desktop (1136) **é**
a caixa de conteúdo, sem padding. O de mobile (312) vive dentro de um wrapper
de 360 com `padding: 24` — o padding pertence ao wrapper, não ao frame. Subir
a cadeia de pais no Figma responde isso:

```js
let cur = node;
for (let i = 0; i < 5 && cur; i++) {
  /* w, paddings */ cur = cur.parent;
}
```

### 2. Exportar os assets do Figma, nunca "escolher parecidos" no DAM

**Erro:** apontei o componente para imagens aleatórias que já existiam no DAM.

**Regra:** os assets saem do próprio nó, via `exportAsync`, e sobem para uma
pasta dedicada no DAM.

```js
const bytes = await node.exportAsync({
  format: "PNG",
  constraint: { type: "SCALE", value: 2 },
});
// ícones: { format: "SVG" }
```

O retorno em base64 estoura o limite da ferramenta e é **salvo em arquivo** —
decodifique de lá com um script, sem trazer para o contexto. Exporte no máximo
3 nós por chamada (o plugin tem timeout de 5s).

Ícone que exporta com ~150 bytes está vazio: o `fill` de imagem não
rasterizou naquele nó. Use outro nó que compartilhe o mesmo `imageRef`.

Upload:

```bash
curl -sk -u user:pass -X POST "https://HOST/content/dam/<pasta>.createasset.html" \
  -F "file=@arquivo.png" -F "fileName=arquivo.png"
```

### 3. Ler a ESTRUTURA do nó, não só as medidas

**Erro:** tratei a imagem do card como `<img>` dentro de um bloco com padding.
No Figma ela é `fills: [{ type: "IMAGE" }]` **do frame** — o padding pertence
ao conteúdo que se sobrepõe à imagem, não à imagem.

**Regra:** antes de escrever o JSX, responda para cada bloco:

| Pergunta no nó                          | Consequência no código                     |
| --------------------------------------- | ------------------------------------------ |
| `fills` tem `type: "IMAGE"`?            | A imagem é **fundo** do bloco, não filho   |
| Quais `children` estão `visible: true`? | Só esses viram DOM                         |
| O `padding` é do frame com a imagem?    | Então é padding do **conteúdo sobreposto** |

### 4. Ícone exportado do Figma já traz o estado — não redesenhe em CSS

**Erro:** dei `border` e `background` de CSS às setas do carrossel. O SVG
exportado já continha o círculo, a borda `#A7A8AC` (desabilitada) e o fundo
`#900F15` (ativa). Resultado: borda dupla.

**Regra:** abra o SVG exportado antes de escrever o CSS. Se ele já desenha a
moldura, o botão é só área clicável: `border: 0; background: transparent;
padding: 0`.

### 5. Verificar o nome do token no BUNDLE, não no dump

**Erro:** usei `--ds-color-institucional-secundario`. Esse nome existe no
dump de tokens do time, mas **não existe** nos bundles publicados `1.32.4` nem
`1.33.6`. `rgb(var(--inexistente))` é inválido e o texto caiu para preto.

Eu havia documentado a armadilha ("nomes com acento não resolvem") e ainda
assim **inventei** a grafia corrigida em vez de conferir.

**Regra:** token que não foi lido do bundle não entra no CSS.

```bash
grep -oE -- "--ds-color-[a-z-]*" design-system.bundle.min.css | sort -u
```

Sem token: literal + comentário dizendo qual bundle foi consultado e quando.

---

## O que o de-para numérico NÃO pega

Descoberto na mesma rodada, e é a limitação mais importante do método.

O diff de computed style compara **propriedade a propriedade**. Ele não
enxerga **sequência**. No mobile, o carrossel renderizou **acima** do título
— e o teste passou com **0 divergências**, porque cada propriedade estava
correta.

Causa: `display: contents` dissolve o wrapper, os filhos viram irmãos do
carrossel, e o carrossel herda `order: 0`.

**Correção no harness:** o spec ganhou a seção `order`, verificada por posição
real (`boundingBox`):

```json
"order": {
  "mobile": { "by": "y", "selectors": ["…eyebrow", "…title", "… picture", "…paragraph", "… ul"] },
  "desktop": { "by": "x", "selectors": ["…title", "… picture"] }
}
```

`by: "y"` para empilhamento, `by: "x"` para linha. Seletor ausente na página é
ignorado, então o mesmo spec serve aos dois breakpoints.

> **Regra:** todo spec declara `order`. Componente com variação de ordem
> (`mobileOrder`, `mediaPosition`) declara uma entrada por frame.

---

## Dois breakpoints num spec só

Título é 32px no desktop e 24px no mobile. O spec expressa isso com
`frames`, que sobrescreve **por propriedade** — declarar `fontSize` no mobile
não apaga o `lineHeight` da base:

```json
{
  "selector": "…[data-aue-prop=\"title\"]",
  "typography": { "fontSize": { "value": 32, … }, "lineHeight": { "value": 1.2, … } },
  "frames": { "mobile": { "typography": { "fontSize": { "value": 24, … } } } }
}
```

---

## Tolerância zero ≠ igualdade de float

`1.2 × 24` dá `28.799999999999997` em IEEE754, não `28.8`. A primeira rodada
reprovou com **`Δ 0px`** — ruído de representação, não divergência de design.

O comparador usa `EPSILON_FLOAT = 1e-6`. Isso **não é tolerância**: uma
divergência real de `0.001px` continua reprovando, e o caso clássico do
`line-height` arredondado (`Δ 0.4px`) também. Há teste para os três casos.

---

## Escopar o seletor na raiz do componente

A primeira rodada acusou `fontSize 48px` e cor branca no título. Não era o
componente: `[data-aue-prop="title"]` casou com o **banner** da página, que
vem antes no DOM, e o runner usa `.first()`.

**Regra:** todo seletor do spec começa pela raiz do componente.

```
[data-aue-model="global--portfolio"] [data-aue-prop="title"]
```

---

## Resultado da execução

```
✓ global/portfolio @ desktop (1440px) — 27 propriedades comparadas
  0 divergências — pixel-perfect
✓ global/portfolio @ mobile (360px) — 24 propriedades + 5 blocos de ordem
  0 divergências — pixel-perfect
```

Medido: largura da seção, caixa do destaque, gaps (24/32/116/16/32), mídia
(560×290 desktop, 312×198 mobile), card 272, tipografia dos 5 blocos de texto
(tamanho, `line-height` exato, peso, cor) e a ordem visual nos dois
breakpoints.

---

## Aprendizados registrados

Herdados de `construcao/RESUMO.md` §8, confirmados:

- **Line-height desktop ≠ mobile.** 140% e 120% no mesmo componente, entre
  frames diferentes. Extrair os dois frames.
- **`"SuaFonte Sans"` e `"SuaFonte"` são dois `@font-face` distintos** em
  `globals.css`, cobrindo pesos diferentes. Conferir cobertura de peso antes
  de assumir fallback.
- **`<button>` não herda `cursor: pointer`** (diferente de `<a href>`).
  Explicitar no CSS.
- **Empate de especificidade entre CSS Modules** é resolvido pela ordem do
  bundle — ver §9 de `construcao/RESUMO.md`.

---

## EM ABERTO

1. **Camada de token do projeto** — `globals.css` não declara custom
   properties. Definir se a escala nasce de `figma_export_tokens` /
   `figma_ds_extract_tokens` (DTCG → CSS vars) ou de mapeamento manual sobre
   `--ds-*`. É a decisão que destrava os 2,5%.
2. **Diff visual automatizado** — hoje não há passo de comparação por imagem no
   fluxo. Avaliar Playwright (já no projeto, `playwright.config.ts`) com
   screenshot comparison contra a referência do Figma.
3. **Matriz de browsers** — `subgrid`, `text-wrap: balance` e container queries
   dependem dela, e ela não está documentada.
4. **Componentes do DS reimplementados** — levantar quais dos ~70 do Design System já
   foram refeitos à mão no projeto e por quê.

---

## Fontes consultadas

**Figma — documentação oficial**

- [LineHeight — Plugin API](https://www.figma.com/plugin-docs/api/LineHeight/) — objeto `{ value, unit: "PIXELS" | "PERCENT" }` ou `{ unit: "AUTO" }`
- [LetterSpacing — Plugin API](https://www.figma.com/plugin-docs/api/LetterSpacing/) — mesma estrutura de unidade
- [Explore text properties — Figma Help](https://help.figma.com/hc/en-us/articles/360039956634-Explore-text-properties) — semântica de tracking e leading

**Ferramentas usadas no protocolo** — `figma-console-mcp` (Southleft), via plugin Figma Desktop Bridge

- `figma_get_status` — saúde da ponte
- `figma_get_component_for_development` — árvore profunda + `boundVariables` + imagem 2x
- `figma_get_variables`, `figma_get_text_styles`, `figma_get_styles` — resolução de token
- `figma_check_design_parity` — comparação numérica design × código
- `figma_capture_screenshot` — referência visual
- `figma_execute` — Plugin API crua, quando nenhum tool dedicado cobre a propriedade
- `figma_export_tokens`, `figma_ds_extract_tokens` — DTCG / CSS vars
- `figma_navigate` com `lock: true` — fixa o arquivo alvo quando há mais de um conectado

**MCP alternativo (não usado neste protocolo)**

- Figma Dev Mode MCP oficial — `https://mcp.figma.com`, ferramentas
  `mcp__plugin_figma_figma__*`. Requer OAuth. Entrega `get_design_context` e
  Code Connect; contexto curado, não leitura crua de nó.

**Design System**

- [Storybook Design System 3.6.0](https://cdn.exemplo.com)
- Índice programático: `.../storybook-3.6.0/index.json` (553 entradas)

**Design tokens**

- [Design Tokens Community Group (DTCG)](https://www.designtokens.org/) — formato canônico de token

**Ressalvas**

- Valores de cobertura (2,5%, 456 px, 154 hex, 82 font-sizes) medidos em
  2026-09-26 sobre os 175 CSS Modules de `src/frontend`. Remedir depois de
  qualquer onda de tokenização.
- A conversão de `gradientTransform` do Figma para ângulo CSS **não** foi
  verificada contra fonte oficial nesta rodada. Tratar como ponto de atenção,
  não como fórmula pronta.
