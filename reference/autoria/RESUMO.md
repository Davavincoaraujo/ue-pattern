
# Padrão de Autoria — AEM Universal Editor

Skill autocontida: tudo que ela afirma está em `reference/`, com as fontes
Adobe citadas. Não depende do repo `seu-projeto` estar aberto.

**Escopo:** Universal Editor sobre páginas AEM (pathway `aem`, nós JCR).
Edge Delivery Services está **fora** — quando uma fonte Adobe mistura os dois,
só a parte aplicável ao pathway `aem` vale aqui.

**Relação com outras skills:**

| Skill | Papel |
| --- | --- |
| `aem-universal-editor` | Conhecimento Adobe cru (API, models, filtros, extensibilidade) |
| `seu-design-system` | Tokens `--ds-*`, classes utilitárias, temas, componentes prontos |
| `construcao` | Arquitetura do projeto (camadas, registry, mapper, CTA, CF) |
| **`autoria`** (esta) | **Decisões de autoria: listas, dialogs, SEO, RTE** |

Em conflito, **esta skill vence** para os assuntos que ela cobre. A §3 de
`construcao` ("3 padrões de conteúdo repetido") está
superada pela Decisão 1 abaixo.

---

## Princípio

> O dialog deve tornar o conteúdo inválido **impossível**, não apenas
> desencorajado.

Campo que não se aplica, tag que quebra o CSS, item arrastado pro container
errado — tudo isso é validação terceirizada pro gestor. Ele não tem como
saber. A estrutura tem.

Cada campo no dialog é custo cognitivo cobrado em toda edição. Cada componente
no picker é custo de decisão cobrado em toda inserção. Otimize o caso comum.

---

## Decisão 1 — `subItems` é o default; multifield cru é a exceção

| Item contém… | Padrão |
| --- | --- |
| 1 valor escalar (string, tag) | multifield cru |
| 2+ campos, ou imagem, ou link | **`subItems`** (container + child component) |

Não é preferência estética. É a única via, por três limitações documentadas
pela Adobe:

1. **`condition` não funciona dentro de item repetível.**
   *"Condition var resolution is absolute, not relative to the current row."*
   *"conditions inside multi containers aren't supported"* — o conteúdo da
   linha é indexado em runtime como `containerName/0|fieldName`, índice que não
   existe quando a condição é escrita e muda quando o autor reordena.
2. **Multifield dentro de multifield é proibido.**
   *"container nesting is not permitted for multi-fields in the properties panel"*
3. **Reordenar o último item duplica** em vez de mover — bug aberto, sem
   resolução na Experience League.

Detalhe completo, com as 3 peças de código: `reference/padrao-listas-e-subitens.md`.

### As 3 peças — falta uma, desmonta

```ts
// 1. definition.ts — registra o item
subItems: [{ id: "grupo--card", title: "Card",
             containerField: "cards", fields: camposDoCard }]
```

```tsx
// 2. pai — marca o container (sem isso não aparece o "+")
getEditorProps({ resource: `${_path}/cards`, type: "container", filter: cardModel })
```

```tsx
// 3. atom filho — marca a si mesmo (sem isso, clicar não abre nada)
getEditorProps({ resource: _path, type: "component", model })
```

E o `_path` do item precisa bater com o nó JCR real (`.../cards/item0`),
senão o editor responde *"Falha ao buscar detalhes"*.

---

## Decisão 2 — Variação que muda campos é outro `subItem`

**Muda os CAMPOS → `subItem` separado.
Muda só a APARÊNCIA → `select` dentro do item.**

O picker do "+" vira a UI de variação: o gestor escolhe o tipo antes de ver os
campos, em vez de mexer num dropdown e ver o formulário se transformar.

Descartado: `cardType` no item (libera misturar tipos no mesmo grid —
inconsistência visual por default) e união de todos os campos num model só (o
gestor vê campos que não fazem nada e não tem como saber quais).

---

## Decisão 3 — `components: null` só no root, só em dev

*"Setting the `components` attribute in a filter definition to `null` allows
all components, as if there were no filter."*

**Nunca em filtro de container de item.** Deixa arrastar uma seção inteira pra
dentro de um card. Não dá erro — gera conteúdo inválido que só aparece em
produção. É a decisão mais perigosa do conjunto porque falha em silêncio.

---

## Decisão 4 — A tag vem do select; a ênfase vem de richtext travado

Duas perguntas diferentes. Misturá-las é a origem da bagunça:

| Pergunta | Quem responde |
| --- | --- |
| Qual **tag** envolve o texto? | `titleType` — campo `select` |
| Como enfatizar **parte** do texto? | `richtext` com perfil travado |

O erro não é usar `richtext` num título. É deixar o richtext **decidir a tag**.
Sem `blocks` no perfil, o autor não tem como emitir `<h1>`.

```ts
{ name: "title", label: "Título", type: "richtext" },      // perfil RTE_TITULO
{ name: "titleType", label: "Nível do título", type: "select",
  options: [{ label: "H2 — título de seção", value: "h2" },
            { label: "H3 — subtítulo", value: "h3" }] },
```

```tsx
const H = (titleType || "h2") as "h1" | "h2" | "h3";
<H className={styles.title} dangerouslySetInnerHTML={richTextInlineHtml(title)} />
```

`richTextInlineHtml` descarta `<p>`/`<div>`/`<h1-6>` e preserva inline — é a
regra implementada em código.

Título que nunca leva destaque interno: use `type: "text"` e pule o richtext.

**Exponha `h1`–`h6` em todo campo de título, e nível também no eyebrow**
(`p` + `h1`–`h6`). O que muda por contexto é o **default**, não o disponível:
hero `h1`, seção `h2`, item de lista `h3`, eyebrow `p`. Restringir a lista era
decisão minha e foi revertida pelo time em 2026-09-26 — o risco de `h1`
duplicado se resolve com **auditoria da página**, não tirando a ferramenta do
autor.

Isso exige default explícito: o gerador do UE usa a PRIMEIRA opção do select.
`ComponentField.value` resolve — ordem natural na lista, default correto no
template. Use `headingLevelField()` de `_shared/dialog-fields.ts`.

---

## Decisão 5 — Parágrafo não tem `type`; tem nível de liberdade

`<p>` não tem variação hierárquica. Não existe `paragraphType`.

| Nível | `type` | Perfil | Quando |
| --- | --- | --- | --- |
| Texto puro | `text` | — | Rótulo, kicker, texto de botão, alt |
| Texto longo | `textarea` | — | Descrição corrida sem formatação |
| Formatável | `richtext` | `RTE_INLINE` | Negrito, itálico ou link em parte da frase |

Itálico em meia frase é **inline** — conteúdo, não estrutura. É o uso legítimo
do richtext. A regra nunca foi "nunca richtext":

> **Richtext para formatação inline dentro de texto em fluxo.
> Nunca para decidir estrutura.**

---

## Decisão 6 — RTE se configura no filtro, não no campo

```json
{
  "id": "grupo--card",
  "components": ["grupo--card"],
  "rte": { "toolbar": { "format": ["bold", "italic"], "insert": ["link"] } }
}
```

Quatro perfis, nenhum permite heading, cor ou fonte:

| Perfil | Permite | Usar em |
| --- | --- | --- |
| `RTE_TITULO` | negrito, itálico | Campo `title` |
| `RTE_INLINE` | + link | Parágrafo curto, descrição de card |
| `RTE_CORPO` | + parágrafo, listas | Texto longo, FAQ, termos |
| `RTE_LEGAL` | só negrito | Rodapé legal, disclaimer |

**Por que o CSS manda:** as categorias de toolbar documentadas pela Adobe são
`format`, `blocks`, `list`, `insert`, `alignment`, `direction`, `indentation`,
`sr_script`, `editor`, `advanced`, `dropdowns`, `sections`, `extensions`.
**Não existe categoria de cor ou de fonte.** Omitindo o que não está nos
perfis, o autor não tem como emitir `style="color:…"`.

Exceção: derive do perfil mais próximo no componente específico, não crie um
quinto perfil genérico.

```ts
const RTE_CORPO_COM_TABELA = {
  toolbar: { ...RTE_CORPO.toolbar, insert: ["link", "table"] },
} as const;
```

---

## Decisão 7 — Builders compartilhados, adesão opcional

**`headingFields()` e `paragraphField()` nunca existiram.** Eram proposta, e
esta skill as descrevia como implementação — verificado em 2026-10-04: não
existem nem em `seu-projeto` nem em `seu-projeto`. Ao ler
qualquer API aqui, confira no repo antes de usar.

O que existe, em `seu-projeto`, é o mesmo efeito por outro caminho:
estender o builder de cabeçalho que já havia, em vez de criar uma abstração
paralela.

```ts
// _shared/cabecalho-secao.ts — gera eyebrow + titulo + tituloTag + subtitulo
buildCabecalhoSecaoFields()            // h2 default, perfil de RTE em cada campo
buildCabecalhoSecaoFields("proposta")  // prefixado: propostaTitulo, propostaTituloTag
```

O perfil de RTE é declarado **no campo**, em `definition.ts` (`rte: "titulo"`),
e a anotação o lê de lá por `criarCampoRico(definition)` — fonte única, sem o
TSX repetir o perfil.

Tag fixa (sem select) é feita no componente, não no builder:

```tsx
<Texto html={titulo} tag="h1" />   // hero: `singleton`, um h1 por página
```

Implementação: `seu-projeto/documentation/padroes/16-seo-e-campos-de-texto.md`.

---

## Decisão 8 — CF é sobre reuso, não sobre tamanho

Content Fragment não é "multifield melhor". É outro eixo: **reuso e
governança**.

| Situação | Padrão |
| --- | --- |
| Conteúdo só existe nesta seção | `subItems` (Decisão 1) |
| Mesmo dado em várias páginas/componentes | **Content Fragment** |
| Dado com validação forte (regex, unicidade) | **Content Fragment** — CF Model valida, dialog não |

Não crie CF só pra "organizar". Cada CF custa: modelo, persisted query, script
de provisionamento, cache, e um passo a mais pro gestor entender de onde o
conteúdo vem.

---

## Decisão 9 — CF editável in-context, inclusive aninhado

Tudo depende de pra onde o `data-aue-resource` aponta:

| Alvo | URN |
| --- | --- |
| Nó JCR da página | `urn:aemconnection:/content/.../jcr:content/root/<no>` |
| **Content Fragment** | `urn:aemconnection:<damPath>/jcr:content/data/master` |
| Variação de CF | idem + `data-aue-variation="<nome>"` |

Três padrões:

- **CF-1** — CF simples: root do bloco com `resource: <damPath>/jcr:content/data/master`
  e `type: "reference"`; campos com `prop` usando nomes do **CF Model**.
  O dialog da seção tem só `cfPath`, nunca uma cópia dos campos do CF.
- **CF-2** — content reference única: o CF filho é outro asset, então tem
  `resource` próprio (`<filho._path>/jcr:content/data/master`). Exige que a
  persisted query retorne `_path` do filho.
- **CF-3** — multi-reference: container no campo multi-ref do CF pai.
  *"if set the container is a content fragment and the prop points to a
  multi-reference field"*.

```tsx
// CF-3
<ul {...getEditorProps({
  resource: `${paiPath}/jcr:content/data/master`,
  type: "container", prop: "agencias", filter: "cf-agencia",
})}>
  {itens.map((a) => (
    <li key={a._path} {...getEditorProps({
      resource: `${a._path}/jcr:content/data/master`,
      type: "reference", label: a.title,
    })}>
```

**Exceção do CF-3:** se a lista é filtrada, ordenada ou paginada no cliente,
**não** faça o pai virar container — o "+" adicionaria ao fim da coleção real
enquanto o gestor vê um recorte. Instrumente só os itens.

`cfPath` do picker `aem-content` vem com sufixo: sempre
`.split(";")[0].trim()` antes de montar a URN.

Detalhe completo: `reference/padrao-content-fragments.md`.

---

## Decisão 10 — Os três contratos são separados

```
CF Model            -> schema e validação durável
CF                  -> instância de conteúdo autorado
GraphQL/persisted   -> contrato de entrega e cache
data-aue-*          -> mapeamento DOM → recurso
UE model/filter     -> painel de propriedades e restrições de inserção
```

Não force CF Model, query de entrega e model do UE a compartilharem nome ou
estrutura por conveniência. O `mapper.ts` é o lugar do mapeamento explícito.

Aninhamento de CF: teto técnico da Adobe é 10 níveis; **teto prático deste
padrão é 2**.

---

## Fluxo ao criar componente novo com lista

```
1. O item tem 2+ campos?  → SIM: subItems. NÃO: multifield cru.
2. Há tipos com campos diferentes? → um subItem por tipo.
3. Escrever as 3 peças (definition / container / atom).
4. Conferir que o _path do item bate com o nó JCR.
5. Título: buildCabecalhoSecaoFields(). Perfil de RTE em todo richtext.
6. Todo richtext coberto por um perfil RTE no filtro.
7. Filtro do container lista tipos explícitos, nunca null.
8. Rodar o checklist das duas referências.
```

---

## Antipadrões — sinalizar sempre

- `condition` dentro de campo de item repetível (não é suportado)
- multifield dentro de multifield
- `richtext` decidindo a tag do heading
- `h1` disponível em componente que repete na página
- bloco de analytics repetido dentro de cada item de multifield
- filtro de container com `components: null`
- campo `text` livre para um conjunto fechado (deveria ser `select`)
- componente novo criado porque uma página pediu, sem avaliar variante
- título de componente exposto ao autor com versão técnica (`(v1)`)
- dialog da seção repetindo os campos do CF que ele já referencia
- CF referenciado herdando o `resource` do pai (cada CF tem o seu)
- container de CF numa lista filtrada ou paginada no cliente
- URN de CF montada sem `.split(";")[0]` no `cfPath`
- CF criado só pra "organizar", sem reuso real
- `line-height` arredondado em vez de `value / fontSize` exato
- margem externa em átomo (espaçamento é do pai, via `gap`)
- reimplementar à mão componente que já existe no DS
- valor repetido 3+ vezes sem virar token

---

## Arquivos de referência (`reference/`)

| Arquivo | Conteúdo |
| --- | --- |
| `padrao-listas-e-subitens.md` | Decisões 1–3, fluxogramas, as 3 peças, checklist, dívida mapeada, fontes |
| `padrao-seo-texto.md` | Decisões 4–7, perfis RTE, builders, fluxogramas, checklist de SEO, fontes |
| `padrao-content-fragments.md` | Decisões 8–10, URNs de CF, padrões CF-1/2/3, fluxograma, checklist, fontes |

Ambos carregam a seção **Fontes consultadas** com os links Adobe. Toda
afirmação técnica é rastreável. Onde algo **não** é documentado pela Adobe, os
documentos dizem isso explicitamente em vez de inventar.

---

## EM ABERTO — validar antes de virar regra

1. **`condition` num campo `tab`** — esconder aba inteira por variação. A Adobe
   descreve `tab` como *"purely UI organization. Not a data field."* e não diz
   se `condition` é respeitado. Testar no AEM local; até lá, fora do padrão.
2. **Forma de persistência do multifield** — o código do projeto se contradiz
   (propriedade JSON vs sub-nós `item0`). Abrir um componente autorado no CRXDE
   define se migrar existentes é só código ou precisa de script.
3. **`data-aue-variation`** — suportado por `getEditorProps`, nunca usado.
   Falta confirmar como o editor expõe a troca de variação ao gestor.
4. **Filtro de CF em container (CF-3)** — a Adobe documenta `filter` no
   container, mas o gerador de filtros do projeto só emite filtros de
   componente de página.
5. **`RTE_TITULO` deve permitir link?** — recomendação é não: título clicável
   inteiro é o padrão, e link parcial dentro de heading é ruim pra
   acessibilidade e pra Data Layer.

---
