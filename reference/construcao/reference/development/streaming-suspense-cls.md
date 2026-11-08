# Streaming SSR, Suspense e CLS — padrão de fetch em seções

## Contexto

Toda seção da página é renderizada pelo `resolver.tsx` dentro de
`<Suspense fallback={null}>`. Isso habilita streaming SSR: seções rápidas vão
no primeiro flush do HTML; seções que suspendem (qualquer `await` de rede no
render) chegam depois como segmento streamado (`<div hidden id="S:...">` no fim
do documento, movido pro lugar por script).

Consequência: **um `await` de fetch dentro do render de uma seção tira a seção
inteira do primeiro flush**. Como o fallback é `null` (zero pixels), a página
monta sem a seção e tudo abaixo dela sofre layout shift quando o HTML chega.

## Caso real (jul/2026)

O CTA "Abra sua conta" em modo formulário faz fetch de Content Fragment
(`fetchContactFormConfig`) durante o render. Esse `await` estava no caminho
crítico do slide do banner (`renderBannerSlide`), então a seção inteira do
banner — incluindo a imagem LCP — streamava por último:

- CLS medido: **0.643** (0.596 só do shift de ~640px quando o banner chegava)
- LCP: imagem só descoberta quando o segmento chegava (`resourceLoadDelay`
  ~500ms)

## O padrão correto

**Fronteira de Suspense define o raio de impacto de um await lento.** Fetch
que só alimenta um pedaço pequeno da seção (um botão, um badge) deve ficar num
`<Suspense>` próprio em volta SÓ desse pedaço, com fallback que reserva o
espaço do conteúdo real:

```tsx
const ctaButton = (
  <Suspense
    fallback={<span aria-hidden style={{ display: "block", minHeight: 48 }} />}
  >
    <CtaButtonSlot {...props} />
  </Suspense>
);
```

- `CtaButtonSlot` (`_shared/resolveCtaButton.tsx`) é a versão componente do
  `resolveCtaButton` — Server Component async que faz o fetch.
- O fallback de 48px bate com o `min-height` do `Button` — quando o botão
  streama, ocupa espaço já reservado, shift zero.
- Aplicado em `banner/v1/renderBannerSlide.tsx` e
  `media-text/v1/media-text.tsx`.

Resultado: banner no primeiro flush, CLS **0.643 → 0.047**, Lighthouse 95.

## Dedup de fetch por request

`fetchContactFormConfig` é envolvido em `cache()` do React
(`floating-cta/v1/cf-fetch.ts`): banner, media-text e floating-cta geralmente
apontam pro MESMO `configCfPath` na mesma página, e sem o `cache()` cada um
refaria o fetch — o `cache: "no-store"` usado em `AEM_ENV=local`
(`persisted-query.ts`) não memoiza nada sozinho.

```ts
async function fetchContactFormConfigImpl(cfPath?: string) { ... }
export const fetchContactFormConfig = cache(fetchContactFormConfigImpl);
```

`cache()` compara argumentos por igualdade referencial — funciona aqui porque o
argumento é uma string (path). Não envolva funções cujo argumento é um objeto
literal novo a cada chamada (sempre cache miss).

## Regras práticas

1. Nunca deixe `await` de rede no caminho crítico de uma seção above-the-fold.
   Isole em componente async próprio + `<Suspense>` cirúrgico.
2. Fallback de Suspense reserva o espaço do conteúdo real (min-height/skeleton)
   — `fallback={null}` em conteúdo com altura é CLS garantido.
3. Fetch de CF compartilhado entre seções → `cache()` do React com argumento
   escalar (string), pra deduplicar por request.
4. Pra validar: `curl` na página e conferir o offset do HTML da seção (deve
   estar perto do `<main>`, não no fim do documento), e medir CLS com
   PerformanceObserver `layout-shift` (ver histórico: shift chegava aos ~785ms
   com fonte `sources` apontando a seção inteira).
