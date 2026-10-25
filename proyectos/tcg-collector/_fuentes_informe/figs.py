"""Figuras del RIF Collectr — paleta kam. Analytica, Carlito (sustituto métrico de Calibri)."""
import sys
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch

OUT = sys.argv[1]

KAM_MAGENTA = "#F652A0"
KAM_AZUL = "#4C5270"
KAM_GRIS_OSCURO = "#6D6D7F"
KAM_GRIS_MEDIO = "#B8BAC5"
KAM_GRIS_CLARO = "#F2F2F2"
KAM_BLANCO = "#FFFFFF"
KAM_PURPURA = "#8064A2"
KAM_VERDE = "#83E9A2"

plt.rcParams["font.family"] = ["Carlito", "DejaVu Sans"]
plt.rcParams["font.size"] = 9

EVID_COLOR = {"A": KAM_AZUL, "B": KAM_PURPURA, "C": KAM_GRIS_OSCURO}


def box(ax, x, y, w, h, text, fill=KAM_BLANCO, edge=KAM_GRIS_MEDIO, color="black",
        size=8.5, bold=False, evid=None, lw=1.0, align="center"):
    ax.add_patch(FancyBboxPatch((x, y), w, h, boxstyle="round,pad=0.004,rounding_size=0.012",
                                fc=fill, ec=edge, lw=lw))
    tx = x + w / 2 if align == "center" else x + 0.012
    ty = y + h / 2 - (0.014 if evid else 0)
    ax.text(tx, ty, text, ha=align, va="center", fontsize=size, color=color,
            fontweight="bold" if bold else "normal", linespacing=1.15)
    if evid:
        ax.add_patch(FancyBboxPatch((x + w - 0.028, y + h - 0.034), 0.024, 0.028,
                                    boxstyle="round,pad=0.002,rounding_size=0.006",
                                    fc=EVID_COLOR[evid], ec="none"))
        ax.text(x + w - 0.016, y + h - 0.020, evid, ha="center", va="center",
                fontsize=6.5, color=KAM_BLANCO, fontweight="bold")


def arrow(ax, x1, y1, x2, y2, color=KAM_GRIS_OSCURO, style="-|>", lw=1.0, ls="-"):
    ax.add_patch(FancyArrowPatch((x1, y1), (x2, y2), arrowstyle=style, mutation_scale=9,
                                 color=color, lw=lw, linestyle=ls, shrinkA=0, shrinkB=0))


def header(ax, x, w, y, text):
    ax.add_patch(FancyBboxPatch((x, y), w, 0.045, boxstyle="round,pad=0.003,rounding_size=0.01",
                                fc=KAM_AZUL, ec="none"))
    ax.text(x + w / 2, y + 0.0225, text, ha="center", va="center", color=KAM_BLANCO,
            fontsize=8.5, fontweight="bold")


def new_fig(h_in):
    fig = plt.figure(figsize=(6.3, h_in), dpi=220)
    ax = fig.add_axes([0, 0, 1, 1])
    ax.set_xlim(0, 1)
    ax.set_ylim(0, 1)
    ax.axis("off")
    return fig, ax


# ---------------------------------------------------------------- Fig. 1
def fig_arquitectura_collectr():
    fig, ax = new_fig(4.4)
    cols = [(0.010, "Fuentes de precio"), (0.205, "Ingesta y normalización"),
            (0.400, "Núcleo de datos"), (0.595, "Servicios"), (0.800, "Canales y monetización")]
    w = 0.185
    for x, t in cols:
        header(ax, x, w, 0.925, t)

    # panel de ingesta (recibe todas las fuentes)
    ax.add_patch(FancyBboxPatch((0.205, 0.290), w, 0.600, boxstyle="round,pad=0.004,rounding_size=0.012",
                                fc=KAM_GRIS_CLARO, ec="none"))
    fuentes = [("TCGplayer", "A"), ("eBay", "A"), ("Cardmarket", "A"), ("Mercados\nsecundarios", "A")]
    ys = [0.775, 0.630, 0.485, 0.315]
    for (t, e), y in zip(fuentes, ys):
        hh = 0.110 if "\n" not in t else 0.130
        box(ax, 0.010, y, w, hh, t, evid=e)
        arrow(ax, 0.197, y + hh / 2 - 0.014, 0.203, y + hh / 2 - 0.014)

    box(ax, 0.215, 0.640, w - 0.020, 0.220, "Refresco de\nprecios de detalle\nde producto\ncada 1–2 días", evid="A", size=8)
    box(ax, 0.215, 0.320, w - 0.020, 0.270, "Mapeo producto\n↔ fuente;\nla fuente varía\npor producto", evid="C", size=8)

    box(ax, 0.400, 0.690, w, 0.185, "Catálogo multi-TCG\n20+ juegos\n200.000+ productos", evid="A",
        fill=KAM_GRIS_CLARO, edge=KAM_AZUL, lw=1.2, size=8)
    box(ax, 0.400, 0.500, w, 0.150, "Series históricas\nde precio", evid="C",
        fill=KAM_GRIS_CLARO, edge=KAM_AZUL, lw=1.2, size=8)
    box(ax, 0.400, 0.290, w, 0.170, "Portafolios de\nusuarios (raw,\ngraduado, sellado)", evid="A",
        fill=KAM_GRIS_CLARO, edge=KAM_AZUL, lw=1.2, size=8)
    arrow(ax, 0.392, 0.750, 0.398, 0.780)
    arrow(ax, 0.392, 0.575, 0.398, 0.575)

    servicios = [("Valoración, coste\nbase y P&L", "A"), ("Alertas de precio", "A"),
                 ("Escáner de cartas", "A"), ("Exportación (PRO)", "A"),
                 ("Marketplace y\nSocial (PRO)", "A"), ("API para terceros", "A")]
    y = 0.890
    for t, e in servicios:
        hh = 0.100 if "\n" in t else 0.078
        y -= hh
        box(ax, 0.595, y, w, hh, t, evid=e, size=8)
        y -= 0.018
    ax.plot([0.590, 0.590], [0.300, 0.880], color=KAM_GRIS_OSCURO, lw=1.0)
    arrow(ax, 0.587, 0.590, 0.590, 0.590, style="-")

    box(ax, 0.800, 0.745, w, 0.135, "App iOS\nApp Android\nWeb app", evid="A", size=8)
    box(ax, 0.800, 0.515, w, 0.195, "Freemium\nPRO USD 7,99/mes\nUSD 59,99/año\n(dato a mar-2026)", evid="B", size=8)
    box(ax, 0.800, 0.290, w, 0.190, "PRO: escaneo\nilimitado, filtros,\nexportación,\nportafolios ilimitados", evid="A", size=8)
    arrow(ax, 0.787, 0.600, 0.798, 0.600)

    ax.add_patch(FancyBboxPatch((0.010, 0.030), 0.975, 0.200, boxstyle="round,pad=0.004,rounding_size=0.012",
                                fc=KAM_BLANCO, ec=KAM_GRIS_MEDIO, lw=0.8))
    ax.text(0.025, 0.195, "Escala de evidencia", fontsize=8.5, fontweight="bold", color=KAM_AZUL, va="center")
    leg = [("A", "Fuente primaria oficial (tiendas de apps, sitio y FAQ de Collectr)"),
           ("B", "Fuente de tercero (comparativas, agregadores de precios, reseñas)"),
           ("C", "Inferencia técnica del consultor, no observada directamente")]
    for i, (e, t) in enumerate(leg):
        yy = 0.145 - i * 0.045
        ax.add_patch(FancyBboxPatch((0.027, yy - 0.014), 0.024, 0.028, boxstyle="round,pad=0.002,rounding_size=0.006",
                                    fc=EVID_COLOR[e], ec="none"))
        ax.text(0.039, yy, e, ha="center", va="center", fontsize=6.5, color=KAM_BLANCO, fontweight="bold")
        ax.text(0.062, yy, t, va="center", fontsize=8, color="black")
    fig.savefig(f"{OUT}/fig1_arquitectura_collectr.png", facecolor=KAM_BLANCO)
    plt.close(fig)


# ---------------------------------------------------------------- Fig. 2
def fig_arquitectura_propuesta():
    fig, ax = new_fig(3.5)
    header(ax, 0.010, 0.230, 0.905, "Cliente")
    header(ax, 0.300, 0.400, 0.905, "Backend gestionado (Supabase)")
    header(ax, 0.760, 0.230, 0.905, "Fuentes externas")

    box(ax, 0.010, 0.560, 0.230, 0.300, "App del coleccionista\nPWA (React/Next.js)\no Expo (React Native)\n\nBúsqueda · Alta de lotes\nPortafolios · Panel\nExportación CSV",
        size=8)
    box(ax, 0.010, 0.330, 0.230, 0.190, "v2: escáner\n(OCR número de colección\n+ código de set)", size=8,
        fill=KAM_GRIS_CLARO)

    box(ax, 0.300, 0.745, 0.190, 0.115, "Auth", size=8.5, bold=True, color=KAM_AZUL)
    box(ax, 0.510, 0.745, 0.190, 0.115, "Storage\n(fotos de cartas)", size=8)
    box(ax, 0.300, 0.425, 0.400, 0.280, "PostgreSQL · esquema tcg\ncatálogo · precios · lotes · disposiciones\nvistas de valoración y P&L\nseguridad a nivel de fila (RLS)",
        size=8.5, fill=KAM_GRIS_CLARO, edge=KAM_AZUL, lw=1.3)
    box(ax, 0.300, 0.230, 0.400, 0.150, "Edge Functions + pg_cron\ningesta diaria · instantáneas · alertas\n(las claves de API viven solo aquí)",
        size=8, edge=KAM_MAGENTA, lw=1.3)

    ext = [("TCGdex\ncatálogo multilingüe", 0.735), ("pokemontcg.io v2 → Scrydex\nprecios TCGplayer / Cardmarket", 0.575),
           ("BCE\ntipo de cambio EUR/USD", 0.415), ("Opcionales: API oficial\nCollectr · JustTCG ·\nPriceCharting", 0.230)]
    for t, y in ext:
        box(ax, 0.760, y, 0.230, 0.125 if "Opcionales" not in t else 0.145, t, size=8)

    arrow(ax, 0.242, 0.700, 0.298, 0.640, style="<|-|>")
    arrow(ax, 0.242, 0.800, 0.298, 0.800, style="<|-|>")
    for y in [0.797, 0.637, 0.477, 0.302]:
        arrow(ax, 0.758, y, 0.702, 0.320, color=KAM_GRIS_OSCURO)
    arrow(ax, 0.500, 0.382, 0.500, 0.423, color=KAM_MAGENTA)

    ax.text(0.5, 0.115, "Flujo: la función programada consulta las fuentes, normaliza a la variante interna, convierte a USD y\n"
            "registra la observación con su linaje (ingest_run). El cliente solo lee vistas; nunca llama a las APIs de precio.",
            ha="center", va="center", fontsize=8, color=KAM_GRIS_OSCURO, linespacing=1.3)
    fig.savefig(f"{OUT}/fig2_arquitectura_propuesta.png", facecolor=KAM_BLANCO)
    plt.close(fig)


# ---------------------------------------------------------------- Fig. 3
ROW_H, HEAD_H = 0.029, 0.037


def table_box(ax, x, y, w, title, rows):
    h = HEAD_H + ROW_H * len(rows) + 0.010
    ax.add_patch(FancyBboxPatch((x, y - h), w, h, boxstyle="round,pad=0.002,rounding_size=0.008",
                                fc=KAM_BLANCO, ec=KAM_GRIS_OSCURO, lw=0.9))
    ax.add_patch(FancyBboxPatch((x, y - HEAD_H), w, HEAD_H, boxstyle="round,pad=0.002,rounding_size=0.008",
                                fc=KAM_AZUL, ec="none"))
    ax.text(x + w / 2, y - HEAD_H / 2, title, ha="center", va="center", color=KAM_BLANCO,
            fontsize=8.2, fontweight="bold")
    for i, r in enumerate(rows):
        key = r.startswith("PK") or r.startswith("FK")
        ax.text(x + 0.010, y - HEAD_H - ROW_H * (i + 0.65), r, fontsize=7.1,
                color=KAM_AZUL if key else "black", fontweight="bold" if r.startswith("PK") else "normal",
                va="center")
    return (x, y - h, w, h)


def domain(ax, x, y, w, h, label):
    ax.add_patch(FancyBboxPatch((x, y), w, h, boxstyle="round,pad=0.004,rounding_size=0.014",
                                fc=KAM_GRIS_CLARO, ec="none"))
    ax.text(x + 0.010, y + h - 0.020, label, fontsize=9, fontweight="bold", color=KAM_AZUL, va="center")


def fig_modelo_datos():
    fig, ax = new_fig(7.6)
    domain(ax, 0.008, 0.525, 0.984, 0.467, "Catálogo y precios (datos de referencia)")
    domain(ax, 0.008, 0.010, 0.984, 0.500, "Colección del usuario (datos transaccionales)")

    t_set = table_box(ax, 0.025, 0.950, 0.180, "tcg_set", ["PK set_id", "name · series", "release_date"])
    t_run = table_box(ax, 0.025, 0.787, 0.180, "ingest_run", ["PK run_id", "FK source_code", "status · rows_upserted"])
    t_cf = table_box(ax, 0.025, 0.643, 0.180, "condition_factor", ["PK condition", "factor (calibrable)"])
    t_item = table_box(ax, 0.235, 0.950, 0.200, "catalog_item",
                       ["PK item_id", "FK set_id", "kind (card | sealed)", "collector_number", "rarity · imágenes"])
    t_name = table_box(ax, 0.235, 0.705, 0.200, "catalog_item_name", ["PK item_id + language", "name (búsqueda trgm)"])
    t_var = table_box(ax, 0.465, 0.950, 0.180, "catalog_variant", ["PK variant_id", "FK item_id", "finish"])
    t_ref = table_box(ax, 0.465, 0.775, 0.150, "external_ref", ["PK variante+fuente", "external_id"])
    t_obs = table_box(ax, 0.680, 0.950, 0.300, "price_observation",
                      ["PK variante · fuente · tipo ·", "      estado · grado · fecha", "FK variant_id · FK source_code",
                       "price_kind · condition_key · grade_key", "amount · currency · observed_on"])
    t_src = table_box(ax, 0.680, 0.745, 0.145, "price_source", ["PK source_code", "priority", "valuation_level"])
    t_fx = table_box(ax, 0.835, 0.745, 0.145, "fx_rate", ["PK fecha · par", "base · quote · rate"])

    t_user = table_box(ax, 0.025, 0.470, 0.165, "app_user", ["PK user_id", "email"])
    t_port = table_box(ax, 0.225, 0.470, 0.180, "portfolio", ["PK portfolio_id", "FK user_id", "name · is_default"])
    t_lot = table_box(ax, 0.440, 0.470, 0.240, "lot",
                      ["PK lot_id", "FK portfolio_id · FK variant_id", "FK parent_lot_id (sellado)",
                       "quantity · condition · language", "grader · grade · cert_number",
                       "acquired_on · acquisition_cost", "manual_unit_value (nivel 3)"])
    t_disp = table_box(ax, 0.720, 0.470, 0.260, "lot_disposal",
                       ["PK disposal_id", "FK lot_id", "channel (sale … opened)", "quantity · proceeds · fees"])
    t_watch = table_box(ax, 0.025, 0.300, 0.190, "watch_item",
                        ["PK watch_id", "FK user_id · FK variant_id", "direction · threshold_usd"])
    t_snap = table_box(ax, 0.235, 0.300, 0.190, "portfolio_snapshot",
                       ["PK portfolio + fecha", "market_value · cost_basis", "P&L no realizado / realizado"])
    box(ax, 0.720, 0.060, 0.260, 0.180,
        "Vistas y funciones\nv_lot_position\nv_realized_pnl · v_alerts_due\nv_portfolio_summary\nunit_price_usd()\nallocate_opened_cost()\ntake_portfolio_snapshots()",
        size=7.3, edge=KAM_MAGENTA, lw=1.2)
    ax.text(0.025, 0.085, "Flecha: relación 1 : N, apunta al lado N.\nArco magenta: autorrelación lot → lot (cartas extraídas de un\nsellado abierto; asignación de coste conjunto).\nFlecha púrpura: la variante del catálogo es la clave que une ambos dominios.",
            fontsize=7.2, color=KAM_GRIS_OSCURO, va="center", linespacing=1.35)

    def h_link(a, b, y):
        arrow(ax, a[0] + a[2], y, b[0], y, lw=0.9)

    h_link(t_set, t_item, 0.910)
    h_link(t_item, t_var, 0.910)
    h_link(t_var, t_obs, 0.910)
    arrow(ax, 0.335, t_item[1], 0.335, 0.705, lw=0.9)
    arrow(ax, 0.540, t_var[1], 0.540, 0.775, lw=0.9)
    arrow(ax, 0.7525, 0.745, 0.7525, t_obs[1], lw=0.9)
    h_link(t_user, t_port, 0.430)
    h_link(t_port, t_lot, 0.430)
    h_link(t_lot, t_disp, 0.430)
    arrow(ax, 0.105, t_user[1], 0.105, 0.300, lw=0.9)
    arrow(ax, 0.315, t_port[1], 0.315, 0.300, lw=0.9)
    arrow(ax, 0.632, t_var[1], 0.632, 0.470, lw=1.0, color=KAM_PURPURA)
    ax.text(0.640, 0.640, "variant_id", fontsize=6.8, color=KAM_PURPURA, rotation=90, va="center")
    ax.add_patch(FancyArrowPatch((0.680, 0.232), (0.680, 0.290), connectionstyle="arc3,rad=0.9",
                                 arrowstyle="-|>", mutation_scale=8, color=KAM_MAGENTA, lw=1.0))
    fig.savefig(f"{OUT}/fig3_modelo_datos.png", facecolor=KAM_BLANCO)
    plt.close(fig)


# ---------------------------------------------------------------- Fig. 4
def fig_cascada():
    fig, ax = new_fig(4.4)
    steps = [
        ("1", "Lote vigente", "variante · estado · idioma · grado"),
        ("2", "¿Tiene valor manual?", "Sí → se usa y se clasifica Nivel 3"),
        ("3", "Filtrar observaciones", "misma variante y grado; estado exacto o agregado;\nventana de vigencia de 30 días hasta la fecha de corte"),
        ("4", "Ordenar candidatas", "estado exacto > prioridad de fuente > tipo de precio\n(market > sold_median > trend > avg7 …) > más reciente"),
        ("5", "Convertir a USD", "tipo de cambio BCE vigente a la fecha de observación;\nsin tipo de cambio no hay precio"),
        ("6", "Ajustar por estado", "solo si la fuente publica precio agregado (factor calibrable)"),
        ("7", "Asignar nivel 1 / 2 / 3", "1: mercado activo, idéntico, estado exacto o NM\n2: proxy (otro mercado, idioma o estado)  ·  3: estimación manual"),
    ]
    y = 0.935
    for n, t, d in steps:
        h = 0.105 if "\n" in d else 0.085
        ax.add_patch(FancyBboxPatch((0.03, y - h), 0.055, h, boxstyle="round,pad=0.003,rounding_size=0.01",
                                    fc=KAM_AZUL, ec="none"))
        ax.text(0.0575, y - h / 2, n, ha="center", va="center", color=KAM_BLANCO, fontsize=11, fontweight="bold")
        box(ax, 0.095, y - h, 0.245, h, t, size=9, bold=True, color=KAM_AZUL, align="left")
        box(ax, 0.350, y - h, 0.620, h, d, size=8.3, align="left")
        if n != "7":
            arrow(ax, 0.0575, y - h - 0.002, 0.0575, y - h - 0.020)
        y -= h + 0.022
    ax.add_patch(FancyBboxPatch((0.03, 0.015), 0.94, 0.050, boxstyle="round,pad=0.003,rounding_size=0.01",
                                fc=KAM_GRIS_CLARO, ec=KAM_MAGENTA, lw=1.0))
    ax.text(0.5, 0.040, "Sin candidata válida → el lote se muestra “sin valorar” y su coste se reporta aparte; nunca se valora en cero.",
            ha="center", va="center", fontsize=8.3, color=KAM_AZUL)
    fig.savefig(f"{OUT}/fig4_cascada_valoracion.png", facecolor=KAM_BLANCO)
    plt.close(fig)


fig_arquitectura_collectr()
fig_arquitectura_propuesta()
fig_modelo_datos()
fig_cascada()
print("ok")
