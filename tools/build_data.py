#!/usr/bin/env python3
"""
Gera data/regras.json (capítulos do DRS em HTML) e data/itens.json
(habilidades, armas, proteções e equipamentos) a partir do Markdown do DRS.

Uso:  python3 tools/build_data.py caminho/do/DRS.md
Requer: pandoc instalado.
"""
import json, re, subprocess, sys, pathlib

SRC = pathlib.Path(sys.argv[1])
OUT = pathlib.Path(__file__).resolve().parent.parent / "data"
OUT.mkdir(exist_ok=True)

lines = SRC.read_text(encoding="utf-8").split("\n")


def limpar(t):
    t = re.sub(r"\\([\\`*_{}\[\]()#+\-.!|=<>~])", r"\1", t)
    t = t.replace("**", "").replace("*", "")
    return re.sub(r"\s+", " ", t).strip()


def pandoc_html(md):
    r = subprocess.run(
        ["pandoc", "-f", "markdown-smart-auto_identifiers", "-t", "html", "--wrap=none"],
        input=md, capture_output=True, text=True, check=True)
    return r.stdout


# ------------------------------------------------------------------ capítulos
marcas = []
for i, l in enumerate(lines):
    if re.match(r"^# (\d\d) — ", l) or l.startswith("# Apêndice"):
        marcas.append(i)

capitulos = []
# apresentação (cabeçalho + avisos), sem o sumário
intro = [l for l in lines[:marcas[0]] if not l.startswith("- ")]
intro_md = "\n".join(intro).replace("## Sumário", "").strip()
capitulos.append({"nome": "Apresentação do DRS", "html": pandoc_html(intro_md)})

for n, ini in enumerate(marcas):
    fim = marcas[n + 1] if n + 1 < len(marcas) else len(lines)
    titulo = re.sub(r"^# ", "", lines[ini]).strip()
    corpo = "\n".join(lines[ini + 1:fim]).strip()
    # remove separadores soltos no fim
    corpo = re.sub(r"(\n---\s*)+$", "", corpo).strip()
    capitulos.append({"nome": titulo, "html": pandoc_html(corpo)})

(OUT / "regras.json").write_text(json.dumps(capitulos, ensure_ascii=False, indent=1), encoding="utf-8")
print(f"{len(capitulos)} capítulos")

# ------------------------------------------------------------------ tabelas
def tabela(ini_marca, fim_marca=None, depois_de=0):
    """Devolve as linhas (listas de células) da primeira tabela após uma linha que contém ini_marca."""
    i = next(k for k, l in enumerate(lines) if ini_marca in l and k >= depois_de)
    while not lines[i].startswith("|"):
        i += 1
    linhas = []
    while i < len(lines) and lines[i].startswith("|"):
        cel = [limpar(c) for c in lines[i].strip().strip("|").split("|")]
        if not all(re.fullmatch(r":?-+:?", c) for c in cel):
            linhas.append(cel)
        i += 1
    return linhas[1:]  # sem cabeçalho


def parse_crit(txt):
    """'+1d6' -> ('1d6',''); 'Perfuração' -> ('', 'Perfuração'); '+2 de Perfuração' -> ('', 'Perfuração')."""
    t = txt.strip()
    m = re.fullmatch(r"\+(\d+d\d+)", t)
    if m:
        return m.group(1), ""
    for ef in ["Perfuração", "Sangramento", "Atordoamento", "Ferimento Profundo", "Incêndio"]:
        if ef.lower() in t.lower():
            return "", ef
    return "", ""


def parse_margem(txt):
    m = re.match(r"(\d+)", txt.replace("–", "-"))
    return int(m.group(1)) if m else 20


def inteiro(txt, padrao=0):
    m = re.search(r"\d+", txt)
    return int(m.group()) if m else padrao


itens = {"habilidades": [], "armas": [], "protecoes": [], "equipamentos": []}

# ------------------------------------------------------------------ armas brancas
ini = next(i for i, l in enumerate(lines) if l.startswith("### **Armas Brancas**"))
sub = ""
for cel in tabela("### **Armas Brancas**", depois_de=ini):
    if len(cel) < 6:
        continue
    if not cel[1]:                      # linha de subgrupo
        sub = cel[0]
        continue
    nome, dano, tipo, pd, bonus, margem = cel[:6]
    b, ef = parse_crit(bonus)
    desc = ""
    if "+2" in bonus and ef:
        desc = f"Bônus crítico original: {bonus}."
    itens["armas"].append({
        "name": nome, "type": "arma", "img": "icons/svg/sword.svg",
        "system": {
            "categoria": "branca", "subgrupo": sub, "dano": dano.replace(" ", ""), "tipoDano": tipo,
            "atributo": "for", "somaAtributoDano": True, "margemCritico": parse_margem(margem),
            "bonusCritico": b, "efeitoCritico": ef,
            "durabilidade": {"value": inteiro(pd), "max": inteiro(pd)},
            "longa": False, "descricao": desc
        }
    })

# ------------------------------------------------------------------ armas de fogo
ini = next(i for i, l in enumerate(lines) if l.startswith("### **Armas de Fogo**"))
sub = ""
LONGAS = {"Espingardas", "Rifles, Carabinas e Fuzis"}
for cel in tabela("### **Armas de Fogo**", depois_de=ini):
    if len(cel) < 7:
        continue
    if not cel[1]:
        sub = cel[0]
        continue
    nome, dano, mun, cap, pd, bonus, margem = cel[:7]
    b, ef = parse_crit(bonus)
    itens["armas"].append({
        "name": nome, "type": "arma", "img": "icons/svg/target.svg",
        "system": {
            "categoria": "improvisada" if "Improvisadas" in sub else "fogo", "subgrupo": sub,
            "dano": dano.replace(" ", ""), "tipoDano": "Perfurante", "atributo": "agi",
            "somaAtributoDano": False, "margemCritico": parse_margem(margem),
            "bonusCritico": b, "efeitoCritico": ef, "municao": mun, "capacidade": inteiro(cap),
            "durabilidade": {"value": inteiro(pd), "max": inteiro(pd)},
            "longa": sub in LONGAS or nome == "Arma artesanal de cano duplo", "descricao": ""
        }
    })

# Ajustes de tipo de dano de armas especiais
ajustes = {"Lança-chamas improvisado": "Fogo", "Arma de choque (TASER)": "Elétrico",
           "Espingarda de cano curto": "Perfurante"}
for a in itens["armas"]:
    if a["name"] in ajustes:
        a["system"]["tipoDano"] = ajustes[a["name"]]
    if a["name"] in ("Lança-chamas improvisado", "Arma de choque (TASER)", "Pistola de pregos", "Arma artesanal de cano duplo"):
        a["system"]["categoria"] = "improvisada" if a["name"] != "Arma de choque (TASER)" else "fogo"

# ------------------------------------------------------------------ proteções e trajes
for cel in tabela("### **Tabela de Proteções**"):
    nome, pr, comp, pen = cel[:4]
    itens["protecoes"].append({
        "name": nome, "type": "protecao", "img": "icons/svg/shield.svg",
        "system": {"pr": inteiro(pr), "compartimentos": inteiro(comp),
                   "penalidade": "" if pen.lower() == "nenhuma" else pen,
                   "durabilidade": {"value": 10, "max": 10}, "descricao": ""}
    })
N_PROTECOES = len(itens["protecoes"])
for cel in tabela("## **Trajes Especiais**"):
    nome, pr, comp, prop = cel[:4]
    itens["protecoes"].append({
        "name": nome, "type": "protecao", "img": "icons/svg/shield.svg",
        "system": {"pr": inteiro(pr), "compartimentos": inteiro(comp), "penalidade": "",
                   "durabilidade": {"value": 10, "max": 10}, "descricao": prop}
    })

# ------------------------------------------------------------------ equipamentos
N_GERAIS = len(tabela("## **Equipamentos Gerais**"))
for marca in ("## **Equipamentos Gerais**", "## **Equipamentos Especializados**"):
    for cel in tabela(marca):
        nome, comp, util = cel[:3]
        itens["equipamentos"].append({
            "name": nome, "type": "equipamento", "img": "icons/svg/item-bag.svg",
            "system": {"categoria": "diverso", "quantidade": 1, "compartimentosFixos": inteiro(comp, 1),
                       "descricao": util}
        })

# ------------------------------------------------------------------ habilidades passivas
ini = next(i for i, l in enumerate(lines) if l.startswith("# **Habilidades Passivas**"))
fim = next(i for i, l in enumerate(lines) if l.startswith("# 05 — "))
cab = [i for i in range(ini, fim) if re.match(r"^#{2,3} ", lines[i])] + [fim]
grupo = ""
for a, b in zip(cab, cab[1:]):
    titulo = limpar(re.sub(r"^#+ ", "", lines[a]))
    bloco = "\n".join(lines[a + 1:b])
    mc = re.search(r"Custo:?\**\s*(\d+)", bloco)
    if not mc:
        grupo = titulo
        continue
    mp = re.search(r"Pré-requisito:?\**\s*(.+)", bloco)
    prereq = limpar(mp.group(1)) if mp else ""
    prereq = re.sub(r"^[:\s]+", "", prereq)
    paragrafos = []
    for p in re.split(r"\n\s*\n", bloco):
        if re.search(r"Pré-requisito|^\s*\**Custo|^\s*\*?Custo", p) or p.strip() in ("---", ""):
            continue
        paragrafos.append(limpar(p))
    itens["habilidades"].append({
        "name": titulo, "type": "habilidade", "img": "icons/svg/upgrade.svg",
        "system": {"grupo": grupo, "custo": int(mc.group(1)), "prerequisito": prereq,
                   "descricao": "\n\n".join(x for x in paragrafos if x)}
    })

for a in itens["armas"]:
    a["pasta"] = "Armas Brancas" if a["system"]["categoria"] == "branca" else "Armas de Fogo e Especiais"
for i, a in enumerate(itens["protecoes"]):
    a["pasta"] = "Proteções Corporais" if i < N_PROTECOES else "Trajes Especiais"
for i, a in enumerate(itens["equipamentos"]):
    a["pasta"] = "Equipamentos Gerais" if i < N_GERAIS else "Equipamentos Especializados"
for h in itens["habilidades"]:
    h["pasta"] = h["system"]["grupo"]

# Os caminhos visuais fazem parte do catálogo e sobrevivem à regeneração do DRS.
visual_path = OUT / "icones-itens.json"
if visual_path.exists():
    visual = {(v["type"], v["name"]): v["img"] for v in json.loads(visual_path.read_text(encoding="utf-8"))}
    for grupo in itens.values():
        for item in grupo:
            item["img"] = visual.get((item["type"], item["name"]), item["img"])

(OUT / "itens.json").write_text(json.dumps(itens, ensure_ascii=False, indent=1), encoding="utf-8")
for k, v in itens.items():
    print(k, len(v))
