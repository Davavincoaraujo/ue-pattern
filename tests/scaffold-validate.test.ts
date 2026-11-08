import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { gerarArquivos, gravarArquivos, paraPascal } from "../src/scaffold.js";
import { identificarComponente, validarComponente } from "../src/validate-component.js";

describe("scaffold + validador", () => {
  it("converte kebab em Pascal", () => {
    expect(paraPascal("vip-lounges")).toBe("VipLounges");
  });

  it("rejeita nome fora de kebab-case", () => {
    expect(() =>
      gerarArquivos({ componentsRoot: "/x", grupo: "g", nome: "VipLounges", titulo: "t", tipo: "sections" }),
    ).toThrow(/kebab/);
  });

  it("o que o scaffold gera passa no validador sem erros", () => {
    const raiz = mkdtempSync(join(tmpdir(), "uepm-s-"));
    const arquivos = gerarArquivos({
      componentsRoot: raiz,
      grupo: "meu-grupo",
      nome: "demo-card",
      titulo: "Demo",
      tipo: "sections",
      campos: [
        { name: "title", label: "Título", type: "richtext" },
        { name: "image", label: "Imagem", type: "asset" },
        { name: "shine", label: "Brilho", type: "boolean" },
        { name: "eyebrow", label: "Eyebrow", type: "text" },
      ],
    });
    gravarArquivos(arquivos);
    const dir = join(raiz, "meu-grupo", "sections", "demo-card", "v1");
    const r = validarComponente(dir);
    expect(r.achados.filter((a) => a.severidade === "erro")).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it("não sobrescreve componente existente", () => {
    const raiz = mkdtempSync(join(tmpdir(), "uepm-s-"));
    const entrada = { componentsRoot: raiz, grupo: "g", nome: "um", titulo: "t", tipo: "sections" as const };
    gravarArquivos(gerarArquivos(entrada));
    expect(() => gravarArquivos(gerarArquivos(entrada))).toThrow(/já existe/);
  });

  it("não gera comentários no código", () => {
    const raiz = mkdtempSync(join(tmpdir(), "uepm-s-"));
    const todos = gerarArquivos({ componentsRoot: raiz, grupo: "g", nome: "um", titulo: "t", tipo: "sections" });
    for (const a of todos.filter((x) => /\.(ts|tsx)$/.test(x.caminho))) {
      expect(a.conteudo).not.toMatch(/^\s*\/\/|\/\*/m);
    }
  });

  it("identifica grupo e nome pelo caminho", () => {
    expect(identificarComponente("/a/components/meu-grupo/sections/hero/v1")).toEqual({ grupo: "meu-grupo", nome: "hero" });
    expect(() => identificarComponente("/a/b")).toThrow();
  });
});

describe("validador detecta violações", () => {
  function montar(arquivos: Record<string, string>) {
    const raiz = mkdtempSync(join(tmpdir(), "uepm-v-"));
    const dir = join(raiz, "grp", "sections", "x", "v1");
    const base = gerarArquivos({ componentsRoot: raiz, grupo: "grp", nome: "x", titulo: "X", tipo: "sections" });
    for (const a of base) {
      const nome = a.caminho.replace(`${dir}/`, "");
      arquivos[nome] ??= a.conteudo;
    }
    const { writeFileSync, mkdirSync } = require("node:fs") as typeof import("node:fs");
    for (const [nome, conteudo] of Object.entries(arquivos)) {
      const alvo = join(dir, nome);
      mkdirSync(join(alvo, ".."), { recursive: true });
      writeFileSync(alvo, conteudo);
    }
    return dir;
  }

  it("mapper com fetch, await e ?? undefined", () => {
    const dir = montar({
      "mapper.ts": 'import type { MapperFn } from "@/common/types/registry";\nconst mapper: MapperFn = async (d) => { await fetch("/x"); return { a: (d as any).a ?? undefined }; };\nexport default mapper;\n',
    });
    const regras = validarComponente(dir).achados.map((a) => a.regra);
    expect(regras).toContain("mapper/puro");
    expect(regras).toContain("mapper/nullish");
  });

  it("group diferente da pasta e falta de DL_FIELDS", () => {
    const dir = montar({
      "definition.ts": 'const d = { modelId: "outro--x", name: "x", group: "outro", fields: [] };\nexport default d;\nexport const load = () => import("./x");\n',
    });
    const regras = validarComponente(dir).achados.map((a) => a.regra);
    expect(regras).toContain("definition/group");
    expect(regras).toContain("definition/modelId");
    expect(regras).toContain("definition/dl-fields");
  });

  it("data-aue manual e hook sem use client", () => {
    const dir = montar({
      "x.tsx": 'import { useState } from "react";\nexport default function X() { const [a] = useState(0); return <div data-aue-type="component">{a}</div>; }\n',
    });
    const regras = validarComponente(dir).achados.map((a) => a.regra);
    expect(regras).toContain("tsx/aue-manual");
    expect(regras).toContain("tsx/use-client");
  });
});

import { semComentarios } from "../src/validate-component.js";

describe("semComentarios", () => {
  it("remove comentários preservando linhas e URLs", () => {
    const entrada = 'a // data-aue-x\n/* data-aue-y\n */ b "https://x.com" // fim';
    const saida = semComentarios(entrada);
    expect(saida).not.toContain("data-aue");
    expect(saida).toContain("https://x.com");
    expect(saida.split("\n").length).toBe(entrada.split("\n").length);
  });
});
