# Integração com AEM

## Busca de página

`src/server/aem/client.ts` implementa o fetch:

- usa `AEM_HOST` e `AEM_CONTENT_PREFIX`
- tenta path direto e fallback `path/index`
- cache gerenciado pelo **Next.js Data Cache** (`revalidate: 60` em prod, `no-store` local)
- aplica autenticação via `getAuthHeader()`

## Tradução para `NormalizedPage`

`src/server/content/provider/aem-adapter.ts` converte `PortalPage` para
`NormalizedPage` e também:

- monta `editorContentPath`
- monta `editorContainerPath`
- traduz campos editoriais para o contrato interno
- conecta redirects reais via `checkRedirect()`

## Redirects

O portal consulta redirects por GraphQL em
`src/server/middlewares/redirectMiddleware.ts`:

- timeout de **2 segundos** por consulta (`AbortSignal.timeout(2000)`)
- cache em memória de **60 segundos** para hits **e misses** (evita consultas repetidas a paths inexistentes)
- limite de **1000 entradas** com evicção FIFO
- chave de cache inclui pathname **e query string** — preserva semantica de URLs completas
- assets estáticos são ignorados antes de qualquer consulta

## Assets e downloads

- `buildAssetUrl()` lida com assets gerenciados pelo CMS
- o middleware ainda pode fazer fallback de downloads via `DAM_BASE_URL`
- imagens de `*.adobeaemcloud.com` são permitidas em `next.config.ts` via `images.remotePatterns`
- a API route `/api/content` retorna `cache-control: private, no-store` (assets autenticados não devem ser cacheados por proxies)

## Autenticação

O portal suporta:

- Basic Auth local
- IMS OAuth Server-to-Server em ambientes que exigem token Adobe

---

## AEM Backend — Contrato de Integração

Esta seção documenta o que acontece **do lado do AEM** — os Sling Models,
endpoints e configurações que o Next.js consome. A documentação completa
está em `docs-mesclada/AEM_BACKEND.md`; aqui cobrimos o necessário para o
dia-a-dia do front.

### Autenticação por ambiente

O Next.js se autentica no AEM de formas diferentes por ambiente:

| Ambiente  | Método     | Detalhes                                                               |
| --------- | ---------- | ---------------------------------------------------------------------- |
| Local/Dev | Basic Auth | `AEM_AUTH_USER` / `AEM_AUTH_PASS` (padrão `admin:admin`)               |
| Produção  | IMS OAuth  | `AEM_IMS_CLIENT_ID` / `AEM_IMS_CLIENT_SECRET` via `client_credentials` |

**Assets do DAM** seguem regras próprias:

- **Author**: acesso direto via `{AEM_HOST}/content/dam/seu-projeto/...`
  (com header de autenticação).
- **Publish**: via `DAM_BASE_URL` configurado em variável de ambiente. O Next.js
  faz proxy pelo route `/api/content?path=...` ou redirect 302 direto para o DAM.

### Sling Models

O AEM expõe conteúdo via **Sling Model Exporter**, que serializa objetos Java
como JSON.

#### PortalPageModelImpl

- **Arquivo**: `seu-aem/core/.../models/PortalPageModelImpl.java`
- **Resource Type**: `seu-projeto/components/page`
- **Campos principais**: `title`, `description`, `segment`, `designSystem`,
  `gtm`, `headerFooter`, `bia`, `customCss`, `customJs`, `componentGroups`,
  `sections`

#### GenericPageModelImpl

- **Arquivo**: `seu-aem/core/.../models/GenericPageModelImpl.java`
- **Resource Type**: `seu-projeto/components/generic-page`
- **Campos**: versão reduzida — apenas `title`, `description`, `sections`

#### SectionData (DTO)

Cada seção resolvida é serializada como:

```ts
interface SectionData {
  id: string; // path do nó JCR
  type: string; // tipo em kebab-case (ex: "hero")
  version: string; // versão do componente (ex: "v1")
  data: Record<string, unknown>; // propriedades do nó (sem prefixos jcr:/sling:)
}
```

### Endpoint `model.json`

O endpoint `.model.json` é o contrato principal entre AEM e Next.js.

**URL Pattern:**

```
{AEM_HOST}/content/seu-projeto/{path}.model.json
```

**Exemplos:**

- `/content/seu-projeto/html/corporate/sobre-nos.model.json`
- `/content/seu-projeto/html/corporate/index.model.json`

O client Next.js tenta primeiro o path direto; se receber 404, tenta
`{path}/index.model.json` (lógica de fallback já documentada acima).

### Resolução de Sections

O processo de transformação de nós JCR em `SectionData`:

1. O Sling Model itera os filhos do container `root`
2. Para cada filho, verifica se existe uma property `sectionType` explícita
3. Se não existir, deriva o tipo a partir do `sling:resourceType`
   (ex: `seu-projeto/components/sections/hero` → `hero`)
4. Filtra propriedades internas (`jcr:*`, `sling:*`) e serializa os dados

### Políticas de Template

Cada template do AEM define **policies** que controlam:

- **Componentes permitidos** — quais `componentGroups` estão disponíveis
  para autores
- **Estrutura inicial** — nós pré-configurados no `jcr:content`
- **Campos bloqueados** — propriedades que autores não podem editar

**Relação Template → ComponentGroups → Registry:**

Se um template define `componentGroups: ["html/_shared", "global"]`, apenas
os componentes desses dois grupos aparecerão no Universal Editor para páginas
desse template. O Next.js usa esse mesmo array para resolver componentes via
Registry (`resolveComponent()`).

### CORS (Author Only)

O AEM Author possui configuração CORS que permite comunicação com o
Universal Editor e servidores locais de desenvolvimento:

- **Arquivo**: `seu-aem/ui.config/.../config.author/com.adobe.granite.cors.impl.CORSPolicyImpl~seu-projeto.cfg.json`
- **Origins permitidas**: `experience.adobe.com`, `localhost:3000`,
  `localhost:3001`
- **Paths permitidos**: `/content/seu-projeto.*`,
  `/graphql/execute.json.*`, experience fragments
- **Métodos**: GET, POST, PUT, PATCH, DELETE, OPTIONS

### Customização do Sites Console (`ue-button.js`)

O AEM Sites Console foi customizado com um clientlib que injeta um botão
**"Universal Editor"** na action bar:

- **Arquivo**: `seu-aem/ui.apps/.../clientlib-author-ue/js/ue-button.js`
- Executa apenas em `/sites.html` (Sites Console)
- Ao selecionar uma página, faz GET em `{pagePath}/jcr:content.json` e
  verifica se `ueEnabled === true` e se existe `ueUrl`
- Se a página for UE-enabled: exibe o botão UE e **oculta** o botão Edit
  padrão
- Se a página **não** for UE-enabled: oculta o botão UE e restaura o Edit
- Click abre
  `https://experience.adobe.com/#/@sua-org/aem/editor/canvas/{host}/{path}`
  em nova aba

Essa customização permite que autores usem o editor correto (Universal Editor
vs Page Editor clássico) de forma transparente, sem precisar conhecer a URL
manualmente.
