# Guia de construção: do zero a um componente completo

Este guia assume um projeto **Next.js + AEM Universal Editor (headless)**. Ele junta o fluxo de trabalho, as regras e a ordem de leitura. O detalhe fino de cada padrão está em `reference/` (24 arquivos, ~6.000 linhas). Cada seção abaixo aponta o arquivo certo.

Convenções usadas: `seu-projeto` é o repositório, `<grupo>` é uma pasta em `src/frontend/components/`, `<nome>` é o componente em kebab-case, `<Nome>` em PascalCase.

## Sumário

1. [Como usar a skill neste fluxo](#1-como-usar-a-skill-neste-fluxo)
2. [Arquitetura em uma página](#2-arquitetura-em-uma-página)
3. [Anatomia de um componente](#3-anatomia-de-um-componente)
4. [Construir passo a passo](#4-construir-passo-a-passo)
5. [Os 3 padrões de conteúdo repetido](#5-os-3-padrões-de-conteúdo-repetido)
6. [Autoria: dialog enxuto, texto e SEO](#6-autoria-dialog-enxuto-texto-e-seo)
7. [CTA reutilizável e streaming](#7-cta-reutilizável-e-streaming)
8. [Content Fragments](#8-content-fragments)
9. [Efeitos scroll-driven](#9-efeitos-scroll-driven)
10. [Pixel-perfect com Figma](#10-pixel-perfect-com-figma)
11. [Checklist de qualidade](#11-checklist-de-qualidade)
12. [Mapa dos arquivos de `reference/`](#12-mapa-dos-arquivos-de-knowledge)
13. [Como eu organizaria para você usar sozinho](#13-como-eu-organizaria-para-você-usar-sozinho)

---

## 1. Como usar a skill neste fluxo

`UE` = `node $UE_PATTERN_DIR/dist/cli.js`, rodado na raiz do projeto.

| Etapa | Comando | Para quê |
|---|---|---|
| Entender uma regra | `UE buscar`, `UE ler` | Achar e ler a seção exata, sem abrir 6.000 linhas |
| Criar o esqueleto | `UE criar` | Gera os 6 arquivos no padrão (dry-run sem `--gravar`) |
| Conferir convenções | `UE validar`, `UE validar-grupo` | Aponta desvios do padrão antes de abrir PR |
| Medir contra o Figma | `UE specs`, `UE spec` | Computed style vs. valor medido, tolerância zero |
| Comparar com imagem | `UE comparar` | De-para pixel a pixel contra um PNG de referência |

O agente `ue-pattern-builder` executa esse fluxo sozinho (configuração no README). Manualmente, o fluxo recomendado é: `UE buscar` → `UE criar` (dry-run, depois `--gravar`) → você implementa o JSX/CSS → `UE validar` → `UE spec` e/ou `UE comparar`.

## 2. Arquitetura em uma página

Quatro camadas, dependência de mão única:

```
src/app        rotas Next.js, layout, API routes
src/server     conteúdo, editor, proxy, redirects, segurança
src/frontend   componentes CMS, PageShell, wrappers do Design System
src/common     contratos TypeScript + registry gerado
```

Regras que não se negociam:

- `src/app` e `src/frontend` **nunca** importam de `@/server/aem/*`. O `CMSAdapter` é o único ponto que traduz o payload bruto do provider em `NormalizedPage`.
- O registry (`src/common/generated/registry/`) é um `Map<"grupo/nome@versão", RegistryEntry>` **gerado** por `npm run generate:registries` a partir de cada `definition.ts`. Nunca edite à mão.
- O mapper é **síncrono e puro**: nunca faz fetch. A única exceção é Content Fragment, que vive em um `cf-fetch.ts` chamado pelo Server Component.
- `componentGroups` na página governa o picker do editor **e** a renderização em runtime. Mudar um afeta o outro.
- Cinco contratos centrais: `NormalizedPage`, `CMSAdapter`, `EditorPlugin`, `RegistryEntry`, `QualifiedComponentKey`.

Por que importa: se o registry fosse manual, toda definition nova exigiria um segundo edit fácil de esquecer. Se o mapper buscasse dados, cada render viraria uma cascata de requests.

Leia: `architecture/overview.md`, `project-structure.md`, `registry-system.md`, `flows/page-rendering.md`.

## 3. Anatomia de um componente

```
src/frontend/components/<grupo>/[sections|components]/<nome>/v1/
  definition.ts          schema do dialog do Universal Editor
  mapper.ts              dado bruto do JCR/Sling vira props tipadas
  <nome>.tsx             Server Component (ou "use client" com estado)
  <Nome>.module.css      CSS Module
  index.ts               barrel: default + tipos + definition + mapper
  __tests__/mapper.test.ts
```

O `group` na `definition.ts` precisa bater com o nome da pasta do grupo. O gerador do registry usa a pasta como fonte.

### definition.ts

- `modelId: "<grupo>--<nome>"`, em kebab-case.
- Campos organizados em abas com `tab()` de `_shared/dialog-fields.ts`.
- Termina com `...DL_FIELDS` (data layer).
- `export const load = () => import("./<nome>")`.
- Multifield com item clicável: declarar também em `subItems`.
- Campo novo é **local** na definition do componente. Não altere builders compartilhados (`buildCtaFields`, `DL_FIELDS`) para atender um caso.

### mapper.ts

- Tipo `MapperFn` de `@/common/types/registry`.
- Síncrono e puro.
- Lista de valores: `parseMultifield()` de `_shared/multifield.ts`.
- Asset: `buildAssetUrl(resolveAsset(value))`.
- Opcional: `|| undefined`, **nunca** `?? undefined`. O AEM devolve string vazia, e `??` deixa a string vazia passar.
- Retorno com `satisfies <Nome>Props`.

### `<nome>.tsx`

- Todo texto autorável passa por `richTextHtml()` + `dangerouslySetInnerHTML`. Nunca hardcoded.
- Instrumentação do editor só via `getEditorProps()` de `@/server/cms`. Nunca `data-aue-*` manual.
- Estilo sempre em CSS Module.
- Client component só com estado, evento ou efeito.
- `<button>` custom precisa de `cursor: pointer` explícito. O navegador não herda isso como faz em `<a href>`.

### Teste de mapper

Um caso com campos preenchidos e um caso com campos ausentes (tudo `undefined`, `dataLayer.enabled === false`).

Leia: `development/creating-components.md`, `data-mapping.md`, `padrao-componentes.md`.

## 4. Construir passo a passo

1. **Escolha o grupo.** `global` para estrutural e muito reaproveitado; um grupo de produto/campanha para o resto.
2. **Escolha o padrão de conteúdo** (seção 5). Isso decide a forma do dialog.
3. **Gere o esqueleto** com `UE criar`. Informe grupo, nome, `--titulo`, `--tipo` (`sections` ou `components`) e `--campos` (`text`, `richtext`, `asset`, `boolean`).
4. **Ajuste a definition**: abas, campos extras, `subItems` se houver lista.
5. **Escreva o mapper** conforme a seção 3. Rode o teste.
6. **Implemente o JSX/CSS** a partir do Figma (seção 10).
7. **Regenere o registry**: `npm run generate:registries`.
8. **Valide**: `UE validar`, typecheck, lint, testes.
9. **Teste no editor**: abrir o dialog, preencher, salvar, reabrir.

## 5. Os 3 padrões de conteúdo repetido

| Padrão | Quando | Como |
|---|---|---|
| **1. Multifield cru** (exceção) | Item tem um único valor escalar (string, tag) | `type: "multifield"` na definition + `parseMultifield()`, sem `subItems` |
| **2. `subItems`** (padrão) | Item com 2+ campos, imagem ou link | `subItems` na definition + `_path` por item no mapper + `data-aue-resource` por item |
| **3. Content Fragment** | Dado reusado em várias páginas | Modelo CF por script + persisted query + `cf-fetch.ts` com `fetchPersistedQuery` e `cache()` |

Por que o padrão 2 é o default: a Adobe documenta que `condition` não funciona dentro de item repetível e que multifield aninhado é proibido. Com 2+ campos por item, o padrão 1 gera um dialog gigante e sem saída.

Restrição que pega muita gente: dentro de um multifield, todos os itens usam os `fields` do container. **Não dá para ter dialog diferente por tipo de item.**

Recolher/expandir itens do multifield: marcar o campo com `collapsible`. O serializador emite `component: "container"`, `multi: true` e `collapsible: true`.

Leia: `development/component-subitens.md`, `reference/autoria/reference/padrao-listas-e-subitems.md`.

## 6. Autoria: dialog enxuto, texto e SEO

- Dialog longo é bug de produto. Agrupe em abas e esconda o que o autor não precisa.
- Variante ou componente novo? Se muda só aparência, é variante (um campo `select`). Se muda estrutura ou campos, é componente.
- Título: o nível do heading vem de um campo (`titleType`), não de HTML escrito pelo autor.
- Formatação de texto: perfis de RTE restritos no filtro, para o autor não colar estilo arbitrário.
- Cor no texto rico é **valor literal**, não token. Não acompanha o tema. Se a cor deve seguir o tema, mantenha o token no CSS e não exponha o campo.
- `select` e `radio-group`: **não** coloque `value` default fixo na definition. Ele reseta o dropdown ao reabrir o dialog.

Leia: `reference/autoria/RESUMO.md`, `padrao-seo-texto.md`, `padrao-listas-e-subitems.md`.

## 7. CTA reutilizável e streaming

Três arquivos em `_shared/`:

- `cta.ts`: `CtaFields`, `CtaMode` (`"link" | "formulario" | "desbloquear"`), `mapCtaFields`.
- `cta-fields.ts`: `buildCtaFields(prefix)` gera os campos condicionais.
- `resolveCtaButton.tsx`: `resolveCtaButton` e `CtaButtonSlot` escolhem o componente por modo.

Novo modo de CTA = um valor em `CtaMode` + um campo condicional + um branch. Nunca um sistema paralelo.

**Streaming obrigatório**: CTA que busca CF não pode bloquear o LCP.

```tsx
<Suspense fallback={buttonLabel ? <span aria-hidden style={{ display: "block", minHeight: 48 }} /> : null}>
  <CtaButtonSlot {...cta} label={buttonLabel} />
</Suspense>
```

O `await` de fetch no render suspendia o banner inteiro e gerava deslocamento de ~640px. O Suspense cirúrgico no CTA, mais `cache()` do React, resolve.

Leia: `development/streaming-suspense-cls.md`.

## 8. Content Fragments

Um CF novo é um script novo, `scripts/generate-<nome>-cf.ts`, que faz nesta ordem:

1. `createModel()`: Sling import do `cq:Template` em `/conf/<namespace>/settings/dam/cfm/models/<nome>`.
2. `createCF()`: POST em `/api/assets/...` com `cq:model` e `elements` iniciais.
3. `createPersistedQuery()`: Sling POST + PUT do `.graphql` puro em `/conf/<namespace>/settings/graphql/persistentQueries/<nome>`.

Padrões do script: `AEM_SCRIPT_HOST` (padrão `localhost:4502`), **dry-run sempre primeiro**.

Armadilhas reais:

- O `jcr:title` define o nome da query persistida.
- Campo de referência retorna **union** no GraphQL.
- `metaType` inválido ("multi-line", "content-reference") faz o campo sumir do editor. Use o catálogo correto do AEM.
- `granite:data` de richtext errado quebra o save do CF (`value`/`builder` nulos).

Leia: `reference/autoria/reference/padrao-content-fragments.md`, `cms/aem-integration.md`.

## 9. Efeitos scroll-driven

- JS puro com `requestAnimationFrame`.
- Nunca `IntersectionObserver` para progresso contínuo.
- Nunca `animation-timeline: view()` (suporte inconsistente).
- **Nunca confie em uma medição de posição feita só no mount.** Imagem carregando depois, troca de fonte e resize invalidam o valor.

```ts
let naturalTop = measureOnce();
const measure = () => { naturalTop = remeasure(); update(); };
measure();
window.addEventListener("resize", measure);
window.addEventListener("load", measure);
new ResizeObserver(measure).observe(elementoQueMuda);
```

"Sticky scroll stacking" (uma section sobe e cobre a anterior): a de baixo usa `transform`, nunca `position: sticky` real, que corrompe `getBoundingClientRect()` de quem depende dela. A de cima precisa de altura mínima igual a 2× a própria altura de subida.

## 10. Pixel-perfect com Figma

Medir (pelo plugin Desktop Bridge, não pela REST API, que dá 429):

- `fontSize`, `fontName.style` (vira `font-weight`), **`lineHeight`** (o mais esquecido), `fills` (hex exato), `itemSpacing`, `padding` nos 4 lados sem assumir simetria.
- Mobile e desktop podem ter `lineHeight` e `weight` diferentes no mesmo elemento. Remeça, não herde do desktop.

Método:

1. Mapear cada valor para token do Design System antes de escrever px. O token vem de `boundVariables` (prioridade máxima), depois do equivalente no DS, depois de repetição em 3+ lugares (crie o token), e só então valor literal.
2. Escrever o spec `*.figma.json` com o que foi medido.
3. `UE spec` compara o computed style com tolerância zero.
4. `UE comparar` fecha o que o spec não cobre (composição, alinhamento visual).

Armadilhas:

- `font-family` errado passa em silêncio: duas famílias com nomes parecidos são dois `@font-face`. Cheque a cobertura de peso.
- `:where(p)` tem especificidade zero e perde para qualquer regra.
- `font-size` inline trava o responsivo.
- Duas classes de CSS Modules diferentes com a mesma especificidade empatam por ordem de bundle (frágil). Desempate com seletor composto (`.x.x`) ou com custom property (`--var` exposta pelo componente, setada pelo consumidor).
- Modal precisa de Portal: `z-index` sozinho não vence stacking context.

Leia: `reference/construcao/reference/padrao-pixel-perfect.md` (o mais longo: 860 linhas).

## 11. Checklist de qualidade

Antes de abrir PR:

- [ ] `group` da definition bate com a pasta
- [ ] `modelId` no formato `<grupo>--<nome>`
- [ ] Abas via `tab()` e `...DL_FIELDS` no fim
- [ ] Mapper síncrono, puro, com `|| undefined` e `satisfies`
- [ ] Nenhum texto autorável hardcoded; `richTextHtml()` onde couber
- [ ] `getEditorProps()` em vez de `data-aue-*` manual
- [ ] Sem cor, espaçamento ou raio literal quando existe token
- [ ] `cursor: pointer` em `<button>` custom
- [ ] Teste do mapper com campos presentes e ausentes
- [ ] `npm run generate:registries` rodado
- [ ] Typecheck, lint e testes passando
- [ ] `UE validar` sem erros
- [ ] Spec ou de-para visual contra o Figma
- [ ] Dialog aberto, preenchido, salvo e reaberto no editor
- [ ] Lighthouse desktop e mobile aceitáveis (CLS atento a fonte e Suspense)

## 12. Mapa dos arquivos de `reference/`

**`reference/construcao/`** (arquitetura, construção, pixel-perfect)

| Arquivo | Quando abrir |
|---|---|
| `RESUMO.md` | Visão geral, resumo de tudo |
| `reference/architecture/overview.md` | Camadas, contratos, glossário |
| `reference/architecture/project-structure.md` | Onde cada coisa mora |
| `reference/architecture/registry-system.md` | Como o registry é gerado e consumido |
| `reference/cms/*.md` | Integração AEM, editor, trocar de CMS |
| `reference/development/creating-components.md` | Passo a passo com exemplo completo |
| `reference/development/creating-layouts.md` | Layouts e PageShell |
| `reference/development/component-subitens.md` | Padrão 2 em profundidade (690 linhas) |
| `reference/development/data-mapping.md` | Convenções de mapper |
| `reference/development/streaming-suspense-cls.md` | Suspense e CLS, caso real |
| `reference/development/best-practices.md`, `workflow-and-quality.md` | Convenções e gates |
| `reference/flows/page-rendering.md` | Fluxo completo de renderização |
| `reference/padrao-componentes.md` | Documento central, com log de aprendizados |
| `reference/padrao-pixel-perfect.md`, `decisao-pixel-perfect.md` | Protocolo Figma para CSS Modules |
| `reference/padrao-organizacao-conhecimento.md` | Como organizar a documentação |

**`reference/autoria/`** (somente experiência de quem autora)

| Arquivo | Quando abrir |
|---|---|
| `RESUMO.md` | Decisões de autoria |
| `reference/padrao-listas-e-subitems.md` | Container + subItems vs. multifield |
| `reference/padrao-content-fragments.md` | CF editável in-context, referência aninhada |
| `reference/padrao-seo-texto.md` | Heading, RTE, perfis de formatação |

## 13. Como organizar para usar sozinho

1. **Um arquivo de instruções por projeto** (`AGENTS.md`, `CLAUDE.md`, `.cursorrules`) que aponte para este padrão e liste só o que é específico: nomes dos grupos, caminho do DAM, namespace do AEM e convenção de CF. O padrão fica genérico na skill; o específico fica no repo.
2. **Trocar os placeholders** `seu-projeto` no `scaffold.ts` (caminho do DAM e mock path) pelos seus valores.
3. **Manter `reference/` por `npm run sync-knowledge`** apontando para a sua skill. O script remove marcas e arquivos proprietários a cada sincronização.

O que este guia não cobre porque depende do projeto: tokens do seu Design System, specs do Figma (`*.figma.json`) e o modelo de dados dos seus Content Fragments. Esses você gera por projeto, usando as seções 8 e 10.
