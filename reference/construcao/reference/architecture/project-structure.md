# Estrutura do Projeto

## Raiz

| Caminho          | Papel                                     |
| ---------------- | ----------------------------------------- |
| `src/`           | código principal                          |
| `scripts/`       | geração e validação do registry           |
| `public/`        | legado, assets estáticos e web components |
| `documentation/` | documentação canônica do projeto          |

## `src/app`

- `layout.tsx`: bootstrap global do editor
- `page.tsx`: redireciona a raiz do portal
- `[...slug]/page.tsx`: renderização das páginas CMS
- `legacy/serve/route.ts`: entrega conteúdo legado
- `api/content/route.ts`: proxy autenticado de assets
- `api/universal-editor/*`: discovery do editor
- `health/route.ts`: health check

## `src/common`

- `types/page.ts`: contrato `NormalizedPage`
- `types/aem.ts`: shape bruto `PortalPage`
- `generated/registry/`: grupos gerados do portal
- `sites/auto-registry.ts`: leitura de definições e singletons

## `src/frontend`

- `components/global/`: PageShell, GTM, Header, Assistente e seções globais
- `components/html/`: componentes do grupo `html/_shared`
- `components/trabalheconosco/`: componentes da jornada de carreira
- `components/ds/`: wrappers para web components do Design System
- `layouts/`: mapa de layouts de página — cada chave é um valor de `pageLayout` vindo do AEM, o valor é o componente React responsável pela estrutura HTML da página

## `src/server`

- `aem/`: fetch, auth, assets e payloads do editor
- `content/`: fachada CMS-aware
- `editor/`: plugins de editor
- `resolver/`: lookup e lazy loading
- `legacy/`: SSI, segurança de path e fallback de download
- `redirects/`: redirect handler do portal
- `proxy.ts`: classificação de requests
- `security-headers.ts`: headers operacionais
