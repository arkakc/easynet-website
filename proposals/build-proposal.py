#!/usr/bin/env python3
"""Build the self-contained Easynet proposal HTML (embeds Inter fonts + logo)."""
import base64, pathlib

ROOT = pathlib.Path(__file__).resolve().parent
TPL = ROOT / "template.html"
OUT = ROOT / "easynet-starlink-sdwan-proposal.html"
FONTS = pathlib.Path("/home/user/.pdftool/node_modules/@fontsource/inter/files")
LOGO = ROOT.parent / "public/assets/images/logo.png"

css = []
for w in (400, 500, 600, 700, 800):
    data = (FONTS / f"inter-latin-{w}-normal.woff2").read_bytes()
    b64 = base64.b64encode(data).decode()
    css.append(
        "@font-face{font-family:'Inter';font-style:normal;font-weight:%d;font-display:swap;"
        "src:url(data:font/woff2;base64,%s) format('woff2')}" % (w, b64)
    )
fonts_css = "\n".join(css)
logo_b64 = base64.b64encode(LOGO.read_bytes()).decode()

html = TPL.read_text()
assert "/*@@FONTS@@*/" in html and "@@LOGO@@" in html
html = html.replace("/*@@FONTS@@*/", fonts_css).replace("@@LOGO@@", f"data:image/png;base64,{logo_b64}")
OUT.write_text(html)
print(f"wrote {OUT} ({OUT.stat().st_size/1024:.0f} KB)")
