# Integração com Universal Editor

## Bootstrap global

`src/app/layout.tsx` publica:

- `cors.js`
- meta `aemconnection`
- meta opcional do serviço local
- script global de `model-definition`

## Payloads por página

`src/app/[...slug]/page.tsx` injeta, por contexto:

- `component-definition`
- `filter-definition`

Esses payloads são filtrados por `componentGroups`, limitando o editor ao
escopo da página atual.

## Anotação de DOM

Os componentes devem usar `getEditorProps()` para:

- recurso editável
- tipo do elemento
- `model`
- label
- `prop`
- filtro de container

## Particularidades do portal

- a página raiz do editor envolve o conteúdo em um wrapper anotado como
  `page-meta`
- o `<main>` recebe o container editorial da página
- o runtime de página continua separado do bootstrap do editor
