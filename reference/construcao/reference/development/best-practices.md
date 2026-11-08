# Boas Práticas

## Layouts

- use variação CSS via `data-layout` quando a diferença for apenas visual —
  é a opção mais simples e não exige novo arquivo
- crie um componente de layout apenas quando a **estrutura HTML** for diferente
  (ex: coluna lateral, grid diferente)
- o layout recebe `page` e `children` — não acessa o CMS diretamente
- não importe `@/server/aem/*` dentro de layouts

```tsx
// ❌ Errado — lógica de CMS dentro do layout
export function LandingLayout({ page, children }: LayoutProps) {
  const data = await fetchPage(page.path); // ← não faz isso
  return <main>{children}</main>;
}

// ✅ Correto — layout é puramente estrutural
export function LandingLayout({ page, children }: LayoutProps) {
  return (
    <div className="landing-wrapper">
      <aside>{/* sidebar estática */}</aside>
      <main data-layout="landing">{children}</main>
    </div>
  );
}
```

## Componentes

- separe `definition.ts`, mapper e renderização — a separação permite
  trocar de CMS mudando apenas o mapper
- documente dependência de DS com `minDsVersion` quando necessário
- trate `singleton` como regra de governança, não como detalhe visual
- use CSS Modules (`.module.css`) — evita conflitos por escoping nativo

## Erros comuns de componentes

```tsx
// ❌ Errado — componente acoplado ao AEM
function Banner({ section }: { section: NormalizedSection }) {
  return <h1>{section.data.title as string}</h1>;
}

// ✅ Correto — componente recebe props tipadas via mapper
function Banner({ title }: { title: string }) {
  return <h1>{title}</h1>;
}
```

```typescript
// ❌ Errado — campos AEM-specific no NormalizedPage
interface NormalizedPage {
  jcrPath: string; // Conceito JCR vazando para o contrato
}

// ✅ Correto — conceitos genéricos
interface NormalizedPage {
  path: string; // Path abstrato, não atrelado ao JCR
}
```

## Fronteiras de SSR

Todo componente sem `"use client"` é um Server Component. Apenas componentes
que **precisam de interatividade no browser** devem usar a diretiva:

| Precisa de `"use client"`              | Não precisa                        |
| -------------------------------------- | ---------------------------------- |
| `useState`, `useEffect`                | Componentes que só renderizam HTML |
| `onClick`, eventos do browser          | Seções CMS (FAQ, Banner, Hero)     |
| `addEventListener` (ex: UE Refresh)    | PageShell, layouts                 |
| Error boundaries (`componentDidCatch`) | Mappers e utilitários              |

**Erro comum:** marcar componente como Client para usar `console.log`. Isso
envia JS desnecessário ao browser — `console.log` funciona no servidor.

## Arquitetura

- não importe `@/server/aem/*` a partir de `src/app` ou `src/frontend`
- mantenha regras do provider dentro do adapter
- mantenha regras do editor dentro do plugin
- mantenha regras operacionais do portal dentro do proxy e do legado

## Conteúdo e governança

- trate `componentGroups` como allow-list oficial
- prefira nomes estáveis para `modelId`
- não misture regra editorial com lógica de apresentação

## Operação

- valide comportamento de legacy, redirect e headless quando mudar o proxy
- não assuma que `public/` é só estático; ele participa do roteamento
- teste o efeito de `dsMode` quando tocar em PageShell ou componentes DS
