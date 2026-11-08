# Workflow e Qualidade

## Rotina recomendada

```bash
cp .env.local.example .env.local
npm install
npm run generate:registries
npm run dev
```

## Ao criar ou modificar um layout

```bash
# 1. Crie a pasta em src/frontend/layouts/<nome>/
# 2. Implemente o componente com LayoutProps
# 3. Registre em src/frontend/layouts/index.ts
# 4. Verifique lint
npm run lint
# 5. Rode os testes
npm test
```

Não há gerador automático para layouts — o registro é manual em `index.ts`.
Layouts são Server Components por padrão; adicione `"use client"` apenas se
o layout precisar de interatividade no browser.

## Ao criar ou modificar um componente

```bash
# 1. Faça as mudanças nos arquivos do componente
# 2. Regenere o registry (se criou/modificou definition.ts)
npm run generate:registries
# 3. Verifique lint
npm run lint
# 4. Rode testes relacionados
npx jest --bail --findRelatedTests src/frontend/components/...
```

## Antes de abrir um PR

```bash
npm run lint
npm run format:check
npm test
npm run build
```

## Quality gates

- `predev` e `prebuild` regeneram o registry automaticamente
- `lint-staged` valida arquivos staged no pre-commit
- testes de registry ajudam a detectar colisões e inconsistências
- Storybook deve ser usado para validar componentes isoladamente

## Referência rápida de comandos

| Comando                                   | O que faz                                |
| ----------------------------------------- | ---------------------------------------- |
| `npm run dev`                             | Servidor de desenvolvimento (porta 3000) |
| `npm run build`                           | Build de produção                        |
| `npm run start:prod`                      | Servidor de produção local               |
| `npm run generate:registries`             | Regenera o registry de componentes       |
| `npm run lint`                            | Verifica lint                            |
| `npm run lint:fix`                        | Corrige lint automaticamente             |
| `npm run format`                          | Formata código com Prettier              |
| `npm run format:check`                    | Verifica formatação sem alterar          |
| `npm test`                                | Roda todos os testes                     |
| `npm test -- path/to/file`                | Roda teste específico                    |
| `npx jest --bail --findRelatedTests path` | Testes relacionados a um arquivo         |
| `npm run storybook`                       | Storybook na porta 6006                  |

## Quando reiniciar vs quando regenerar

| Situação                    | Ação                                                      |
| --------------------------- | --------------------------------------------------------- |
| Mudou `definition.ts`       | `npm run generate:registries` (hot reload cuida do resto) |
| Mudou `.env.local`          | Reiniciar `npm run dev`                                   |
| Mudou `next.config.ts`      | Reiniciar `npm run dev`                                   |
| Mudou componente/mapper/CSS | Nada — hot reload automático                              |
| Adicionou dependência       | `npm install` + reiniciar                                 |

## Ferramentas auxiliares

O monorepo mantém prompts em `.ia/` para tarefas recorrentes do portal. Use-os
como apoio para não perder passos de arquitetura, principalmente em registry,
editor, contrato de página e PageShell.
