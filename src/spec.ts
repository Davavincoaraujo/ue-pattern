export type Unit = "px" | "ratio" | "em" | "color";

export interface ExpectedValue {
  value: number | string;
  unit: Unit;
  source: "figma" | "manual";
  note?: string;
}

export interface ElementSpec {
  selector: string;
  /** Sobrescreve grupos inteiros por frame (ex: título 32px desktop, 24 mobile). */
  frames?: Record<string, Omit<ElementSpec, "selector" | "frames">>;
  box?: Partial<
    Record<"width" | "height" | "maxWidth" | "minHeight", ExpectedValue>
  >;
  spacing?: Partial<
    Record<
      | "paddingTop"
      | "paddingRight"
      | "paddingBottom"
      | "paddingLeft"
      | "marginTop"
      | "marginRight"
      | "marginBottom"
      | "marginLeft"
      | "rowGap"
      | "columnGap",
      ExpectedValue
    >
  >;
  typography?: Partial<
    Record<
      | "fontSize"
      | "lineHeight"
      | "letterSpacing"
      | "fontWeight"
      | "textTransform",
      ExpectedValue
    >
  >;
  visual?: Partial<
    Record<
      "color" | "backgroundColor" | "borderRadius" | "borderWidth",
      ExpectedValue
    >
  >;
}

/**
 * Ordem visual dos blocos. Existe porque diff de computed style compara
 * propriedade a propriedade e NÃO enxerga sequência: um carrossel renderizado
 * acima do título passa com 0 divergências. Aprendido na marra em 2026-09-26.
 */
export interface OrderSpec {
  /** "y" para empilhamento vertical, "x" para linha. */
  by: "y" | "x";
  /** Seletores na ordem esperada. Ausentes na página são ignorados. */
  selectors: string[];
}

/**
 * Elementos que devem compartilhar a mesma linha (ou coluna). Existe porque
 * nem o diff de propriedade nem a checagem de ordem enxergam "degrau": links
 * de cards com descrições de tamanhos diferentes passam nos dois e ficam
 * desalinhados na tela. Aprendido em 2026-09-26.
 */
export interface AlignSpec {
  /** "y": mesma linha horizontal. "x": mesma coluna vertical. */
  axis: "y" | "x";
  /** Seletor que casa com TODOS os elementos que devem se alinhar. */
  selector: string;
  /** De onde medir. "start" = topo/esquerda, "end" = base/direita. */
  edge?: "start" | "end";
  /** Mínimo de elementos para a checagem valer. Default 2. */
  min?: number;
}

export interface ComponentSpec {
  component: string;
  nodeId: string;
  fileUrl: string;
  extractedAt: string;
  frames: Record<string, number>;
  url: string;
  waitFor?: string;
  elements: ElementSpec[];
  /** Ordem visual esperada, por frame. */
  order?: Record<string, OrderSpec>;
  /** Alinhamento esperado entre elementos irmãos, por frame. */
  align?: Record<string, AlignSpec[]>;
}

export interface Divergence {
  selector: string;
  property: string;
  expected: string;
  received: string;
  deltaPx?: number;
}

/**
 * Tolerância ZERO de design, mas IEEE754 não representa 1.2 × 24 exatamente:
 * dá 28.799999999999997 em vez de 28.8. Esse epsilon absorve só o ruído de
 * representação — 0.0000001px. Uma divergência real de 0.001px ainda reprova.
 */
const EPSILON_FLOAT = 1e-6;

function difere(a: number, b: number): number {
  const delta = Math.abs(a - b);
  return delta < EPSILON_FLOAT ? 0 : delta;
}

const CSS_PROPERTY: Record<string, string> = {
  width: "width",
  height: "height",
  maxWidth: "max-width",
  minHeight: "min-height",
  paddingTop: "padding-top",
  paddingRight: "padding-right",
  paddingBottom: "padding-bottom",
  paddingLeft: "padding-left",
  marginTop: "margin-top",
  marginRight: "margin-right",
  marginBottom: "margin-bottom",
  marginLeft: "margin-left",
  rowGap: "row-gap",
  columnGap: "column-gap",
  fontSize: "font-size",
  lineHeight: "line-height",
  letterSpacing: "letter-spacing",
  fontWeight: "font-weight",
  textTransform: "text-transform",
  color: "color",
  backgroundColor: "background-color",
  borderRadius: "border-radius",
  borderWidth: "border-top-width",
};

export function cssPropertyFor(key: string): string {
  const prop = CSS_PROPERTY[key];
  if (!prop) throw new Error(`Propriedade sem mapeamento CSS: ${key}`);
  return prop;
}

/**
 * Aplica o override do frame sobre a base. O merge é por propriedade, não por
 * grupo: declarar `fontSize` no mobile não apaga o `lineHeight` da base.
 */
export function resolveForFrame(
  element: ElementSpec,
  frame: string,
): ElementSpec {
  const override = element.frames?.[frame];
  if (!override) return element;

  const grupos = ["box", "spacing", "typography", "visual"] as const;
  const resolvido: ElementSpec = { selector: element.selector };

  for (const grupo of grupos) {
    const base = element[grupo];
    const extra = override[grupo];
    if (!base && !extra) continue;
    resolvido[grupo] = { ...(base ?? {}), ...(extra ?? {}) } as never;
  }

  return resolvido;
}

export function collectProperties(element: ElementSpec): string[] {
  return [
    ...Object.keys(element.box ?? {}),
    ...Object.keys(element.spacing ?? {}),
    ...Object.keys(element.typography ?? {}),
    ...Object.keys(element.visual ?? {}),
  ];
}

export function expectedFor(
  element: ElementSpec,
  key: string,
): ExpectedValue | undefined {
  return (
    element.box?.[key as keyof NonNullable<ElementSpec["box"]>] ??
    element.spacing?.[key as keyof NonNullable<ElementSpec["spacing"]>] ??
    element.typography?.[key as keyof NonNullable<ElementSpec["typography"]>] ??
    element.visual?.[key as keyof NonNullable<ElementSpec["visual"]>]
  );
}

export function compareOrder(
  esperado: string[],
  recebido: string[],
): Divergence | null {
  const presentes = esperado.filter((s) => recebido.includes(s));
  const a = presentes.join(" -> ");
  const b = recebido.filter((s) => presentes.includes(s)).join(" -> ");
  if (a === b) return null;
  return {
    selector: "(ordem visual)",
    property: "order",
    expected: a,
    received: b,
  };
}

export function compareAlign(
  spec: AlignSpec,
  posicoes: number[],
): Divergence | null {
  const minimo = spec.min ?? 2;
  if (posicoes.length < minimo) return null;

  const arredondadas = posicoes.map((p) => Math.round(p * 1000) / 1000);
  const menor = Math.min(...arredondadas);
  const maior = Math.max(...arredondadas);
  const delta = difere(maior, menor);
  if (delta === 0) return null;

  return {
    selector: spec.selector,
    property: `align-${spec.axis}${spec.edge === "end" ? "-end" : ""}`,
    expected: `todos em ${menor}px`,
    received: `variando de ${menor}px a ${maior}px (${posicoes.length} elementos)`,
    deltaPx: Number(delta.toFixed(3)),
  };
}

export function normalizeColor(input: string): string {
  const match = input.match(/rgba?\(([^)]+)\)/i);
  if (!match) return input.trim().toLowerCase();
  const parts = match[1].split(",").map((p) => p.trim());
  const [r, g, b] = parts.slice(0, 3).map((p) => Number.parseFloat(p));
  const a = parts.length > 3 ? Number.parseFloat(parts[3]) : 1;
  const hex = [r, g, b]
    .map((n) => Math.round(n).toString(16).padStart(2, "0"))
    .join("");
  return a === 1
    ? `#${hex}`
    : `#${hex}${Math.round(a * 255)
        .toString(16)
        .padStart(2, "0")}`;
}

export function compare(
  key: string,
  expected: ExpectedValue,
  computedRaw: string,
  fontSizePx: number,
): Divergence | null {
  const received = computedRaw.trim();

  if (expected.unit === "color") {
    const a = normalizeColor(String(expected.value));
    const b = normalizeColor(received);
    return a === b
      ? null
      : { selector: "", property: key, expected: a, received: b };
  }

  if (expected.unit === "ratio") {
    const receivedPx =
      received === "normal" ? Number.NaN : Number.parseFloat(received);
    if (Number.isNaN(receivedPx)) {
      return {
        selector: "",
        property: key,
        expected: `${expected.value} (ratio)`,
        received,
      };
    }
    const expectedPx = Number(expected.value) * fontSizePx;
    const delta = difere(receivedPx, expectedPx);
    return delta === 0
      ? null
      : {
          selector: "",
          property: key,
          expected: `${expectedPx}px (${expected.value} × ${fontSizePx}px)`,
          received: `${receivedPx}px`,
          deltaPx: Number(delta.toFixed(3)),
        };
  }

  if (expected.unit === "em") {
    const expectedPx = Number(expected.value) * fontSizePx;
    const receivedPx =
      received === "normal" ? 0 : Number.parseFloat(received) || 0;
    const delta = difere(receivedPx, expectedPx);
    return delta === 0
      ? null
      : {
          selector: "",
          property: key,
          expected: `${expectedPx}px (${expected.value}em)`,
          received: `${receivedPx}px`,
          deltaPx: Number(delta.toFixed(3)),
        };
  }

  if (typeof expected.value === "string") {
    return String(expected.value) === received
      ? null
      : {
          selector: "",
          property: key,
          expected: String(expected.value),
          received,
        };
  }

  const receivedPx = Number.parseFloat(received);
  const delta = difere(receivedPx, expected.value);
  return delta === 0
    ? null
    : {
        selector: "",
        property: key,
        expected: `${expected.value}px`,
        received: `${receivedPx}px`,
        deltaPx: Number(delta.toFixed(3)),
      };
}

export function formatReport(
  spec: ComponentSpec,
  frame: string,
  divergences: Divergence[],
  checked: number,
): string {
  const header = `${spec.component} @ ${frame} (${spec.frames[frame]}px) — ${checked} propriedades comparadas`;
  if (divergences.length === 0) {
    return `✓ ${header}\n  0 divergências — pixel-perfect`;
  }
  const rows = divergences.map((d) => {
    const delta = d.deltaPx !== undefined ? `  Δ ${d.deltaPx}px` : "";
    return `    ${d.selector} · ${d.property}\n      esperado ${d.expected}\n      recebido ${d.received}${delta}`;
  });
  return `✗ ${header}\n  ${divergences.length} divergências:\n${rows.join("\n")}`;
}
