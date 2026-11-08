# Padrão Universo Editor Adobe

Documento vivo — fonte de verdade dos padrões usados pra construir componentes
CMS (AEM Universal Editor) nesse projeto. Nasceu consolidando o que foi
aprendido nos builds de **landing pages** (`meu-grupo`),
**outros grupos**. Atualizado pelo agente
`ue-pattern-documenter` toda vez que um padrão novo é validado ou um erro
recorrente é corrigido — ver seção "Log de aprendizados" no fim.

**Ainda não é o padrão final.** Este documento cresce por acréscimo: cada
componente novo que expõe um caso que o padrão atual não cobre vira uma
entrada nova aqui, não uma reescrita.

## 1. Anatomia de um componente

```
src/frontend/components/<grupo>/[sections|components]/<nome>/v1/
  definition.ts        # schema do dialog UE
  mapper.ts             # raw JCR/Sling → props tipadas
  <nome>.tsx             # Server Component (ou "use client" se precisar de estado)
  <Nome>.module.css      # CSS Module
  index.ts               # barrel: default + tipos + definition + mapper
  __tests__/mapper.test.ts
```

`<grupo>` = `meu-grupo`, `outro-grupo`, `global`,
`trabalheconosco`... — cada um é uma pasta própria em
`src/frontend/components/`. O `group` da `definition.ts` PRECISA bater com o
nome da pasta — é ele que o Universal Editor usa pro picker de componentes.

### definition.ts
- `modelId: "<grupo>--<nome>"` (kebab-case).
- `name` = nome técnico = nome da pasta = `SectionData.type`.
- Campos organizados em abas via `tab()` de `_shared/dialog-fields.ts` —
  nunca um dialog "parede" com 15 campos soltos.
- Terminar com `...DL_FIELDS` (campos de GTM/dataLayer).
- `export const load = () => import("./<nome>")` — code-splitting.
- Multifield → declarar em `subItems` também (ver §3).

### mapper.ts
- Default export tipo `MapperFn` de `@/common/types/registry`.
- **Síncrono e puro. Nunca faz fetch** (exceção: `fetchPersistedQuery` para
  Content Fragments — mas isso mora num `cf-fetch.ts` separado, chamado do
  Server Component, não do mapper).
- `parseMultifield()` (`_shared/multifield.ts`) pra normalizar multifield do
  AEM (aceita array OU objeto `item0/item1/...`).
- Assets via `buildAssetUrl(resolveAsset(value))` de `@/server/cms`.
- `|| undefined` pra opcionais — nunca `?? undefined` (string vazia do AEM
  não é `null`/`undefined`, é `""`, que passa reto pelo `??`).
- Retorno com `satisfies <Nome>Props` — valida em build time sem alargar o
  tipo do literal.

### <nome>.tsx
- `<section>`/`<div>` raiz com `getEditorProps({resource, type:"component",
  model, label})`.
- Todo texto autorável passa por richtext: `dangerouslySetInnerHTML={richTextHtml(value)}`
  — nunca elemento de texto hardcoded fora de richtext, porque tags como
  `<b>`/`<i>` inseridas pelo autor no rich text editor só sobrevivem assim.
- CSS Module sempre; tokens de cor locais por componente com fallback
  (`var(--token, #valor)`) — não há `:root` global de cores por grupo.
- Client component (`"use client"`) só quando há estado, evento, ou efeito
  (carrossel, accordion, modal, scroll-driven). Senão, Server Component.

### index.ts
```ts
export { default } from "./<nome>";
export type { <Nome>Props } from "./mapper";
export { default as definition } from "./definition";
export { default as mapper } from "./mapper";
```

### Registry
`npm run generate:registries` gera `src/common/generated/registry/<grupo>.ts`
a partir do `group` de cada `definition.ts` — **nunca editar à mão**, é
gitignored e roda automático via `predev`/`prebuild`/`pretest`.

## 2. Building blocks reaproveitáveis

Antes de criar um átomo/molécula/organismo novo, procurar em
`sections/ui/{atoms,molecules,organisms}/` — a maior parte dos componentes
visuais (botão, accordion, carrossel, card) já existe e é genérica o
suficiente pra qualquer grupo. Construídos/generalizados nesse ciclo:
`Button`, `Accordion`, `CardCarousel`, `Modal`, `ScrollRise`/`ScrollFreeze`/
`ScrollPlane`, `SectionHeader`, `CardBordersIcon`, `UnlockCardModal`.

**Regra de ouro pra átomos compartilhados**: qualquer mudança em
`sections/ui/atoms|molecules|organisms/*` e em `_shared/*` (`cta.ts`,
`cta-fields.ts`, `resolveCtaButton.tsx`, `Button.tsx`...) é **aditiva por
padrão**. Esses arquivos são usados por TODOS os grupos — nunca remover um
prop/variant/branch existente pra "simplificar", nunca sobrescrever um
arquivo desses às cegas ao importar código de outra fonte (ver §7).

## 3. Três padrões de conteúdo repetido

| Padrão | Quando usar | Como |
|---|---|---|
| **1 — Multifield inline** (default) | Lista de itens só usada nessa seção, sem reuso cross-page | `type:"multifield"` na definition, `parseMultifield()` no mapper, sem `subItems` |
| **2 — Multifield com `subItems`** | Itens precisam ser clicáveis/editáveis individualmente na árvore do UE | `subItems` na definition + `_path` por item no mapper + `data-aue-resource` por item no JSX |
| **3 — Content Fragment** | Dado reusado em VÁRIAS páginas/componentes (agências, config de formulário, header compartilhado) | CF model provisionado por script (`scripts/generate-*-cf.ts`) + persisted query + `cf-fetch.ts` com `fetchPersistedQuery` + `cache()` do React |

## 4. Content Fragments — provisionamento

Todo CF novo é criado por um script dedicado em `scripts/generate-<nome>-cf.ts`
(ver `generate-contact-form-config-cf.ts`, `generate-unlock-card-config-cf.ts`
como referência completa). O script faz, nessa ordem:

1. `createModel()` — POST Sling import criando o `cq:Template` do modelo CF em
   `/conf/<namespace>/settings/dam/cfm/models/<nome>`.
2. `createCF()` — cria a instância da CF em
   `/content/dam/<namespace>/assets/<pasta>/<nome>` com os valores seed.
3. `createPersistedQuery()` — registra a GraphQL persisted query em
   `/conf/<namespace>/settings/graphql/persistentQueries/<nome>` (Sling POST
   + PUT do corpo `.graphql` puro).

Defaults: `AEM_SCRIPT_HOST` cai pra `http://localhost:4502`,
`AEM_AUTH_USER`/`AEM_AUTH_PASS` caem pra `admin`/`admin` — rodar sem nenhuma
env var já ataca o AEM local. Sempre `--dry-run` primeiro.

`cf-fetch.ts` (ou `_shared/<nome>-cf.ts` pra CFs cross-grupo) usa
`fetchPersistedQuery(namespace, queryName, {path})`, que já usa `cache()` do
React — chamar a função fetch várias vezes na mesma árvore de render
(ex: banner desktop + drawer mobile reaproveitando o mesmo CTA) dedupe
automático, sem custo extra de rede.

## 5. Sistema de CTA reutilizável (`_shared/cta.ts`)

Qualquer botão do site que precisa de mais de um comportamento (link simples
vs. abrir modal) usa o mesmo trio:

- `_shared/cta.ts` — `CtaFields`/`CtaMode` (`"link" | "formulario" |
  "desbloquear"`), `mapCtaFields(obj, prefix)`.
- `_shared/cta-fields.ts` — `buildCtaFields(prefix)` gera os campos do dialog
  (select de modo + campos condicionais por modo via `condition`).
- `_shared/resolveCtaButton.tsx` — `resolveCtaButton()`/`CtaButtonSlot()`
  resolve qual componente renderizar (`Button` puro, `ButtonFormTrigger`,
  `UnlockCardButtonTrigger`) baseado no modo + busca a CF do modo escolhido.

Novo modo de CTA = 1 valor a mais em `CtaMode`, 1 campo condicional a mais em
`buildCtaFields`, 1 branch a mais em `resolveCtaButton` — nunca um sistema
paralelo.

**Streaming obrigatório**: `resolveCtaButton` pode fazer fetch de CF — nunca
chamar `await resolveCtaButton(...)` direto num Server Component que também
renderiza LCP (hero) ou conteúdo crítico (header). Usar sempre:

```tsx
<Suspense fallback={buttonLabel ? <span aria-hidden style={{display:"block",minHeight:48}} /> : null}>
  <CtaButtonSlot {...cta} label={buttonLabel} ... />
</Suspense>
```

Sem isso, a seção inteira suspende esperando a CF e a página monta sem ela
(layout shift do tamanho da seção inteira quando ela finalmente chega).

## 6. Efeitos scroll-driven (`ScrollRise`/`ScrollFreeze`/`ScrollPlane`)

Todo efeito guiado por scroll nesse projeto é JS puro com
`requestAnimationFrame` — **nunca** `IntersectionObserver` pra progresso
contínuo (só serve pra binário visível/não-visível) e **nunca**
`animation-timeline: view()` (suporte de browser inconsistente pro
approach usado aqui).

Regra crítica, aprendida depois de um bug "funciona/não funciona" difícil de
reproduzir: **nunca conie a posição de um elemento medida uma única vez no
mount**. Imagem de fundo carregando depois, fonte trocando (FOUT), resize —
tudo isso reflui o documento e invalida uma medição feita cedo demais. Padrão
correto:

```ts
let naturalTop = measureOnce(); // valor inicial, mutável
const measure = () => { naturalTop = remeasure(); update(); };
measure(); // mount
window.addEventListener("resize", measure);
window.addEventListener("load", measure);
new ResizeObserver(measure).observe(elementoQueMuda);
```

Efeito "sticky scroll stacking" (uma section sobe e cobre a anterior por
completo, tipo capa de livro): a section "de baixo" fica `ScrollFreeze`d
(sticky-like via `transform`, nunca `position:sticky` real — CSS sticky real
corrompe leituras de `getBoundingClientRect()` de quem depende dela). A
section "de cima" precisa de altura mínima de **2× sua própria altura de
subida** pra garantir cobertura total (a seção congelada ocupa 2× sua altura
natural: a altura em si + o deslocamento que a empurrou).

## 7. Merge de código vindo de fora (outro dev/branch/pacote)

Regra travada depois de um incidente real nesse ciclo: nunca copiar um
arquivo de fora por cima de um arquivo compartilhado (`_shared/*`,
`sections/ui/atoms|molecules|organisms/*`) sem diff. Processo:

1. `diff` (ou comparação de campos/exports via `comm`) arquivo por arquivo.
2. Idêntico ou só formatação → copia.
3. Só adiciona coisa nova (prop opcional, variant nova, CSS novo) → copia.
4. **Remove ou substitui algo que já existia** → NÃO sobrescrever. Merge
   manual: base = a versão que tem mais funcionalidade, reinjeta o que a
   outra versão tinha e a nova não tem.

Sintoma de conflito tipo 4: `comm -23`/`comm -13` em nomes de campos/valores
extraídos por regex mostra itens só de um lado — se aparece algo "só no
existente", investigar se é intencional (nomenclatura diferente) ou perda
real de feature.

## 8. Pixel-perfect com Figma — checklist

Medir do Figma (via `figma_execute`/plugin bridge), nunca "olho": `fontSize`,
`fontName.style` (mapeia pra `font-weight` — "Regular"≠sempre 400 visualmente
se o line-height for diferente), **`lineHeight`** (frequentemente esquecido —
browser default ≈1.2, Figma raramente usa isso, geralmente 1.4/140% pro corpo
de texto — diferença de line-height sozinha já faz o layout "não bater" mesmo
com fontSize/color/weight certos), `fills` (cor exata em hex), `itemSpacing`
(gap do auto-layout), `padding` nos 4 lados (não assumir simétrico).

Erros recorrentes encontrados:
- Confundir line-height do desktop com o do mobile (podem ser diferentes:
  140% vs 120% no mesmo componente, título vs corpo).
- `font-family` errado silencioso: `"SuaFonte Sans"` e `"SuaFonte"` são DOIS
  `@font-face` diferentes registrados em `globals.css` — cada um cobre pesos
  diferentes, checar cobertura de peso antes de assumir "vai cair no
  fallback certo".
- Elemento `<button>` não herda `cursor:pointer` do browser (diferente de
  `<a href>`, que ganha pointer automático) — se o botão usa `<button>`,
  `cursor:pointer` tem que estar explícito no CSS.

## 9. Especificidade CSS entre arquivos (CSS Modules)

Duas classes de **arquivos CSS Module diferentes** com a mesma especificidade
(1 classe vs 1 classe, ou 2 vs 2) resolvem empate por **ordem de bundle**,
não por "quem é mais específico" — frágil e muda com o bundler. Dois jeitos
de garantir vencedor determinístico:

- **Seletor composto**: `.minhaClasse.minhaClasse` (2× a mesma classe) —
  specificity dobrada, sempre vence uma classe simples de outro arquivo,
  independente de ordem.
- **CSS custom property**: componente reusável expõe uma var
  (`--cc-item-width`), consumidor seta via inline style — nunca depende de
  cascade entre arquivos.

## 10. Log de aprendizados

> Preenchido pelo agente `ue-pattern-documenter` a cada rodada de trabalho —
> 1 linha por aprendizado novo, mais recente no topo. Erros viram regra na
> seção correspondente acima quando generalizáveis; ficam só aqui quando são
> específicos demais pra virar regra geral.

- 2026-08-08 — Merge de pacote externo sobrescreveu silenciosamente 2 fixes
  de sessão (`cursor:pointer`, borda do `.ghost`) e uma feature inteira
  (modo CTA `"desbloquear"`) porque os arquivos eram idênticos em nome mas
  divergentes em conteúdo — nasceu a regra do §7.
- 2026-08-08 — `ScrollRise` media a posição da section anterior só no mount;
  imagem de fundo carregando depois invalidava a medição — nasceu a regra
  do §6 (measure/remeasure com `ResizeObserver`+`load`).
- 2026-08-08 — Modal "Desbloquear cartão" (`meu-grupo`) não batia com o
  Figma mesmo com fontSize/color certos — causa era `line-height` nunca
  setado — nasceu o item de checklist do §8.
- 2026-08-08 — CTA do header (`meu-grupo`) parecia "não clicável" — causa
  real era `cursor:pointer` faltando no `.root` do `Button` (só `.primary`
  tinha) — nasceu o item de checklist do §8.

## 11. Melhorias futuras (backlog do padrão)

- **Validação de agência/conta real**: o modal "Desbloquear cartão"
  (`meu-grupo`) usa validação client-side genérica (só dígitos + tamanho).
  foi localizada nos artefatos disponíveis — trocar quando tiver acesso ao
  JS original.
- **Content package do conteúdo AEM completo por grupo**: hoje o processo de
  empacotar conteúdo (`packages/*-content-*.zip`) é manual via Package
  Manager REST, filtro por filtro. Automatizar num script
  `scripts/generate-content-package.ts <grupo>` que descobre os paths
  automaticamente (página + DAM do grupo + CF models/queries com prefixo do
  grupo).
- **Skill deveria gerar o scaffold, não só documentar**: a skill
  `construcao` hoje é só guia — o próximo passo natural é
  um script `scripts/scaffold-ue-component.ts` que já cria os 6 arquivos
  (`definition.ts`/`mapper.ts`/`<nome>.tsx`/CSS/`index.ts`/teste) a partir de
  um preset (server vs client, com/sem multifield, com/sem CF), reduzindo o
  trabalho do agente Builder a preencher os campos específicos do componente.
- **Detecção automática de regressão de especificidade CSS**: o problema do
  §9 (empate resolvido por ordem de bundle) só é descoberto visualmente hoje.
  Um lint/teste que sinalize duas classes com mesma especificidade
  "concorrendo" pelo mesmo elemento entre CSS Modules diferentes evitaria
  a categoria inteira de bug.
- **`generate-*-cf.ts` tem MUITA duplicação** entre scripts (cada um
  reimplementa `aemFetch`/`slingPost`/`ensureFolders`/`buildFieldNode`) —
  extrair pra `scripts/_shared/cf-provisioning.ts` reduziria ~150 linhas por
  script novo.
