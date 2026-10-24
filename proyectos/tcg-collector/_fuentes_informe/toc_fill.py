"""Pre-llena el resultado del campo TOC con las páginas medidas en el render.

Uso: python3 toc_fill.py entrada.docx render.pdf salida.docx
El campo conserva sus códigos: Word lo regenera al actualizar campos.
"""
import re
import subprocess
import sys
import zipfile
from xml.sax.saxutils import escape

src, pdf, dst = sys.argv[1:4]

with zipfile.ZipFile(src) as z:
    items = [(i, z.read(i.filename)) for i in z.infolist()]
doc = next(d for i, d in items if i.filename == "word/document.xml").decode("utf8")

# Títulos de nivel 1 en orden
heads = []
for para in re.findall(r"<w:p>(?:(?!</w:p>).)*?<w:pStyle w:val=\"Heading1\"/>.*?</w:p>", doc, flags=re.S):
    heads.append("".join(re.findall(r"<w:t[^>]*>([^<]*)</w:t>", para)))

# Página de cada título en el render (se omiten portada e índice)
n_pages = int(re.search(r"Pages:\s+(\d+)", subprocess.run(["pdfinfo", pdf], capture_output=True, text=True).stdout).group(1))
page_text = [subprocess.run(["pdftotext", "-f", str(p), "-l", str(p), "-layout", pdf, "-"],
                            capture_output=True, text=True).stdout for p in range(1, n_pages + 1)]
entries, start = [], 3
for h in heads:
    key = re.sub(r"\s+", " ", h).strip()
    for p in range(start, n_pages + 1):
        lines = [re.sub(r"\s+", " ", ln).strip() for ln in page_text[p - 1].splitlines()]
        if any(ln.startswith(key) for ln in lines):
            entries.append((h, p))
            start = p
            break
    else:
        sys.exit(f"No se encontró el título en el render: {h}")

PPR = ('<w:pPr><w:tabs><w:tab w:val="right" w:leader="dot" w:pos="9062"/></w:tabs>'
       '<w:spacing w:after="80"/></w:pPr>')
RPR = '<w:rPr><w:color w:val="4C5270"/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>'


def entry_runs(text, page):
    return (f'<w:r>{RPR}<w:t xml:space="preserve">{escape(text)}</w:t></w:r>'
            f'<w:r>{RPR}<w:tab/></w:r><w:r>{RPR}<w:t>{page}</w:t></w:r>')


sdt_open = '<w:p><w:r><w:fldChar w:fldCharType="begin" w:dirty="true"/>'
sep_close = '<w:fldChar w:fldCharType="separate"/></w:r></w:p>'
assert doc.count(sdt_open) == 1 and doc.count(sep_close) == 1, "Estructura TOC inesperada"
first, rest = entries[0], entries[1:]
doc = doc.replace(sdt_open, '<w:p>' + PPR + '<w:r><w:fldChar w:fldCharType="begin" w:dirty="true"/>')
doc = doc.replace(sep_close, '<w:fldChar w:fldCharType="separate"/></w:r>' + entry_runs(*first) + '</w:p>'
                  + "".join(f"<w:p>{PPR}{entry_runs(t, p)}</w:p>" for t, p in rest))

# Pie: separa cada campo PAGE/NUMPAGES en runs con formato propio y un
# resultado inicial, para que todo visor respete el tamaño de 8 pt.
FIELD = re.compile(r'<w:r>(<w:rPr>(?:(?!</w:rPr>).)*</w:rPr>)<w:fldChar w:fldCharType="begin"/>'
                   r'<w:instrText xml:space="preserve">(PAGE|NUMPAGES)</w:instrText>'
                   r'<w:fldChar w:fldCharType="separate"/><w:fldChar w:fldCharType="end"/></w:r>')


def split_field(m):
    rpr, code = m.group(1), m.group(2)
    return (f'<w:r>{rpr}<w:fldChar w:fldCharType="begin"/></w:r>'
            f'<w:r>{rpr}<w:instrText xml:space="preserve"> {code} </w:instrText></w:r>'
            f'<w:r>{rpr}<w:fldChar w:fldCharType="separate"/></w:r>'
            f'<w:r>{rpr}<w:t>1</w:t></w:r>'
            f'<w:r>{rpr}<w:fldChar w:fldCharType="end"/></w:r>')


with zipfile.ZipFile(dst, "w", zipfile.ZIP_DEFLATED) as z:
    for info, data in items:
        if info.filename == "word/document.xml":
            data = doc.encode("utf8")
        elif re.fullmatch(r"word/footer\d+\.xml", info.filename):
            txt, n = FIELD.subn(split_field, data.decode("utf8"))
            assert n == 2, f"Se esperaban 2 campos en {info.filename}, hay {n}"
            data = txt.encode("utf8")
        z.writestr(info, data)

for t, p in entries:
    print(f"{p:>3}  {t}")
