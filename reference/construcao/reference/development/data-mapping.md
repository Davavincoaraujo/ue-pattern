# Mappers e Evolução do Contrato

## Quando usar `mapper.ts`

Use mapper quando:

- multifields vêm em formatos inconsistentes
- nomes brutos do conteúdo não são adequados para o React
- defaults seguros precisam ser aplicados
- assets aninhados precisam ser preparados

## Regras do mapper

- síncrono
- puro
- sem `fetch`
- resiliente a payloads incompletos

## Evoluindo `NormalizedPage`

Para dados que pertencem à página inteira:

1. atualize `PortalPage` se o campo ainda não existir no shape bruto
2. adicione o campo em `NormalizedPage`
3. traduza o valor no adapter
4. exponha no editor, se aplicável
5. consuma em metadata, `PageShell` ou `page.tsx`

## Campos típicos do portal

Exemplos reais de contrato de página:

- `segment`
- `dsMode`
- `dsVersion`
- `hfShow`
- `gtmContainerId`
- `showAssistant`
- `pageLayout` — seleciona o layout estrutural da página (ver [Criando Layouts](./creating-layouts.md))
