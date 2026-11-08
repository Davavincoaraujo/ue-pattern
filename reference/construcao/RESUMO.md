
# Padrão Universo Editor Adobe

Skill autocontida — todo o conteúdo necessário pra entender e trabalhar
nesse padrão vive DENTRO desta pasta (`reference/`), não depende do repo
`seu-projeto` estar aberto na sessão. Cobre arquitetura,
construção, validação, publicação de conteúdo e documentação — não é um
padrão "final e fechado".

## Arquitetura em 1 página

4 camadas, regra de dependência de mão única:

```
src/app        → rotas Next.js, layout, API routes
src/server      → conteúdo, editor, proxy, legado, redirects, segurança
src/frontend    → componentes CMS, PageShell, wrappers do DS
src/common      → contratos TypeScript + registry gerado
```

- `src/app` e `src/frontend` **nunca** importam de `@/server/aem/*` — o
  `CMSAdapter` é o único ponto autorizado a traduzir o payload bruto do
  provider pra `NormalizedPage`.
- `componentGroups` na página governa TANTO o picker do editor QUANTO a
  renderização runtime — mudar isso afeta os dois lados.
- Registry (`src/common/generated/registry/`) é `Map<"grupo/nome@versão",
  RegistryEntry>` gerado por `npm run generate:registries` a partir de cada
  `definition.ts` — **nunca editado à mão**, sempre regenerado.
- Mapper **nunca** faz fetch (é síncrono e puro) — exceção: Content
  Fragments, que vivem num `cf-fetch.ts` separado chamado do Server
  Component, nunca dentro do mapper.
- 5 contratos centrais: `NormalizedPage` (página CMS-agnóstica),
  `CMSAdapter` (busca de conteúdo), `EditorPlugin` (edição visual,
  separado do adapter), `RegistryEntry` (loader+mapper+metadata por
  componente), `QualifiedComponentKey` (`"grupo/nome@versão"`).
- Detalhe completo, diagramas e glossário (AEM/UE/Registry/Resolver/
  Adapter/Layout/PageShell/SSI/DS/Assistente):
  `reference/architecture/overview.md`, `project-structure.md`,
  `registry-system.md`.

## Anatomia de um componente

```
src/frontend/components/<grupo>/[sections|components]/<nome>/v1/
  definition.ts        # schema do dialog UE
  mapper.ts             # raw JCR/Sling → props tipadas
  <nome>.tsx             # Server Component (ou "use client" com estado)
  <Nome>.module.css      # CSS Module
  index.ts               # barrel: default + tipos + definition + mapper
  __tests__/mapper.test.ts
```

`<grupo>` = pasta em `src/frontend/components/` (`meu-grupo`,
`outro-grupo`, `global`, `trabalheconosco`...). O
`group` da `definition.ts` PRECISA bater com o nome da pasta.

**definition.ts**: `modelId:"<grupo>--<nome>"` kebab-case; campos em abas
via `tab()` de `_shared/dialog-fields.ts`; termina com `...DL_FIELDS`;
`export const load = () => import("./<nome>")`; multifield com item
clicável → declarar em `subItems` também.

**mapper.ts**: `MapperFn` de `@/common/types/registry`; síncrono e puro;
`parseMultifield()` de `_shared/multifield.ts`; assets via
`buildAssetUrl(resolveAsset(value))`; `|| undefined` pra opcionais (nunca
`?? undefined` — string vazia do AEM passa reto pelo `??`); retorno com
`satisfies <Nome>Props`.

**<nome>.tsx**: texto autorável sempre via `richTextHtml()` +
`dangerouslySetInnerHTML` (nunca hardcoded); `getEditorProps()` de
`@/server/cms` (nunca `data-aue-*` manual); CSS Module sempre; client
component só com estado/evento/efeito; `<button>` custom precisa de
`cursor:pointer` explícito (browser não herda isso do jeito que herda em
`<a href>`).

Detalhe completo (incl. padrão de sub-itens/multifield aninhado, criação de
layouts, mapeamento de dados, boas práticas, fluxo de qualidade):
`reference/development/*.md`.

## 3 padrões de conteúdo repetido

| Padrão | Quando | Como |
|---|---|---|
| **1 — Multifield cru** (exceção) | Item tem UM valor escalar (string, tag) | `type:"multifield"` na definition + `parseMultifield()`, sem `subItems` |
| **2 — `subItems`** (DEFAULT) | Item tem 2+ campos, imagem ou link | `subItems` na definition + `_path` por item no mapper + `data-aue-resource` por item |
| **3 — Content Fragment** | Dado reusado em várias páginas/componentes | CF model provisionado por script + persisted query + `cf-fetch.ts` com `fetchPersistedQuery`+`cache()` |

> **Atualizado.** O default era o padrão 1; agora é o 2. Motivo: a Adobe
> documenta que `condition` **não funciona** dentro de item repetível
> (*"conditions inside multi containers aren't supported"*) e que multifield
> aninhado é proibido. Com 2+ campos por item, o padrão 1 gera dialog gigante
> sem saída.
>
> Decisão completa, com fontes: `reference/autoria/`.

Detalhe do padrão 2: `reference/development/component-subitens.md`.

## Content Fragments — provisionamento

CF novo = script novo em `scripts/generate-<nome>-cf.ts` (referência
completa: `generate-unlock-card-config-cf.ts` no repo), que faz nessa
ordem: `createModel()` (Sling import do `cq:Template` em
`/conf/<namespace>/settings/dam/cfm/models/<nome>`), `createCF()` (POST
`/api/assets/...` com `cq:model`+`elements` seed), `createPersistedQuery()`
(Sling POST + PUT do `.graphql` puro em
`/conf/<namespace>/settings/graphql/persistentQueries/<nome>`). Defaults:
`AEM_SCRIPT_HOST=localhost:4502`, `admin`/`admin` — dry-run sempre primeiro.

`fetchPersistedQuery(namespace, query, {path})` já usa `cache()` do React —
chamar a mesma CF várias vezes na mesma árvore de render (desktop + drawer
mobile reaproveitando o mesmo CTA, por exemplo) dedupe automático.

## Sistema de CTA reutilizável

Trio em `_shared/`: `cta.ts` (`CtaFields`/`CtaMode`:
`"link"|"formulario"|"desbloquear"`, `mapCtaFields`), `cta-fields.ts`
(`buildCtaFields(prefix)` gera os campos condicionais do dialog),
`resolveCtaButton.tsx` (`resolveCtaButton`/`CtaButtonSlot` resolve qual
componente renderizar baseado no modo). Novo modo de CTA = 1 valor a mais
em `CtaMode` + 1 campo condicional + 1 branch — nunca sistema paralelo.

**Streaming obrigatório**: CTA que busca CF nunca pode bloquear LCP/conteúdo
crítico. Sempre:

```tsx
<Suspense fallback={buttonLabel ? <span aria-hidden style={{display:"block",minHeight:48}} /> : null}>
  <CtaButtonSlot {...cta} label={buttonLabel} ... />
</Suspense>
```

Detalhe do porquê (caso real de layout shift de ~640px sem isso):
`reference/development/streaming-suspense-cls.md`.

## Efeitos scroll-driven

JS puro + `requestAnimationFrame` — nunca `IntersectionObserver` pra
progresso contínuo, nunca `animation-timeline: view()` (suporte de browser
inconsistente). Regra crítica: **nunca confiar numa medição de posição
feita uma única vez no mount** — imagem carregando depois, fonte trocando
(FOUT), resize, tudo invalida. Padrão correto:

```ts
let naturalTop = measureOnce();          // mutável
const measure = () => { naturalTop = remeasure(); update(); };
measure();                                // roda no mount
window.addEventListener("resize", measure);
window.addEventListener("load", measure);
new ResizeObserver(measure).observe(elementoQueMuda);
```

"Sticky scroll stacking" (uma section sobe e cobre a anterior por
completo): section de baixo usa `transform` (nunca `position:sticky` real
— corrompe leitura de `getBoundingClientRect()` de quem depende dela);
section de cima precisa de altura mínima = **2× sua própria altura de
subida** pra garantir cobertura total.

## Merge de código vindo de fora

Nunca copiar arquivo por cima de um compartilhado (`_shared/*`,
`sections/ui/atoms|molecules|organisms/*`) sem diff antes:

1. Diff arquivo por arquivo (ou `comm -23`/`comm -13` em campos/exports
   extraídos por regex, se o diff ficar sujo por line-ending).
2. Idêntico/só formatação → copia.
3. Só ADICIONA (prop opcional, variant nova, CSS novo) → copia.
4. REMOVE ou substitui algo que já existia → nunca sobrescrever. Merge
   manual: base = versão com mais funcionalidade, reinjeta o que a outra
   tinha e a nova não tem.

## Pixel-perfect com Figma — checklist

Medir (via Desktop Bridge plugin — nunca REST API direta, rate limit 429
frequente): `fontSize`, `fontName.style`→`font-weight`, **`lineHeight`**
(item MAIS esquecido — layout "não bate" mesmo com fontSize/color certos se
isso faltar), `fills` (hex exato), `itemSpacing`, `padding` nos 4 lados sem
assumir simetria. Mobile e desktop podem ter `lineHeight`/`weight`
diferentes no MESMO elemento — sempre remedir, nunca herdar do desktop.

`font-family` errado silencioso: `"SuaFonte Sans"` e `"SuaFonte"` são DOIS
`@font-face` diferentes — checar cobertura de peso antes de assumir
fallback certo.

## Especificidade CSS entre CSS Modules

Duas classes de arquivos DIFERENTES com mesma especificidade resolvem
empate por ordem de bundle (frágil, muda com o bundler). Garantir vencedor:
seletor composto (`.x.x`, specificity dobrada) OU CSS custom property
(componente expõe `--var`, consumidor seta via inline style).

## Arquivos de referência (nesta mesma pasta, `reference/`)

| Arquivo | Conteúdo |
|---|---|
| `architecture/overview.md` | Camadas, contratos, glossário completo |
| `architecture/project-structure.md` | Estrutura de pastas detalhada |
| `architecture/registry-system.md` | Como o registry é gerado e consumido |
| `cms/overview.md`, `aem-integration.md`, `editor-integration.md`, `extending-to-new-provider.md` | Integração AEM, Universal Editor, como trocar de CMS |
| `development/creating-components.md` | Passo a passo detalhado de criação |
| `development/creating-layouts.md` | Como criar layouts de página |
| `development/component-subitens.md` | Padrão 2 (subItems) em detalhe |
| `development/data-mapping.md` | Convenções de mapper |
| `development/best-practices.md`, `workflow-and-quality.md` | Convenções gerais e gates |
| `development/streaming-suspense-cls.md` | Suspense + CLS, caso real documentado |
| `flows/page-rendering.md` | Fluxo completo de renderização de página |
| `padrao-componentes.md` | Cópia completa do documento central (meu-grupo/outro-grupo) — anatomia, CTA, CF, scroll-driven, merge, pixel-perfect, log de aprendizados, backlog |

## Pixel-perfect (movido do padrão de autoria)

| Arquivo | Conteúdo |
|---|---|
| `reference/decisao-pixel-perfect.md` | A decisão e o resumo do protocolo |
| `reference/padrao-pixel-perfect.md` | Protocolo de 5 fases, tabela Figma para CSS, tokens do Design System, Atomic Design, CSS moderno, fontes |

A parte de **autoria** (listas, Content Fragments, SEO e RTE) fica em `../autoria/`.
