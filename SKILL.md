---
name: ue-pattern
description: Padrão completo para construir, validar e revisar componentes AEM Universal Editor em projetos Next.js headless (definition, mapper, componente, CSS Module, registry, subItems, Content Fragments, CTA, SEO e RTE, pixel-perfect com Figma). Inclui um CLI que consulta o padrão, valida um componente contra as convenções, gera o esqueleto v1 e confere o resultado contra specs do Figma ou contra uma imagem de referência (de-para). Use ao criar componente novo, ao revisar um existente, ao decidir entre multifield, subItems e Content Fragment, ao montar dialog de autoria, ao migrar uma seção do Figma ou ao comparar a página renderizada com um design.
---

# ue-pattern

Para construir um componente inteiro sem acompanhar cada passo, use o agente `ue-pattern-builder` (`adapters/claude-code/ue-pattern-builder.md`; fonte em `agent/AGENT.md`, que também serve a outras ferramentas), que executa o ciclo abaixo sozinho e para nas decisões que são do usuário. Configuração: `README.md`.

Skill única que reúne o padrão (documentação em `reference/`) e as ferramentas (CLI em `dist/cli.js`).

Neste arquivo, `UE` significa `node <pasta-desta-skill>/dist/cli.js`. Com a instalação padrão: `node $UE_PATTERN_DIR/dist/cli.js`. Rode os comandos de componente na raiz do projeto, ou passe `--projeto <caminho>`.

## Fluxo para criar um componente

1. **Consultar**: `UE buscar "<dúvida>"` e `UE ler <id> --secao "<título>"`. Não carregue os arquivos inteiros sem necessidade; são 6.000 linhas.
2. **Decidir o padrão de conteúdo** (tabela abaixo).
3. **Gerar o esqueleto**: `UE criar <grupo> <nome> --titulo "<Título>"` (dry-run). Revise e repita com `--gravar`.
4. **Implementar** JSX, CSS e mapper seguindo as regras abaixo.
5. **Registrar**: `npm run generate:registries` no projeto.
6. **Validar**: `UE validar <grupo>/sections/<nome>/v1`; depois typecheck, lint e testes do projeto.
7. **Conferir o visual**: `UE spec <arquivo>.figma.json` e/ou `UE comparar <ref.png> <rota> --largura <N>`.
8. **Testar no editor**: abrir o dialog, preencher, salvar e reabrir.

## Comandos

| Comando | Para quê |
|---|---|
| `UE topicos` | Lista os documentos de `reference/` |
| `UE ler <id> [--secao "<título>"]` | Lê um documento ou só uma seção |
| `UE buscar "<consulta>" [--limite N]` | Busca por palavras-chave com trechos |
| `UE validar <caminho>` | Valida um componente v1 (relativo a `src/frontend/components`) |
| `UE validar-grupo <grupo>` | Valida todos os componentes de um grupo |
| `UE criar <grupo> <nome> --titulo "<T>" [--tipo sections\|components] [--campos "nome:Rótulo:tipo,..."] [--gravar]` | Esqueleto v1; tipos de campo: `text`, `richtext`, `asset`, `boolean`. Dry-run sem `--gravar`; nunca sobrescreve |
| `UE specs` | Lista `e2e/pixel-perfect/specs/*.figma.json` |
| `UE spec <arquivo> [--frame mobile] [--base-url URL]` | Mede o computed style no Chrome e compara com o spec, tolerância zero |
| `UE comparar <ref.png> <rota> --largura N [--seletor CSS] [--pagina-inteira] [--escala 2] [--esperar CSS] [--tolerancia 0.1] [--limite 0] [--nome x]` | De-para por imagem; grava `referência \| atual \| diff` em `outputs/` |

Variáveis opcionais: `UE_PATTERN_PROJECT_PATH`, `UE_PATTERN_BASE_URL` (padrão `http://localhost:3000`), `UE_PATTERN_OUTPUT_PATH`, `CHROME_EXECUTABLE_PATH`.

`spec` e `comparar` precisam do servidor do projeto rodando e de Chrome instalado.

## Anatomia (resumo)

```
src/frontend/components/<grupo>/[sections|components]/<nome>/v1/
  definition.ts   mapper.ts   <nome>.tsx   <Nome>.module.css   index.ts   __tests__/mapper.test.ts
```

- `group` da definition = nome da pasta do grupo. `modelId` = `<grupo>--<nome>`.
- Dialog em abas via `tab()`, terminando com `...DL_FIELDS`. Campo novo é local na definition; nunca altere builders compartilhados.
- Mapper síncrono e puro: sem fetch, sem `await`. Opcional com `|| undefined`, nunca `?? undefined`. Retorno com `satisfies <Nome>Props`.
- Texto autorável via `richTextHtml()` + `dangerouslySetInnerHTML`; nada hardcoded.
- Editor via `getEditorProps()`; nunca `data-aue-*` manual.
- Registry gerado, nunca editado à mão. `src/app` e `src/frontend` não importam de `@/server/aem/*`.
- `<button>` custom precisa de `cursor: pointer`. Estilo em CSS Module, valores em token do Design System.

## Qual padrão de conteúdo repetido

| Situação | Padrão |
|---|---|
| Item com um valor escalar (string, tag) | Multifield cru (`parseMultifield`) |
| Item com 2+ campos, imagem ou link (**padrão**) | `subItems` com `_path` por item |
| Dado reusado em várias páginas | Content Fragment + persisted query + `cf-fetch.ts` |

Dentro de multifield não há `condition` nem multifield aninhado, e todos os itens usam os mesmos `fields`. Recolher itens: `collapsible: true`.

## Onde aprofundar

- Guia completo, em ordem de leitura: `docs/GUIA-DE-CONSTRUCAO.md`.
- Como o CLI funciona e a tabela de regras do validador: `docs/COMO-FUNCIONA.md`.
- Arquitetura, construção e pixel-perfect: `reference/construcao/` (`RESUMO.md` primeiro).
- Experiência de autoria (listas, CF, SEO e RTE): `reference/autoria/` (`RESUMO.md` primeiro).

Itens de maior valor por assunto:

| Assunto | Arquivo |
|---|---|
| Criar passo a passo | `reference/construcao/reference/development/creating-components.md` |
| subItems | `reference/construcao/reference/development/component-subitens.md` |
| Streaming e CLS | `reference/construcao/reference/development/streaming-suspense-cls.md` |
| Listas e multifield | `reference/autoria/reference/padrao-listas-e-subitems.md` |
| Content Fragments | `reference/autoria/reference/padrao-content-fragments.md` |
| Título, SEO e RTE | `reference/autoria/reference/padrao-seo-texto.md` |
| Figma para CSS | `reference/construcao/reference/padrao-pixel-perfect.md` |

## Atualizar a documentação

`reference/` vem de duas skills locais por `npm run sync-knowledge` (variável `UE_PATTERN_SKILLS_PATH` aponta a origem; padrão `~/.claude/skills`). O script remove marcas e arquivos proprietários na cópia. Depois de sincronizar, rode `npm run build && npm test`.

## Limites

- A validação é estática e heurística: erro é desvio provável, não prova. Leia o relatório antes de agir.
- O CLI não faz commit, push nem altera nada além dos arquivos do componente (`criar --gravar`) e dos PNGs em `outputs/`.
- `spec` depende de seletores e rotas que existam no projeto; 404 na rota é erro de ambiente, não do componente.
