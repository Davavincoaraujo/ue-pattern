import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buscar, extrairSecao, lerTopico, listarTopicos } from "../src/knowledge.js";

function base() {
  const dir = mkdtempSync(join(tmpdir(), "uepm-k-"));
  mkdirSync(join(dir, "skill", "reference"), { recursive: true });
  writeFileSync(
    join(dir, "skill", "SKILL.md"),
    "# Padrão\n\n## Anatomia\ntexto da anatomia com mapper puro\n\n### Detalhe\nsub\n\n## CTA\ntexto do cta reutilizavel\n",
  );
  writeFileSync(join(dir, "skill", "reference", "a.md"), "# Arquitetura\nregistry gerado\n");
  return dir;
}

describe("knowledge", () => {
  it("lista tópicos com id sem extensão", () => {
    const ids = listarTopicos(base()).map((t) => t.id);
    expect(ids).toEqual(["skill/SKILL", "skill/reference/a"].sort());
  });

  it("extrai seção incluindo subseções e parando no próximo heading do mesmo nível", () => {
    const md = lerTopico(base(), "skill/SKILL", "anatomia");
    expect(md).toContain("mapper puro");
    expect(md).toContain("sub");
    expect(md).not.toContain("cta reutilizavel");
  });

  it("retorna null para seção inexistente e erro ao ler", () => {
    expect(extrairSecao("# a\nb", "zzz")).toBeNull();
    expect(() => lerTopico(base(), "skill/SKILL", "zzz")).toThrow(/não encontrada/);
  });

  it("bloqueia path traversal", () => {
    expect(() => lerTopico(base(), "../../etc/passwd")).toThrow(/fora da raiz/);
  });

  it("busca ordena por relevância", () => {
    const r = buscar(base(), "registry gerado");
    expect(r[0].topico).toBe("skill/reference/a");
  });
});
