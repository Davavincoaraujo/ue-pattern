# Como Adicionar Outro Provider

## Passo a passo

1. Crie um adapter em `src/server/content/provider/`.
2. Faça o adapter devolver `NormalizedPage`.
3. Registre o provider em `src/server/content/index.ts`.
4. Crie um plugin de editor próprio ou use `noop-editor.ts`.
5. Revise `buildAssetUrl()` e `getAuthHeaders()` para o novo backend.
6. Decida como redirects, downloads e PageShell devem se comportar no novo
   contexto.

## Ponto crítico no portal

No portal, a troca de provider não termina no adapter. Também é necessário
avaliar:

- redirects do middleware
- fallback de downloads
- dependências de PageShell
- anotações editoriais baseadas em paths do provider

## Contrato mínimo

Cada página ainda precisa chegar ao runtime com:

- `componentGroups`
- `sections`
- campos de página consumidos por metadata e PageShell
- `pageLayout` (opcional — fallback `"default"` é usado quando ausente)

## Estratégia recomendada

Migre primeiro o consumo do conteúdo, depois a experiência editorial e, por
fim, os pontos operacionais do middleware.
