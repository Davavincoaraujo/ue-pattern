# Criando Layouts

## O que é um layout

Um layout define a **estrutura HTML** de uma página. Ele recebe as seções
já resolvidas pelo `ComponentResolver` e decide como montá-las no DOM.

O layout é selecionado pelo valor de `NormalizedPage.pageLayout`, que o AEM
define por página. Quando nenhum `pageLayout` é informado, o fallback é
`"default"`.

```
PageShell (recursos globais: DS, GTM, HF, Assistente)
└── Layout (estrutura HTML: wrappers, main, editor attrs)
    └── Seções CMS resolvidas
```

## Quando criar um novo layout

| Situação                                    | Solução                                  |
| ------------------------------------------- | ---------------------------------------- |
| Página precisa de cor/espaçamento diferente | CSS via `data-layout` no layout atual    |
| Página precisa de sidebar ou grid diferente | Novo componente de layout                |
| Página precisa de dois `<main>` ou sem HF   | Novo componente de layout + campo no CMS |

**Regra prática:** se a diferença é só visual, resolva no CSS. Se a estrutura
HTML muda, crie um layout novo.

## Estrutura de pastas

```text
src/frontend/layouts/
  types.ts                     ← interface LayoutProps e tipo LayoutComponent
  index.ts                     ← registry: { "default": DefaultLayout, ... }
  default/
    DefaultLayout.tsx           ← layout padrão do portal
  landing/                     ← exemplo de layout customizado
    LandingLayout.tsx
```

## Exemplo completo: LandingLayout

### Passo 1 — Crie a pasta e o componente

```tsx
// src/frontend/layouts/landing/LandingLayout.tsx

import type { LayoutProps } from "../types";

export function LandingLayout({ page, children }: LayoutProps) {
  const segment = page.segment ?? "classic";

  return (
    <div className="landing-wrapper">
      <main
        className={`brad-theme-${segment} landing-main`}
        data-layout="landing"
        data-segment={segment}
      >
        {children}
      </main>
    </div>
  );
}
```

**O que o componente deve fazer:**

- usar `LayoutProps` — recebe `page: NormalizedPage` e `children: React.ReactNode`
- montar a estrutura HTML da página
- usar `page.segment` e `page.pageLayout` quando necessário

**O que o componente NÃO deve fazer:**

- buscar dados no AEM ou em qualquer API
- importar de `@/server/aem/*` ou `@/server/cms`
- duplicar lógica de recursos globais (DS, GTM, HF, Assistente) — isso é do `PageShell`

### Passo 2 — Registre em `index.ts`

```typescript
// src/frontend/layouts/index.ts

import { DefaultLayout } from "./default/DefaultLayout";
import { LandingLayout } from "./landing/LandingLayout"; // ← novo
import type { LayoutComponent } from "./types";

export const layouts: Record<string, LayoutComponent> = {
  default: DefaultLayout,
  landing: LandingLayout, // ← registra com a chave que virá do AEM
};

export type { LayoutProps, LayoutComponent } from "./types";
```

A chave (`"landing"`) deve corresponder ao valor que o AEM define em
`pageLayout` no Sling Model da página.

### Passo 3 — Configure no AEM

No template AEM da página, defina `pageLayout = "landing"`. A partir daí,
qualquer página que use esse template automaticamente receberá o
`LandingLayout`.

### Passo 4 — Verifique lint e testes

```bash
npm run lint
npm test
```

Não há gerador para layouts — o único passo manual é o registro em `index.ts`.

## Variação CSS em vez de novo layout

Para diferenças puramente visuais, o `DefaultLayout` já emite `data-layout`
no `<main>`. Use isso no CSS sem criar componente novo:

```css
/* styles globais ou CSS Module da página */
main[data-layout="landing"] {
  max-width: 100%;
  padding: 0;
}

main[data-layout="product"] {
  background: var(--color-surface-secondary);
}
```

## Interface `LayoutProps`

```typescript
// src/frontend/layouts/types.ts
interface LayoutProps {
  page: NormalizedPage; // dados completos da página
  children: React.ReactNode; // seções já resolvidas
}
```

## Checklist de novo layout

- [ ] pasta `src/frontend/layouts/<nome>/` criada
- [ ] componente implementa `LayoutProps`
- [ ] `export` nomeado (não `export default`) — consistente com os demais
- [ ] registrado em `src/frontend/layouts/index.ts`
- [ ] `npm run lint` passa
- [ ] `pageLayout` configurado no template AEM correspondente

## Troubleshooting

### Layout não é aplicado

Verifique se o valor de `pageLayout` no AEM está exatamente igual à chave
registrada em `index.ts`. A comparação é case-sensitive.

### Página usa `"default"` quando deveria usar outro layout

`page.tsx` usa `page.pageLayout ?? "default"` como chave. Se `pageLayout`
não está chegando no `NormalizedPage`, verifique se:

1. o campo existe no `PortalPage` (shape bruto do AEM)
2. o adapter mapeia `pageLayout` para `NormalizedPage`

### Layout não exporta `children`

O layout deve sempre renderizar `{children}`. Sem isso, todas as seções da
página somem silenciosamente.
