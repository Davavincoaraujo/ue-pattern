import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type TipoCampo = "text" | "richtext" | "asset" | "boolean";

export interface CampoScaffold {
  name: string;
  label: string;
  type: TipoCampo;
}

export interface EntradaScaffold {
  componentsRoot: string;
  grupo: string;
  nome: string;
  titulo: string;
  tipo: "sections" | "components";
  campos?: CampoScaffold[];
}

export interface ArquivoGerado {
  caminho: string;
  conteudo: string;
}

const KEBAB = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

export function paraPascal(kebab: string): string {
  return kebab
    .split("-")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join("");
}

export function camposPadrao(): CampoScaffold[] {
  return [
    { name: "title", label: "Título", type: "richtext" },
    { name: "description", label: "Descrição", type: "richtext" },
  ];
}

function importRichtext(componentsRoot: string, grupo: string): string {
  const doGrupo = join(componentsRoot, grupo, "_shared", "richtext.ts");
  return existsSync(doGrupo)
    ? `@/frontend/components/${grupo}/_shared/richtext`
    : "@/frontend/components/global/_shared/richtext";
}

export function gerarArquivos(entrada: EntradaScaffold): ArquivoGerado[] {
  const { componentsRoot, grupo, nome, titulo, tipo } = entrada;
  if (!KEBAB.test(nome)) throw new Error(`nome deve ser kebab-case: ${nome}`);
  if (!KEBAB.test(grupo)) throw new Error(`grupo deve ser kebab-case: ${grupo}`);

  const campos = entrada.campos && entrada.campos.length > 0 ? entrada.campos : camposPadrao();
  const pascal = paraPascal(nome);
  const modelId = `${grupo}--${nome}`;
  const dir = join(componentsRoot, grupo, tipo, nome, "v1");
  const temAsset = campos.some((c) => c.type === "asset");
  const temRich = campos.some((c) => c.type === "richtext");

  const defCampos = campos
    .map((c) => {
      if (c.type === "asset") {
        return `    { name: "${c.name}", label: "${c.label}", type: "asset", filter: assetFilter },`;
      }
      return `    { name: "${c.name}", label: "${c.label}", type: "${c.type}" },`;
    })
    .join("\n");

  const assetFilter = temAsset
    ? `\nconst assetFilter = {\n  mimeTypes: ["image/png", "image/jpeg", "image/webp"],\n  path: "/content/dam/seu-projeto",\n};\n`
    : "";

  const definition = `import type { ComponentDefinition } from "@/common/types/aem";
import {
  DL_FIELDS,
  SECTION_ID_FIELD,
  tab,
} from "@/frontend/components/_shared/dialog-fields";
${assetFilter}
const definition: ComponentDefinition = {
  modelId: "${modelId}",
  name: "${nome}",
  version: "v1",
  title: "${titulo}",
  description: "${titulo}",
  group: "${grupo}",
  icon: "textImage",
  fields: [
    tab("tab-conteudo", "Conteúdo"),
${defCampos}

    tab("tab-secao", "Seção"),
    SECTION_ID_FIELD,

    ...DL_FIELDS,
  ],
};

export default definition;

export const load = () => import("./${nome}");
`;

  const propsLinhas = campos
    .map((c) => {
      if (c.type === "boolean") return `  ${c.name}: boolean;`;
      return `  ${c.name}?: string;`;
    })
    .join("\n");

  const mapLinhas = campos
    .map((c) => {
      if (c.type === "boolean") {
        return `    ${c.name}: raw.${c.name} === true || raw.${c.name} === "true",`;
      }
      if (c.type === "asset") {
        return `    ${c.name}: buildAssetUrl(resolveAsset(raw.${c.name})) || undefined,`;
      }
      return `    ${c.name}: (raw.${c.name} as string) || undefined,`;
    })
    .join("\n");

  const resolveAsset = temAsset
    ? `
function resolveAsset(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    return (obj._publishUrl as string) || (obj._path as string) || "";
  }
  return "";
}
`
    : "";

  const mapper = `import type { MapperFn } from "@/common/types/registry";
import {
  mapDataLayer,
  type DataLayerConfig,
} from "@/frontend/components/_shared/datalayer";
${temAsset ? 'import { buildAssetUrl } from "@/server/cms";\n' : ""}${resolveAsset}
export interface ${pascal}Props {
  _path: string;
${propsLinhas}
  sectionId?: string;
  dataLayer?: DataLayerConfig;
}

const mapper: MapperFn = (data) => {
  const raw = data as Record<string, unknown>;
  return {
    _path: (raw._path as string) ?? "",
${mapLinhas}
    sectionId: (raw.sectionId as string) || undefined,
    dataLayer: mapDataLayer(raw),
  } satisfies ${pascal}Props;
};

export default mapper;
`;

  const jsx = campos
    .map((c) => {
      const cls = `styles.${c.name}`;
      if (c.type === "richtext") {
        return `      {${c.name} ? (\n        <div className={${cls}} dangerouslySetInnerHTML={richTextHtml(${c.name})} />\n      ) : null}`;
      }
      if (c.type === "asset") {
        return `      {${c.name} ? <img className={${cls}} src={${c.name}} alt="" /> : null}`;
      }
      if (c.type === "boolean") return null;
      return `      {${c.name} ? <p className={${cls}}>{${c.name}}</p> : null}`;
    })
    .filter((l): l is string => l !== null)
    .join("\n");

  const props = campos.map((c) => `  ${c.name},`).join("\n");

  const tsx = `import { getEditorProps } from "@/server/cms";
${temRich ? `import { richTextHtml } from "${importRichtext(componentsRoot, grupo)}";\n` : ""}import styles from "./${pascal}.module.css";
import type { ${pascal}Props } from "./mapper";

const MODEL_ID = "${modelId}";

export default function ${pascal}({
  _path,
${props}
  sectionId,
}: ${pascal}Props) {
  return (
    <section
      id={sectionId}
      className={styles.root}
      {...getEditorProps({
        resource: _path,
        type: "component",
        model: MODEL_ID,
        label: "${titulo}",
      })}
    >
${jsx}
    </section>
  );
}
`;

  const css =
    [".root {\n  display: block;\n}", ...campos.filter((c) => c.type !== "boolean").map((c) => `.${c.name} {\n  display: block;\n}`)].join("\n\n") + "\n";

  const index = `export { default } from "./${nome}";
export type { ${pascal}Props } from "./mapper";
export { default as definition } from "./definition";
export { default as mapper } from "./mapper";
`;

  const mockPath = `/content/seu-projeto/pt/${grupo}/${tipo}/${nome}`;
  const exemplos = campos
    .filter((c) => c.type === "text" || c.type === "richtext")
    .slice(0, 2);
  const entradaTeste = exemplos.map((c) => `      ${c.name}: "valor de ${c.name}",`).join("\n");
  const afirmaTeste = exemplos
    .map((c) => `    expect(result.${c.name}).toBe("valor de ${c.name}");`)
    .join("\n");
  const ausentes = campos
    .filter((c) => c.type !== "boolean")
    .map((c) => `    expect(result.${c.name}).toBeUndefined();`)
    .join("\n");

  const teste = `import mapper, { type ${pascal}Props } from "../mapper";

const MOCK_PATH = "${mockPath}";

describe("${grupo}/${nome}/v1 mapper", () => {
  it("mapeia os campos preenchidos", () => {
    const result = mapper({
      _path: MOCK_PATH,
${entradaTeste}
    }) as unknown as ${pascal}Props;

${afirmaTeste}
  });

  it("aplica defaults resilientes quando campos ausentes", () => {
    const result = mapper({ _path: MOCK_PATH }) as unknown as ${pascal}Props;

${ausentes}
    expect(result.dataLayer?.enabled).toBe(false);
  });
});
`;

  return [
    { caminho: join(dir, "definition.ts"), conteudo: definition },
    { caminho: join(dir, "mapper.ts"), conteudo: mapper },
    { caminho: join(dir, `${nome}.tsx`), conteudo: tsx },
    { caminho: join(dir, `${pascal}.module.css`), conteudo: css },
    { caminho: join(dir, "index.ts"), conteudo: index },
    { caminho: join(dir, "__tests__", "mapper.test.ts"), conteudo: teste },
  ];
}

export function gravarArquivos(arquivos: ArquivoGerado[]): string[] {
  const existentes = arquivos.filter((a) => existsSync(a.caminho));
  if (existentes.length > 0) {
    throw new Error(
      `Componente já existe, nada foi sobrescrito: ${existentes.map((e) => e.caminho).join(", ")}`,
    );
  }
  for (const a of arquivos) {
    mkdirSync(join(a.caminho, ".."), { recursive: true });
    writeFileSync(a.caminho, a.conteudo, "utf8");
  }
  return arquivos.map((a) => a.caminho);
}
