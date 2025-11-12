// src/components/ChannelView.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Globe,
  ShoppingCart,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  Link as LinkIcon,
  Upload,
  Repeat,
  X,
  Trash2,
} from "lucide-react";
import { supabase } from "../supabaseClient";

interface ChannelViewProps {
  channel: "wordpress" | "mercadolibre";
}

type Product = {
  id: number;
  name: string;
  sku: string;
  price: number;
  categoria_id: number | null;
  categoria_nombre: string | null;
  stockb2b: number;
  stockweb: number;
  stockml: number;
  talla_id?: number | null; // 👈 solo guardamos la referencia a la talla
};

type CategoryOption = { id: string; name: string; domain_name?: string };

type MLLink = {
  sku: string;
  meli_item_id: string | null;
  meli_variation_id: string | null;
  meli_status?: string | null;
  last_seen_at?: string | null;
};

type Health = {
  connected: boolean;
  nickname?: string;
  expires_at_ms?: number;
  now_ms?: number;
};

type DraftAttr = {
  id: string;
  value_name?: string;
  value_id?: number | string; // 👈 string, no number
};

type DraftPublish = {
  sku: string;
  title: string;
  price: number;
  available_quantity: number;
  category_id: string; // MLC* fijo
  pictures: string[];
  attributes: DraftAttr[];
  condition: string;
  listing_type_id: string;
  currency_id: string;
  buying_mode: string;
};

type LookupTal = {
  id: number;
  etiqueta: string;
  tipo: "alfanumerica" | "numerica";
  orden: number | null;
};

// -------- Agrupación por familia (name + categoria + tipo talla)
type FamRow = {
  name: string;
  categoria_id: number | null;
  categoria_nombre: string | null;
  tipo: "alfanumerica" | "numerica";
  byTalla: Record<number, Product>; // talla_id -> product
};
// Opciones visibles en el drop-list (tus guías reales)
const GUIDE_OPTIONS: Array<{ id: string; label: string }> = [
  { id: "3947174", label: "Numérica" },
  { id: "3947488", label: "Numérica" },
  { id: "3947520", label: "Alfanumérica" },
  { id: "3947530", label: "Alfanumérica" },
];

const ALFA_ORDER = ["XS", "S", "M", "L", "XL", "XXL", "3XL"];
const GARMENT_TYPE_OPTIONS: Record<string, string[]> = {
  MLC158467: [
    // Poleras
    "Camiseta",
    "Polo",
    "Polera básica",
    "Polera deportiva",
    "Polera estampada",
    "T-Shirt",
    "Tank top",
    "Crop top",
    "Camisa sin mangas",
  ],
  MLC158382: [
    // Polerones
    "Polerón clásico",
    "Hoodie",
    "Sudadera",
    "Polerón con cierre",
    "Sweatshirt",
    "Pullover",
    "Polerón deportivo",
  ],
  MLC158340: [
    // Chaquetas
    "Chaqueta",
    "Parka",
    "Abrigo",
    "Blazer",
    "Cazadora",
    "Rompeviento",
    "Chaquetón",
    "Bomber",
    "Trench",
    "Campera",
  ],
};

// Guías conocidas
const CATEGORY_GUIDE_MAP: Record<string, string> = {
  MLC158583: "3947174", // Jeans
  MLC417372: "3947488", // Shorts
  MLC158467: "3947520", // Poleras / Manga larga
  MLC158382: "3947520", // Polerones
  MLC158340: "3947530", // Chaquetas
  // Gorros/Accesorios sin guía de tallas
};

// ¿La categoría usa guía de tallas?

export const ChannelView = ({ channel }: ChannelViewProps) => {
  const [expandedFam, setExpandedFam] = useState<Record<string, boolean>>({});

  const categorySupportsGrid = (categoryId?: string) => {
    if (!categoryId) return false;
    return Boolean(CATEGORY_GUIDE_MAP[categoryId]); // sólo si hay guía mapeada
  };
  // Género ya lo tienes. Agregamos tipo de prenda y color.
  const [garmentType, setGarmentType] = useState<string>("Chaqueta");
  const [color, setColor] = useState<string>("Negro");

  // ¿Qué categorías requieren estos atributos?
  const categoryRequiresGarmentType = (catId: string) =>
    ["MLC158340", "MLC158467", "MLC158382"].includes(catId);
  const categoryRequiresColor = (catId: string) =>
    [
      "MLC158583", // Jeans
      "MLC417372", // Shorts
      "MLC158467", // Poleras
      "MLC158382", // Polerones
      "MLC158340", // Chaquetas
    ].includes(catId);

  // Guardamos el producto que está en el modal para consultar su talla_id
  const currentProductRef = useRef<Product | null>(null);

  // Estado de la guía seleccionada
  const [selectedGuideId, setSelectedGuideId] = useState<string>("");

  // Paleta de Mercado Libre (label tal como ML los muestra)
  const COLOR_OPTIONS = [
    { key: "amarillo", label: "Amarillo", hex: "#FFD400" },
    { key: "azul", label: "Azul", hex: "#1976D2" },
    { key: "beige", label: "Beige", hex: "#D9C7A3" },
    { key: "blanco", label: "Blanco", hex: "#FFFFFF", border: true },
    { key: "celeste", label: "Celeste", hex: "#66CCFF" },
    { key: "dorado", label: "Dorado", hex: "#D4AF37" },
    { key: "gris", label: "Gris", hex: "#9E9E9E" },
    { key: "marron", label: "Marrón", hex: "#7B4B2A" },
    {
      key: "multicolor",
      label: "Multicolor",
      hex: "linear-gradient(90deg,#F44336,#FFEB3B,#4CAF50,#2196F3)",
    },
    { key: "naranja", label: "Naranja", hex: "#FF9800" },
    { key: "negro", label: "Negro", hex: "#000000" },
    {
      key: "plateado",
      label: "Plateado",
      hex: "linear-gradient(90deg,#B0B0B0,#E0E0E0)",
    },
    { key: "rojo", label: "Rojo", hex: "#E53935" },
    { key: "rosa", label: "Rosa", hex: "#EC407A" },
    { key: "verde", label: "Verde", hex: "#43A047" },
    { key: "violeta", label: "Violeta", hex: "#8E24AA" },
  ];
  // defaults para Jeans (puedes luego reemplazarlos por UI)
  const [pantType, setPantType] = useState<string>("Baggy"); // PANT_TYPE (ej: Baggy, Skinny, Recto…)
  const [mainMaterial, setMainMaterial] = useState<string>("Algodón"); // MAIN_MATERIAL

  const [colorKey, setColorKey] = useState<string>("negro"); // default
  const colorLabel =
    COLOR_OPTIONS.find((c) => c.key === colorKey)?.label || "Negro";

  const [products, setProducts] = useState<Product[]>([]);
  const [tallas, setTallas] = useState<LookupTal[]>([]);
  const [mlLinks, setMlLinks] = useState<Record<string, MLLink[]>>({});
  const [health, setHealth] = useState<Health | null>(null);

  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [rowBusy, setRowBusy] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState(new Date());
  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0);

  // Modal de publicación
  const [showPreview, setShowPreview] = useState(false);
  const [draft, setDraft] = useState<DraftPublish | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [draftSending, setDraftSending] = useState(false);

  // Estados de talla / size grid (requeridos por ML Moda)
  const [sizeGridId, setSizeGridId] = useState<string>("");
  const [sizeGridRowId, setSizeGridRowId] = useState<string>("");
  const [sizeValue, setSizeValue] = useState<string>("");

  // ↓ junto a sizeGridId / sizeGridRowId / sizeValue
  const [gender, setGender] = useState<"unisex" | "male" | "female">("unisex");

  const GENDER_OPTIONS = [
    { key: "unisex" as const, label: "Sin género", value_name: "Sin género" },
    { key: "male" as const, label: "Hombre", value_name: "Hombre" },
    { key: "female" as const, label: "Mujer", value_name: "Mujer" },
  ];

  // categorías de indumentaria donde exigimos GENDER
  const categoryRequiresGender = (catId: string) =>
    [
      "MLC158583", // Jeans
      "MLC417372", // Shorts
      "MLC158467", // Poleras / Manga larga
      "MLC158382", // Polerones
      "MLC158340", // Chaquetas
    ].includes(catId);

  const categoryRequiresMainMaterial = (catId: string) => catId === "MLC158583"; // Jeans
  const categoryRequiresPantType = (catId: string) => catId === "MLC158583"; // Jeans

  // Cat. ML buscador
  const [catQuery, setCatQuery] = useState("");
  const [catOpts, setCatOpts] = useState<CategoryOption[]>([]);
  const [catLoading, setCatLoading] = useState(false);
  const [draftCatName, setDraftCatName] = useState<string>(""); // etiqueta mostrada

  // ------- Config -------
  const channelConfig = {
    wordpress: {
      title: "WordPress",
      icon: <Globe size={24} />,
      color: "blue",
      stockKey: "stockweb" as const,
      description: "Gestión de inventario en tienda online",
    },
    mercadolibre: {
      title: "Mercado Libre",
      icon: <ShoppingCart size={24} />,
      color: "yellow",
      stockKey: "stockml" as const,
      description: "Sincronización con marketplace",
    },
  };
  const config = channelConfig[channel];

  // Mapeo categorías propias -> ML Chile
  // Mapeo categorías propias -> Mercado Libre Chile
  const meliCategoryMap: Record<number, string> = {
    2: "MLC158583", // Jeans (numérica)
    3: "MLC417372", // Shorts (numérica)
    4: "MLC158467", // Poleras (alfanumérica)
    5: "MLC158382", // Polerones (alfanumérica)
    6: "MLC4483", // Gorros (sin talla)
    7: "MLC1912", // Accesorios (sin talla)
    8: "MLC158340", // Chaquetas (alfanumérica)
    9: "MLC158467", // Poleras manga larga (alfanumérica)
  };

  // Tipos de pantalón permitidos (PANT_TYPE)
  const PANT_TYPE_OPTIONS = [
    { key: "jeans", label: "Jeans" },
    { key: "de_vestir", label: "De vestir" },
    { key: "palazzo", label: "Palazzo" },
    { key: "oxford", label: "Oxford" },
    { key: "cargo", label: "Cargo" },
    { key: "babucha", label: "Babucha" },
    { key: "legging", label: "Legging" },
    { key: "deportivo", label: "Deportivo" },
    { key: "desmontable", label: "Desmontable" },
    { key: "embarazada", label: "Embarazada" },
    { key: "buzo", label: "Buzo" },
  ];

  const getMeliCategory = (id: number | null | undefined) =>
    typeof id === "number" && meliCategoryMap[id]
      ? meliCategoryMap[id]
      : "MLC158583"; // Jeans como seguro

  const formatDate = (date: Date) =>
    date.toLocaleString("es-CL", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  const connected = !!health?.connected;
  const expiresInMin = useMemo(
    () =>
      !health?.expires_at_ms || !health.now_ms
        ? null
        : Math.floor((health.expires_at_ms - health.now_ms) / 60000),
    [health]
  );

  // ---------- Loaders ----------
  async function fetchHealth() {
    const { data, error } = await supabase.functions.invoke("meli-health");
    if (error) setHealth({ connected: false });
    else setHealth(data as Health);
  }

  async function fetchTallas() {
    const { data, error } = await supabase
      .from("tallas")
      .select("id_talla, tipo, etiqueta, valor_numerico")
      .order("tipo")
      .order("valor_numerico", { ascending: true, nullsFirst: true })
      .order("etiqueta");
    if (error) {
      console.error("Error tallas", error);
      setTallas([]);
      return;
    }
    setTallas(
      (data || []).map((t: any) => ({
        id: Number(t.id_talla),
        etiqueta: t.etiqueta as string,
        tipo: t.tipo as "alfanumerica" | "numerica",
        orden: t.valor_numerico ?? null,
      }))
    );
  }
  async function fetchProducts() {
    // Traemos cada SKU con su talla para poder agrupar por familia
    const { data, error } = await supabase
      .from("productos")
      .select(
        "id, name, sku, price, stockb2b, stockweb, stockml, categoria_id, categorias(nombre_categoria), talla_id"
      )
      .gt("stockml", 0)
      .order("id", { ascending: true });

    if (error) {
      console.error("Error productos", error);
      setProducts([]);
      return;
    }

    setProducts(
      (data || []).map((p: any) => ({
        id: Number(p.id),
        name: p.name,
        sku: p.sku,
        price: Number(p.price) || 0,
        categoria_id: p.categoria_id ?? null,
        categoria_nombre: p.categorias?.nombre_categoria || null,
        stockb2b: Number(p.stockb2b) || 0,
        stockweb: Number(p.stockweb) || 0,
        stockml: Number(p.stockml) || 0,
        talla_id: p.talla_id ?? null,
      }))
    );
  }

  async function fetchMlLinks() {
    const { data, error } = await supabase
      .from("ml_links")
      .select(
        "sku, meli_item_id, meli_variation_id, meli_status, last_seen_at"
      );

    if (error) {
      console.error("Error ml_links", error);
      setMlLinks({});
      return;
    }

    const map: Record<string, MLLink[]> = {};
    (data || []).forEach((row: any) => {
      const arr = map[row.sku] || [];
      arr.push({
        sku: row.sku,
        meli_item_id: row.meli_item_id ?? null,
        meli_variation_id: row.meli_variation_id ?? null,
        meli_status: row.meli_status ?? null,
        last_seen_at: row.last_seen_at ?? null,
      });
      map[row.sku] = arr;
    });
    setMlLinks(map);
  }

  async function handleSyncAll() {
    try {
      setSyncing(true);
      await supabase.functions.invoke("meli-pull", {
        body: { reason: "manual" },
      });
      await Promise.all([fetchProducts(), fetchMlLinks(), fetchHealth()]);
      setLastSync(new Date());
    } finally {
      setSyncing(false);
    }
  }

  // Antes: async function recomputeSizeByGuide(guideId: string) { ... }
  async function recomputeSizeByGuide(guideId: string, categoryId?: string) {
    const p = currentProductRef.current;
    const catId = categoryId || draft?.category_id;
    if (!p?.talla_id || !guideId || !catId) return;

    const t = tallas.find((tt) => tt.id === p.talla_id);
    const tipo = (t?.tipo || "alfanumerica") as "alfanumerica" | "numerica";
    const etiqueta_norm =
      tipo === "numerica"
        ? String((t as any)?.orden ?? t?.etiqueta ?? "").trim()
        : String(t?.etiqueta || "")
            .toUpperCase()
            .replace(/\s+/g, "");

    const { data, error } = await supabase
      .from("meli_size_map")
      .select("size_grid_id,size_grid_row_id,size_value")
      .eq("categoria_ml_id", catId)
      .eq("talla_tipo", tipo)
      .eq("etiqueta_norm", etiqueta_norm)
      .eq("size_grid_id", guideId)
      .maybeSingle();

    if (!error && data) {
      setSelectedGuideId(guideId);
      setSizeGridId(data.size_grid_id);
      setSizeGridRowId(data.size_grid_row_id);
      setSizeValue(data.size_value);
      setDraftError(null);
    } else {
      setSizeValue("");
      setSizeGridId("");
      setSizeGridRowId("");
      setDraftError(
        "La guía seleccionada no tiene fila para esta talla/categoría."
      );
    }
  }

  // Buscar categorías de ML (debounce)
  useEffect(() => {
    const q = catQuery.trim();
    if (!showPreview) return;

    if (!q || q.length < 2) {
      // evita ruido
      setCatOpts([]);
      return;
    }

    const t = setTimeout(async () => {
      try {
        setCatLoading(true);
        const { data, error } = await supabase.functions.invoke(
          "meli-categories",
          { body: { q } }
        );

        // Admite distintos formatos de respuesta
        const raw = (data?.results || data?.categories || []) as any[];
        const opts: CategoryOption[] = raw
          .map((r: any) => ({
            id: r.category_id || r.id,
            name: r.category_name || r.name,
            domain_name: r.domain_name || r.path?.[0]?.name || "",
          }))
          .filter((o) => typeof o.id === "string" && o.id.startsWith("ML"));

        if (!error) setCatOpts(opts);
        else setCatOpts([]);
      } finally {
        setCatLoading(false);
      }
    }, 300);

    return () => clearTimeout(t);
  }, [catQuery, showPreview]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([
        fetchTallas(),
        fetchProducts(),
        fetchMlLinks(),
        fetchHealth(),
      ]);
      setLoading(false);
    })();
    const interval = setInterval(() => void fetchHealth(), 1000 * 60 * 3);
    return () => clearInterval(interval);
  }, []);

  // Bloqueo global de drag mientras está abierto el modal
  useEffect(() => {
    const prevent = (e: any) => {
      e.preventDefault();
      e.stopPropagation();
    };
    if (showPreview) {
      window.addEventListener("dragover", prevent);
      window.addEventListener("drop", prevent);
    }
    return () => {
      window.removeEventListener("dragover", prevent);
      window.removeEventListener("drop", prevent);
    };
  }, [showPreview]);

  // ---------- Derivados ----------
  const key = config.stockKey;

  const isSkuPublished = (sku: string) =>
    (mlLinks[sku] || []).some(
      (l) => l.meli_status === "active" || l.meli_status === "paused"
    );

  const firstActiveItemId = (sku: string) =>
    (mlLinks[sku] || []).find(
      (l) => l.meli_status === "active" || l.meli_status === "paused"
    )?.meli_item_id || null;

  // Armar familias (resolvemos tipo de talla mirando la tabla 'tallas')
  const tallasById = useMemo(() => {
    const m = new Map<number, LookupTal>();
    for (const t of tallas) m.set(t.id, t);
    return m;
  }, [tallas]);

  const fams: FamRow[] = useMemo(() => {
    const map = new Map<string, FamRow>();
    for (const p of products) {
      const tipo: "alfanumerica" | "numerica" =
        tallasById.get(p.talla_id || -1)?.tipo || "alfanumerica";
      const famKey = `${p.name}::${p.categoria_id ?? 0}::${tipo}`;
      if (!map.has(famKey)) {
        map.set(famKey, {
          name: p.name,
          categoria_id: p.categoria_id ?? null,
          categoria_nombre: p.categoria_nombre ?? null,
          tipo,
          byTalla: {},
        });
      }
      if (p.talla_id) {
        map.get(famKey)!.byTalla[p.talla_id] = p;
      }
    }
    return Array.from(map.values()).sort((a, b) =>
      a.name.localeCompare(b.name)
    );
  }, [products, tallasById]);

  // Todas las tallas por tipo (para construir columnas de la matriz)
  const tallasByTipo = useMemo(
    () => ({
      alfanumerica: tallas
        .filter((t) => t.tipo === "alfanumerica")
        .sort(
          (a, b) =>
            ALFA_ORDER.indexOf(a.etiqueta) - ALFA_ORDER.indexOf(b.etiqueta)
        ),
      numerica: tallas
        .filter((t) => t.tipo === "numerica")
        .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0)),
    }),
    [tallas]
  );

  const columnsForFam = (fam: FamRow) =>
    fam.tipo === "numerica" ? tallasByTipo.numerica : tallasByTipo.alfanumerica;

  const totalStockML = useMemo(
    () =>
      products.reduce((sum, p) => sum + (((p as any)[key] as number) || 0), 0),
    [products, key]
  );

  // ---------- Publicar ----------
  function openPublishPreview(p: Product) {
    currentProductRef.current = p;

    const attrs: DraftAttr[] = [
      { id: "BRAND", value_name: "Genérica" },
      { id: "MODEL", value_name: "Prueba" },
    ];

    // 1) Categoría ML automática desde tu mapeo
    const autoCatId = getMeliCategory(p.categoria_id ?? null);

    // 2) Construye el borrador primero
    const d: DraftPublish = {
      sku: p.sku,
      title: p.name || `SKU ${p.sku}`,
      price: p.price || 9900,
      available_quantity: p.stockml || 1,
      category_id: autoCatId,
      pictures: [],
      attributes: attrs,
      condition: "new",
      listing_type_id: "gold_special",
      currency_id: "CLP",
      buying_mode: "buy_it_now",
    };

    // 3) Estado visual del modal
    setDraft(d);
    setDraftCatName(p.categoria_nombre || "");
    setShowPreview(true);
    setDraftError(null);

    // Limpia SIZE/GRID
    setSizeGridId("");
    setSizeGridRowId("");
    setSizeValue("");

    // 4) Guía por categoría -> si no hay, fallback por tipo de talla
    const autoGuide = CATEGORY_GUIDE_MAP[d.category_id] || "";
    const t = tallas.find((tt) => tt.id === p.talla_id);
    const fallbackGuide = t?.tipo === "numerica" ? "3947174" : "3947520";
    const guideToUse = autoGuide || fallbackGuide;

    setSelectedGuideId(guideToUse);
    void recomputeSizeByGuide(guideToUse, d.category_id);
  }

  async function confirmPublish() {
    if (!draft) return;

    setDraftError(null);

    // Validaciones básicas de UI
    if (!draft.title.trim()) {
      setDraftError("Título requerido");
      return;
    }
    if (!draft.pictures.length) {
      setDraftError("Debes subir al menos una imagen");
      return;
    }

    // Asegura categoría válida
    const safeDraft: DraftPublish = {
      ...draft,
      category_id: draft.category_id.startsWith("ML")
        ? draft.category_id
        : "MLC158583", // fallback Jeans
    };

    // Helpers locales
    const requiresGrid = (catId: string) => Boolean(CATEGORY_GUIDE_MAP[catId]);
    const requiresGender = (catId: string) =>
      [
        "MLC158583", // Jeans
        "MLC417372", // Shorts
        "MLC158467", // Poleras
        "MLC158382", // Polerones
        "MLC158340", // Chaquetas
      ].includes(catId);

    const requiresColor = (catId: string) =>
      [
        "MLC158583", // Jeans
        "MLC417372", // Shorts
        "MLC158467", // Poleras
        "MLC158382", // Polerones
        "MLC158340", // Chaquetas
      ].includes(catId);
    const isJeans = safeDraft.category_id === "MLC158583";
    const isJackets = safeDraft.category_id === "MLC158340";

    // Forzamos la guía por categoría si aplica
    const forcedGuide = CATEGORY_GUIDE_MAP[safeDraft.category_id] || "";
    const gridIdToUse = forcedGuide || String(sizeGridId || "");
    let rowIdToUse = String(sizeGridRowId || "");

    // … construir atributos
    const base = (safeDraft.attributes || []).filter(
      (a) =>
        a.id !== "SIZE" &&
        a.id !== "SIZE_GRID_ID" &&
        a.id !== "SIZE_GRID_ROW_ID" &&
        a.id !== "GENDER" &&
        a.id !== "COLOR" &&
        a.id !== "PANT_TYPE" &&
        a.id !== "GARMENT_TYPE" &&
        a.id !== "MAIN_MATERIAL"
    );

    if (requiresGrid(safeDraft.category_id)) {
      if (!sizeValue) return setDraftError("Debes resolver la talla (SIZE).");

      if (!/^\d+$/.test(String(gridIdToUse))) {
        return setDraftError(
          `SIZE_GRID_ID inválido: "${gridIdToUse}". Debe ser sólo dígitos (ej "3947174").`
        );
      }

      if (!new RegExp(`^${gridIdToUse}:\\d+$`).test(String(sizeGridRowId))) {
        return setDraftError(
          `La fila de guía (${sizeGridRowId}) no corresponde a la guía ${gridIdToUse}. ` +
            `Cambia la guía o vuelve a seleccionar la talla.`
        );
      }
    }
    const finalAttrs: DraftAttr[] = [...base];

    // SIZE + GRID (solo si aplica y son consistentes)
    // --- FASHION GRID ---
    // --- FASHION GRID ---
    // Aquí mantenemos value_name por consistencia,
    // y añadimos value_id porque ML lo exige en estos 3 atributos.
    if (requiresGrid(safeDraft.category_id)) {
      const gridId = String(gridIdToUse).trim(); // ej: "3947174"
      const rowId = String(sizeGridRowId).trim(); // ej: "3947174:5"
      const sizeVal = String(sizeValue).trim(); // ej: "42"

      // Limpia duplicados por si vienen de antes
      const drop = (id: string) => {
        const i = finalAttrs.findIndex((a) => a.id === id);
        if (i >= 0) finalAttrs.splice(i, 1);
      };
      drop("SIZE");
      drop("SIZE_GRID_ID");
      drop("SIZE_GRID_ROW_ID");

      // ✅ SIZE: mantener label humano y enviar id de fila
      finalAttrs.push({
        id: "SIZE",
        value_name: sizeVal, // "42" o "M" (consistencia en tu sistema)
        value_id: rowId, // "3947174:5" (requisito ML)
      });

      // ✅ SIZE_GRID_ID: número de guía
      finalAttrs.push({
        id: "SIZE_GRID_ID",
        value_name: gridId, // lo dejamos también como string visible
        value_id: gridId, // id numérico que valida ML
      });

      // ✅ SIZE_GRID_ROW_ID: "<GRID>:<ROW>"
      finalAttrs.push({
        id: "SIZE_GRID_ROW_ID",
        value_name: rowId, // visible/consistente
        value_id: rowId, // requerido por ML
      });
      safeDraft.attributes = finalAttrs;
      console.debug(
        "POST → meli-post payload",
        JSON.parse(JSON.stringify(safeDraft))
      );
      console.debug("→ FASHION GRID", { gridId, rowId, sizeVal });
    }
    // dentro de confirmPublish(), antes de enviar safeDraft
    if (
      [
        "MLC158583", // Jeans
        "MLC417372", // Shorts
        "MLC158467", // Poleras
        "MLC158382", // Polerones
        "MLC158340", // Chaquetas
      ].includes(safeDraft.category_id)
    ) {
      finalAttrs.push({
        id: "AGE_GROUP",
        value_id: "6725189",
        value_name: "Adulto",
      });
    }

    // GENDER (si aplica)
    if (requiresGender(safeDraft.category_id)) {
      const gVN =
        GENDER_OPTIONS.find((o) => o.key === gender)?.value_name ||
        "Sin género";
      finalAttrs.push({ id: "GENDER", value_name: gVN });
    }

    // COLOR (si aplica)
    if (requiresColor(safeDraft.category_id)) {
      finalAttrs.push({ id: "COLOR", value_name: colorLabel }); // p.ej. "Negro"
    }

    // Atributos específicos por categoría
    // Atributos específicos por categoría
    if (isJeans) {
      // PANT_TYPE requerido en Jeans
      if (!pantType.trim()) {
        setDraftError(
          "Debes indicar el tipo de pantalón (PANT_TYPE), ej: Skinny, Baggy, Regular."
        );
        return;
      }
      finalAttrs.push({ id: "PANT_TYPE", value_name: pantType.trim() });

      // MAIN_MATERIAL requerido en Jeans
      finalAttrs.push({
        id: "MAIN_MATERIAL",
        value_name: mainMaterial.trim() || "Algodón",
      });
    } else if (isJackets) {
      if (garmentType.trim()) {
        finalAttrs.push({ id: "GARMENT_TYPE", value_name: garmentType.trim() });
      }
    }

    // Asignamos atributos finales
    safeDraft.attributes = finalAttrs;

    // Log para depurar
    console.debug(
      "POST → meli-post payload",
      JSON.parse(JSON.stringify(safeDraft))
    );

    try {
      setDraftSending(true);
      const { data, error } = await supabase.functions.invoke("meli-post", {
        body: safeDraft,
      });
      if (error || !(data as any)?.ok) {
        const msg =
          error?.message || (data as any)?.error || "Error publicando";
        throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
      }
      setShowPreview(false);
      await handleSyncAll();
      alert("Publicado en Mercado Libre");
    } catch (e: any) {
      setDraftError(e?.message || "No se pudo publicar");
    } finally {
      setDraftSending(false);
    }
  }

  // Subir imagen a Storage (pública)
  async function uploadFileToStorage(file: File): Promise<string> {
    const bucket = "ml-images";
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const safeSku = (draft?.sku || "SKU").replace(/[^a-zA-Z0-9-_]/g, "_");
    const path = `sku/${safeSku}/${Date.now()}.${ext}`;

    const { error: upErr } = await supabase.storage
      .from(bucket)
      .upload(path, file, {
        cacheControl: "3600",
        upsert: true,
        contentType: file.type || "image/jpeg",
      });
    if (upErr) throw new Error("No se pudo subir la imagen");

    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    if (!data?.publicUrl) throw new Error("No se pudo obtener la URL pública");

    return data.publicUrl;
  }

  const handleCellAction = async (p: Product) => {
    try {
      setRowBusy(p.sku);
      if (!connected) throw new Error("Mercado Libre desconectado");
      if (isSkuPublished(p.sku)) {
        await handleSyncAll();
        alert("Estado sincronizado");
      } else {
        openPublishPreview(p);
      }
    } catch (e: any) {
      alert(e?.message ?? String(e));
    } finally {
      setRowBusy(null);
    }
  };

  if (loading)
    return (
      <div className="text-center py-12 text-neutral-500">
        Cargando productos…
      </div>
    );

  return (
  <div className="space-y-6 transition-colors duration-300">
    {/* Header */}
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div className="flex items-center space-x-3">
        <div className="p-3 bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-300 rounded-lg">
          {config.icon}
        </div>
        <div>
          <h2 className="text-2xl font-bold text-neutral-900 dark:text-white">
            {config.title}
          </h2>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            {config.description}
          </p>
        </div>
      </div>

      <button
        onClick={handleSyncAll}
        disabled={syncing}
        className="flex items-center space-x-2 px-4 py-2 bg-green-700 hover:bg-green-800 text-white rounded-lg disabled:opacity-50 transition-all"
      >
        <RefreshCw size={18} className={syncing ? "animate-spin" : ""} />
        <span>{syncing ? "Sincronizando…" : "Sincronizar ahora"}</span>
      </button>
    </div>

    {/* Métricas */}
<div className="grid grid-cols-1 md:grid-cols-3 gap-6">
  {/* Estado */}
  <div className="bg-white dark:bg-[#1a1a1a] rounded-xl shadow-sm border border-amber-100 dark:border-amber-800 p-6 transition-colors">
    <div className="flex items-center justify-between mb-2">
      <h3 className="text-sm font-semibold text-amber-700 dark:text-amber-400 uppercase">
        Estado
      </h3>
      {connected ? (
        <CheckCircle className="text-green-600 dark:text-green-400" size={20} />
      ) : (
        <AlertCircle className="text-red-600 dark:text-red-400" size={20} />
      )}
    </div>

    {connected ? (
      <>
        <p className="text-2xl font-bold text-green-600 dark:text-green-400">Conectado</p>
        <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
          {health?.nickname ? `@${health.nickname} · ` : ""}
          {typeof expiresInMin === "number"
            ? `expira en ${expiresInMin} min`
            : ""}
        </p>
      </>
    ) : (
      <>
        <p className="text-2xl font-bold text-red-600 dark:text-red-400">Desconectado</p>
        <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
          Conecta tu cuenta para continuar.
        </p>
      </>
    )}
  </div>

  {/* Productos con stock ML */}
  <div className="bg-white dark:bg-[#1a1a1a] rounded-xl shadow-sm border border-amber-100 dark:border-amber-800 p-6 transition-colors">
    <h3 className="text-sm font-semibold text-amber-700 dark:text-amber-400 uppercase mb-2">
      Productos con stock ML
    </h3>
    <p className="text-2xl font-bold text-neutral-900 dark:text-white">{fams.length}</p>
    <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
      agrupadas por nombre + categoría
    </p>
  </div>

  {/* Stock ML Total */}
  <div className="bg-white dark:bg-[#1a1a1a] rounded-xl shadow-sm border border-amber-100 dark:border-amber-800 p-6 transition-colors">
    <h3 className="text-sm font-semibold text-amber-700 dark:text-amber-400 uppercase mb-2">
      Stock ML Total
    </h3>
    <p className="text-2xl font-bold text-neutral-900 dark:text-white">{totalStockML}</p>
    <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">unidades</p>
  </div>
</div>


      {/* Tarjetas de productos con detalle de tallas */}
<div className="bg-white dark:bg-neutral-900 rounded-xl p-6 border border-neutral-200 dark:border-neutral-700 transition-colors">
  <div className="flex items-center justify-between mb-6">
    <h3 className="text-lg font-bold text-neutral-900 dark:text-white">
      Productos en {config.title}
    </h3>
    <span className="text-sm text-neutral-600 dark:text-neutral-400">
      Última sync: {formatDate(lastSync)}
    </span>
  </div>

  {fams.length === 0 ? (
    <div className="text-center py-12 text-neutral-500 dark:text-neutral-400">
      No hay productos para mostrar.
    </div>
  ) : (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
      {fams.map((fam, idx) => {
        const cols = columnsForFam(fam);
        const totalFam = cols.reduce(
          (acc, t) => acc + (fam.byTalla[t.id]?.stockml || 0),
          0
        );

        const firstSkuProduct = Object.values(fam.byTalla)[0];
        const hasAnyPublished =
          firstSkuProduct &&
          Object.values(fam.byTalla).some((p) => isSkuPublished(p.sku));

        const famKey = `${fam.name}::${fam.categoria_id ?? 0}::${fam.tipo}`;
        const isOpen = !!expandedFam[famKey];

        const toggle = () =>
          setExpandedFam((prev) => ({
            ...prev,
            [famKey]: !prev[famKey],
          }));

        const sampleImg =
          "https://http2.mlstatic.com/D_NQ_NP_2X_954300-MLC54978809383_042023-F.webp";

        return (
          <div
            key={famKey + idx}
            className="bg-amber-50 dark:bg-neutral-800 border border-amber-100 dark:border-amber-800 rounded-2xl shadow-sm hover:shadow-md overflow-hidden transition flex flex-col"
          >
            {/* Imagen */}
            <div className="aspect-[4/3] bg-white dark:bg-neutral-900 flex items-center justify-center">
              <img
                src={sampleImg}
                alt={fam.name}
                className="object-contain h-full w-full"
              />
            </div>

            {/* Header tarjeta */}
            <div className="p-4 flex flex-col gap-2">
          <div className="flex justify-between items-start">
            <div>
              <h4 className="font-semibold text-neutral-900 dark:text-white line-clamp-2">
                {fam.name}
              </h4>
              <p className="text-sm text-neutral-500 dark:text-neutral-400">
                {fam.categoria_nombre || "Sin categoría"}
              </p>
            </div>
            <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">
              {new Intl.NumberFormat("es-CL", {
                style: "currency",
                currency: "CLP",
              }).format(Object.values(fam.byTalla)[0]?.price || 0)}
            </p>
          </div>

              {/* Métricas rápidas */}
              <div className="flex items-center justify-between text-xs mt-1">
                <div className="flex flex-col">
                  <span className="text-neutral-500 dark:text-neutral-400">
                    Stock ML total
                  </span>
                  <span
                    className={`text-sm font-bold ${
                      totalFam === 0
                        ? "text-red-600 dark:text-red-400"
                        : totalFam < 5
                        ? "text-orange-500 dark:text-orange-400"
                        : "text-green-700 dark:text-green-400"
                    }`}
                  >
                    {totalFam} unid.
                  </span>
                </div>

                {firstSkuProduct && (
                  <div className="text-right">
                    <span className="text-neutral-500 dark:text-neutral-400 block">
                      Desde
                    </span>
                    <span className="text-sm font-semibold text-neutral-900 dark:text-white">
                      {new Intl.NumberFormat("es-CL", {
                        style: "currency",
                        currency: "CLP",
                      }).format(firstSkuProduct.price || 0)}
                    </span>
                  </div>
                )}
              </div>

              {/* Botón para ver tallas / acciones */}
              <button
                onClick={toggle}
                className="mt-3 w-full flex items-center justify-between px-3 py-2 rounded-lg bg-amber-100 dark:bg-amber-900/40 hover:bg-amber-200 dark:hover:bg-amber-800 text-amber-800 dark:text-amber-300 text-xs font-semibold transition"
              >
                <span>
                  {isOpen
                    ? "Ocultar tallas y acciones"
                    : "Gestionar tallas y publicaciones"}
                </span>
                <span
                  className={`transform transition ${
                    isOpen ? "rotate-180" : "rotate-0"
                  }`}
                >
                  ˅
                </span>
              </button>
            </div>

            {/* Panel expandible con tallas */}
            {isOpen && (
              <div className="px-4 pb-4 border-t border-neutral-100 dark:border-neutral-700 text-xs">
                <div className="grid grid-cols-[1.2fr,1.1fr,0.9fr,1.3fr,1.3fr] gap-2 py-2 text-[10px] text-neutral-500 dark:text-neutral-400 font-semibold">
                  <div>Talla</div>
                  <div>SKU</div>
                  <div className="text-center">Stock ML</div>
                  <div>Estado ML</div>
                  <div className="text-center">Acción</div>
                </div>

                {cols.map((t) => {
                  const p = fam.byTalla[t.id];
                  if (!p) return null;

                  const published = isSkuPublished(p.sku);
                  const activeItemId = firstActiveItemId(p.sku);
                  const stock = p.stockml || 0;

                  const stockColor =
                    stock === 0
                      ? "text-red-600 dark:text-red-400"
                      : stock < 5
                      ? "text-orange-500 dark:text-orange-400"
                      : "text-green-700 dark:text-green-400";

                  return (
                    <div
                      key={t.id}
                      className="grid grid-cols-[1.2fr,1.1fr,0.9fr,1.3fr,1.3fr] gap-2 items-center py-1.5 rounded-md hover:bg-neutral-50 dark:hover:bg-neutral-800"
                    >
                      {/* Talla */}
                      <div className="font-semibold text-neutral-800 dark:text-neutral-200">
                        {t.etiqueta}
                      </div>

                      {/* SKU */}
                      <div className="text-[10px] text-neutral-500 dark:text-neutral-400 truncate">
                        {p.sku}
                      </div>

                      {/* Stock */}
                      <div
                        className={`text-center text-[11px] font-semibold ${stockColor}`}
                      >
                        {stock}
                      </div>

                      {/* Estado */}
                      <div className="text-[10px]">
                        {published && activeItemId ? (
                          <a
                            href={`https://articulo.mercadolibre.cl/${activeItemId}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300"
                          >
                            <LinkIcon size={10} />
                            <span>Publicado</span>
                          </a>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400">
                            Sin publicar
                          </span>
                        )}
                      </div>

                      {/* Acción */}
                      <div className="flex justify-center">
                        <button
                          onClick={() => handleCellAction(p)}
                          disabled={!connected || rowBusy === p.sku}
                          className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-semibold text-white transition
                            ${
                              published
                                ? "bg-blue-600 hover:bg-blue-700"
                                : "bg-amber-600 hover:bg-amber-700"
                            }
                            disabled:opacity-40`}
                          title={
                            published
                              ? "Refrescar publicación en Mercado Libre"
                              : "Publicar esta talla en Mercado Libre"
                          }
                        >
                          {rowBusy === p.sku ? (
                            <RefreshCw size={10} className="animate-spin" />
                          ) : published ? (
                            <Repeat size={10} />
                          ) : (
                            <Upload size={10} />
                          )}
                          <span>{published ? "Refrescar" : "Publicar"}</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  )}
</div>


      {/* Modal de previsualización */}
{showPreview && draft && (
  <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 transition-colors">
    <div className="w-full max-w-3xl bg-white dark:bg-neutral-900 rounded-2xl shadow-xl overflow-hidden border border-neutral-200 dark:border-neutral-700">
      {/* Header modal */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200 dark:border-neutral-700">
        <h3 className="font-semibold text-neutral-900 dark:text-white">
          Previsualizar publicación
        </h3>
        <button
          onClick={() => setShowPreview(false)}
          className="p-1 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-300"
        >
          <X size={18} />
        </button>
      </div>

      <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Formulario */}
        <div className="space-y-3">
          <label className="text-sm text-neutral-700 dark:text-neutral-300">
            Título
          </label>
          <input
            className="w-full border border-neutral-300 dark:border-neutral-700 rounded-xl p-3 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white"
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm text-neutral-700 dark:text-neutral-300">
                Precio
              </label>
              <input
                className="w-full border border-neutral-300 dark:border-neutral-700 rounded-xl p-3 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white"
                type="number"
                value={draft.price}
                onChange={(e) =>
                  setDraft({ ...draft, price: Number(e.target.value) || 0 })
                }
              />
            </div>
            <div>
              <label className="text-sm text-neutral-700 dark:text-neutral-300">
                Cantidad
              </label>
              <input
                className="w-full border border-neutral-300 dark:border-neutral-700 rounded-xl p-3 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white"
                type="number"
                value={draft.available_quantity}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    available_quantity: Number(e.target.value) || 0,
                  })
                }
              />
            </div>
          </div>

          {/* Categoría (asignada automáticamente) */}
          <label className="text-sm text-neutral-700 dark:text-neutral-300">
            Categoría
          </label>
          <div className="w-full border border-neutral-300 dark:border-neutral-700 rounded-xl p-3 bg-neutral-50 dark:bg-neutral-800 text-neutral-900 dark:text-white">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium">
                  {draftCatName ||
                    currentProductRef.current?.categoria_nombre ||
                    "—"}
                </div>
                <div className="text-xs text-neutral-500 dark:text-neutral-400">
                  {draft.category_id} · valor asignado para Mercado Libre
                </div>
              </div>
              <span className="text-[11px] px-2 py-1 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 font-semibold">
                Asignada automáticamente
              </span>
            </div>
          </div>

          {/* Guía de tallas + Talla resultante */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm text-neutral-700 dark:text-neutral-300">
                Guía de tallas (ML)
              </label>
              <select
                className="w-full border border-neutral-300 dark:border-neutral-700 rounded-xl p-3 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white"
                value={selectedGuideId}
                onChange={async (e) => {
                  const gid = e.target.value;
                  setSelectedGuideId(gid);
                  if (gid) await recomputeSizeByGuide(gid, draft?.category_id);
                }}
              >
                <option value="">(usar guía por categoría)</option>
                {GUIDE_OPTIONS.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.label} · {g.id}
                  </option>
                ))}
              </select>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                Guía actual:{" "}
                <strong>
                  {selectedGuideId || "(auto por categoría)"}
                </strong>
              </p>
            </div>

            <div>
              <label className="text-sm text-neutral-700 dark:text-neutral-300">
                Talla a publicar
              </label>
              <div className="w-full border border-neutral-300 dark:border-neutral-700 rounded-xl p-3 bg-neutral-50 dark:bg-neutral-800 text-neutral-900 dark:text-white">
                <span className="font-semibold">{sizeValue || "—"}</span>
              </div>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                Se enviará en el atributo <code>SIZE</code>.
              </p>
            </div>
          </div>

          {draftError && (
            <p className="text-sm text-red-600 dark:text-red-400">
              {draftError}
            </p>
          )}

          <div className="flex gap-2 pt-2">
            <button
              onClick={confirmPublish}
              disabled={draftSending}
              className="flex-1 bg-amber-600 hover:bg-amber-700 text-white py-2 rounded-lg disabled:opacity-50 transition-all"
            >
              {draftSending ? "Publicando…" : "Publicar ahora"}
            </button>
            <button
              onClick={() => setShowPreview(false)}
              className="px-4 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-800 dark:text-neutral-200"
            >
              Cancelar
            </button>
          </div>
        </div>

        {/* Vista previa + dropzone */}
        <div className="border border-neutral-300 dark:border-neutral-700 rounded-xl p-4 bg-neutral-50 dark:bg-neutral-800 transition-colors">
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-2">
            Imágenes
          </p>

          <div
            className={`h-40 flex items-center justify-center relative rounded-md border-2 ${
              isDragging
                ? "border-amber-500 border-dashed bg-amber-50 dark:bg-amber-900/20"
                : "border-transparent"
            }`}
            onDragEnter={(e) => {
              e.preventDefault();
              e.stopPropagation();
              dragCounter.current++;
              setIsDragging(true);
            }}
            onDragOver={(e) => e.preventDefault()}
            onDragLeave={(e) => {
              dragCounter.current = Math.max(0, dragCounter.current - 1);
              if (dragCounter.current === 0) setIsDragging(false);
            }}
            onDrop={async (e) => {
              e.preventDefault();
              dragCounter.current = 0;
              setIsDragging(false);
              try {
                const file = e.dataTransfer?.files?.[0];
                if (!file) return;
                if (!file.type.startsWith("image/"))
                  throw new Error("Solo se permiten imágenes");
                const url = await uploadFileToStorage(file);
                setDraft((d) =>
                  d ? { ...d, pictures: [url, ...d.pictures] } : d
                );
              } catch (err: any) {
                setDraftError(err?.message || "No se pudo cargar la imagen");
              }
            }}
          >
            <img
              src={
                draft.pictures[0] ||
                "https://http2.mlstatic.com/D_NQ_NP_2X_000000-MLC0000000000_000000-F.jpg"
              }
              alt="preview"
              className="h-full object-contain"
            />
            {isDragging && (
              <div className="absolute inset-0 flex items-center justify-center text-sm font-medium text-amber-700 dark:text-amber-300">
                Suelta la imagen para subirla
              </div>
            )}
          </div>

          {draft.pictures.length > 0 && (
            <div className="mt-4 grid grid-cols-4 gap-3">
              {draft.pictures.map((url, i) => (
                <div key={url + i} className="relative group">
                  <img
                    src={url}
                    className="h-20 w-full object-cover rounded-md border border-neutral-300 dark:border-neutral-700"
                  />
                  <button
                    title="Eliminar"
                    onClick={() =>
                      setDraft((d) =>
                        d
                          ? {
                              ...d,
                              pictures: d.pictures.filter((_, idx) => idx !== i),
                            }
                          : d
                      )
                    }
                    className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition bg-white/80 dark:bg-neutral-800/80 rounded-full p-1 shadow"
                  >
                    <Trash2 size={14} className="text-neutral-700 dark:text-neutral-300" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="p-3 space-y-1 mt-4 border border-neutral-200 dark:border-neutral-700 rounded-lg bg-white dark:bg-neutral-900">
            <div className="text-sm text-neutral-500 dark:text-neutral-400">
              {draft.category_id} · valor asignado para Mercado Libre
            </div>
            <div className="font-semibold text-neutral-900 dark:text-white">
              {draft.title}
            </div>
            <div className="text-lg font-bold text-amber-700 dark:text-amber-400">
              {new Intl.NumberFormat("es-CL", {
                style: "currency",
                currency: "CLP",
              }).format(draft.price || 0)}
            </div>
            <div className="text-sm text-neutral-600 dark:text-neutral-400">
              Stock: {draft.available_quantity} ·{" "}
              {draft.condition === "new" ? "Nuevo" : "Usado"}
            </div>
          </div>

          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-3">
            El resultado final puede variar según validaciones de Mercado Libre.
          </p>
        </div>
      </div>
    </div>
  </div>
)}

    </div>
  );
};

export default ChannelView;
