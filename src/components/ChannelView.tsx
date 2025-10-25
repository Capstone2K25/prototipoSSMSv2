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
  const categorySupportsGrid = (categoryId?: string) => {
    if (!categoryId) return false;
    return Boolean(CATEGORY_GUIDE_MAP[categoryId]); // sólo si hay guía mapeada
  };
  // Género ya lo tienes. Agregamos tipo de prenda y color.
  const [garmentType, setGarmentType] = useState<string>("Chaqueta");
  const [color, setColor] = useState<string>("Negro");

  // ¿Qué categorías requieren estos atributos?
  const categoryRequiresGarmentType = (catId: string) => catId === "MLC158340"; // Chaquetas
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

    // Validaciones de talla/guía (sólo si la categoría usa grid)
    if (requiresGrid(safeDraft.category_id)) {
      if (!sizeValue) {
        setDraftError("Debes resolver la talla (SIZE).");
        return;
      }

      if (!/^\d+$/.test(gridIdToUse)) {
        setDraftError(
          `SIZE_GRID_ID inválido: "${gridIdToUse}". Debe ser sólo dígitos (ej "3947174").`
        );
        return;
      }

      // si el row no pertenece a la guía forzada, obliga a recomputar y bloquea el publish
      if (!new RegExp(`^${gridIdToUse}:\\d+$`).test(rowIdToUse)) {
        setDraftError(
          `La fila de guía (${rowIdToUse}) no corresponde a la guía ${gridIdToUse}. Cambia la guía o vuelve a seleccionar la talla.`
        );
        return;
      }
    }

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

    const finalAttrs: DraftAttr[] = [...base];

    // SIZE + GRID (solo si aplica y son consistentes)
    if (requiresGrid(safeDraft.category_id)) {
      finalAttrs.push({ id: "SIZE", value_name: String(sizeValue).trim() });
      finalAttrs.push({
        id: "SIZE_GRID_ID",
        value_name: String(gridIdToUse).trim(),
      });
      finalAttrs.push({
        id: "SIZE_GRID_ROW_ID",
        value_name: String(rowIdToUse).trim(),
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div
            className={`p-3 bg-${config.color}-100 text-${config.color}-600 rounded-lg`}
          >
            {config.icon}
          </div>
          <div>
            <h2 className="text-2xl font-bold text-neutral-900">
              {config.title}
            </h2>
            <p className="text-sm text-neutral-600">{config.description}</p>
          </div>
        </div>
        <button
          onClick={handleSyncAll}
          disabled={syncing}
          className="flex items-center space-x-2 px-4 py-2 bg-green-700 text-white rounded-lg hover:bg-green-800 disabled:opacity-50"
        >
          <RefreshCw size={18} className={syncing ? "animate-spin" : ""} />
          <span>{syncing ? "Sincronizando…" : "Sincronizar ahora"}</span>
        </button>
      </div>

      {/* Métricas */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-neutral-600 uppercase">
              Estado
            </h3>
            {connected ? (
              <CheckCircle className="text-green-600" size={20} />
            ) : (
              <AlertCircle className="text-red-600" size={20} />
            )}
          </div>
          {connected ? (
            <>
              <p className="text-2xl font-bold text-green-600">Conectado</p>
              <p className="text-xs text-neutral-500 mt-1">
                {health?.nickname ? `@${health.nickname} · ` : ""}
                {typeof expiresInMin === "number"
                  ? `expira en ${expiresInMin} min`
                  : ""}
              </p>
            </>
          ) : (
            <>
              <p className="text-2xl font-bold text-red-600">Desconectado</p>
              <p className="text-xs text-neutral-500 mt-1">
                Conecta tu cuenta para continuar.
              </p>
            </>
          )}
        </div>

        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h3 className="text-sm font-semibold text-neutral-600 uppercase mb-2">
            Productos con stock ML
          </h3>
          <p className="text-2xl font-bold">{fams.length}</p>
          <p className="text-sm text-neutral-500 mt-1">
            agrupadas por nombre + categoría
          </p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h3 className="text-sm font-semibold text-neutral-600 uppercase mb-2">
            Stock ML Total
          </h3>
          <p className="text-2xl font-bold">{totalStockML}</p>
          <p className="text-sm text-neutral-500 mt-1">unidades</p>
        </div>
      </div>

      {/* Tabla agrupada por familia con matriz de tallas */}
      <div className="bg-white rounded-xl shadow-sm border p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-bold text-neutral-900">
            Productos en {config.title}
          </h3>
          <span className="text-sm text-neutral-600">
            Última sync: {formatDate(lastSync)}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b">
                <th className="text-left  py-3 px-4 text-sm font-semibold">
                  Producto
                </th>
                <th className="text-left  py-3 px-4 text-sm font-semibold">
                  Tallas (Stock ML / Publicación)
                </th>
                <th className="text-center py-3 px-4 text-sm font-semibold">
                  Total ML
                </th>
              </tr>
            </thead>
            <tbody>
              {fams.map((fam, idx) => {
                const cols = columnsForFam(fam);
                const totalFam = cols.reduce(
                  (acc, t) => acc + (fam.byTalla[t.id]?.stockml || 0),
                  0
                );

                return (
                  <tr key={fam.name + idx} className="border-b align-top">
                    {/* Columna nombre/categoría */}
                    <td className="py-4 px-4 w-64">
                      <div className="font-semibold">{fam.name}</div>
                      <div className="text-sm text-neutral-500">
                        {fam.categoria_nombre || "—"}
                      </div>
                    </td>

                    {/* Matriz de tallas */}
                    <td className="py-4 px-4">
                      <div
                        className="overflow-x-auto"
                        style={{ minWidth: 420 }}
                      >
                        <div
                          className="grid gap-y-2 gap-x-2 items-center"
                          style={{
                            gridTemplateColumns: `120px repeat(${cols.length}, minmax(84px, 1fr))`,
                          }}
                        >
                          {/* Encabezados tallas */}
                          <div></div>
                          {cols.map((t) => (
                            <div
                              key={t.id}
                              className="text-center text-xs text-neutral-700 font-medium"
                            >
                              {t.etiqueta}
                            </div>
                          ))}

                          {/* Fila: Stock ML */}
                          <div className="text-right pr-2">
                            <span className="px-2 py-1 rounded text-xs font-semibold bg-amber-100 text-amber-700">
                              Stock ML
                            </span>
                          </div>
                          {cols.map((t) => {
                            const p = fam.byTalla[t.id];
                            const val = p?.stockml ?? 0;
                            const cls =
                              val === 0
                                ? "text-red-600"
                                : val < 5
                                ? "text-orange-600"
                                : "text-green-700";
                            return (
                              <div key={t.id} className="text-center">
                                <span className={`font-semibold ${cls}`}>
                                  {val}
                                </span>
                              </div>
                            );
                          })}

                          {/* Fila: Publicación / Acción */}
                          <div className="text-right pr-2">
                            <span className="px-2 py-1 rounded text-xs font-semibold bg-neutral-100 text-neutral-700">
                              Publicación
                            </span>
                          </div>
                          {cols.map((t) => {
                            const p = fam.byTalla[t.id];
                            if (!p)
                              return (
                                <div
                                  key={t.id}
                                  className="text-center text-neutral-400"
                                >
                                  —
                                </div>
                              );
                            const published = isSkuPublished(p.sku);
                            const activeItemId = firstActiveItemId(p.sku);
                            return (
                              <div key={t.id} className="text-center">
                                {published && activeItemId ? (
                                  <a
                                    className="bg-green-50 text-green-700 text-[11px] font-semibold px-2 py-1 rounded-full inline-flex items-center gap-1"
                                    href={`https://articulo.mercadolibre.cl/${activeItemId}`}
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    <LinkIcon size={12} />
                                    <span>Publicado</span>
                                  </a>
                                ) : (
                                  <button
                                    onClick={() => handleCellAction(p)}
                                    disabled={!connected || rowBusy === p.sku}
                                    className={`text-[11px] font-semibold px-2 py-1 rounded-full inline-flex items-center gap-1 text-white
                                      ${
                                        published
                                          ? "bg-blue-600 hover:bg-blue-700"
                                          : "bg-amber-600 hover:bg-amber-700"
                                      }
                                      disabled:opacity-50`}
                                    title={
                                      published
                                        ? "Refrescar ML"
                                        : "Publicar en ML"
                                    }
                                  >
                                    {rowBusy === p.sku ? (
                                      <RefreshCw
                                        size={12}
                                        className="animate-spin"
                                      />
                                    ) : published ? (
                                      <Repeat size={12} />
                                    ) : (
                                      <Upload size={12} />
                                    )}
                                    <span>
                                      {published ? "Refrescar" : "Publicar"}
                                    </span>
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </td>

                    {/* Total por familia */}
                    <td className="py-4 px-4 text-center font-bold">
                      {totalFam}
                    </td>
                  </tr>
                );
              })}

              {fams.length === 0 && (
                <tr>
                  <td colSpan={3} className="text-center py-6 text-neutral-500">
                    No hay productos para mostrar.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de previsualización */}
      {showPreview && draft && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-3xl bg-white rounded-2xl shadow-xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h3 className="font-semibold">Previsualizar publicación</h3>
              <button
                onClick={() => setShowPreview(false)}
                className="p-1 rounded hover:bg-neutral-100"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Formulario */}
              <div className="space-y-3">
                <label className="text-sm text-neutral-600">Título</label>
                <input
                  className="w-full border rounded-xl p-3"
                  value={draft.title}
                  onChange={(e) =>
                    setDraft({ ...draft, title: e.target.value })
                  }
                />

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm text-neutral-600">Precio</label>
                    <input
                      className="w-full border rounded-xl p-3"
                      type="number"
                      value={draft.price}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          price: Number(e.target.value) || 0,
                        })
                      }
                    />
                  </div>
                  <div>
                    <label className="text-sm text-neutral-600">Cantidad</label>
                    <input
                      className="w-full border rounded-xl p-3"
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
                <label className="text-sm text-neutral-600">Categoría</label>
                <div className="w-full border rounded-xl p-3 bg-neutral-50">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium">
                        {draftCatName ||
                          currentProductRef.current?.categoria_nombre ||
                          "—"}
                      </div>
                      <div className="text-xs text-neutral-500">
                        {draft.category_id} · valor asignado para Mercado Libre
                      </div>
                    </div>
                    <span className="text-[11px] px-2 py-1 rounded-full bg-amber-100 text-amber-700 font-semibold">
                      Asignada automáticamente
                    </span>
                  </div>
                </div>

                {/* Guía de tallas + Talla resultante */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm text-neutral-600">
                      Guía de tallas (ML)
                    </label>
                    <select
                      className="w-full border rounded-xl p-3"
                      value={selectedGuideId}
                      onChange={async (e) => {
                        const gid = e.target.value;
                        setSelectedGuideId(gid);
                        if (gid) {
                          // usa draft?.category_id actual para evitar doble click
                          await recomputeSizeByGuide(gid, draft?.category_id);
                        }
                      }}
                    >
                      <option value="">(usar guía por categoría)</option>
                      {GUIDE_OPTIONS.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.label} · {g.id}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-neutral-500 mt-1">
                      Guía actual:{" "}
                      <strong>
                        {selectedGuideId || "(auto por categoría)"}
                      </strong>
                    </p>
                  </div>

                  <div>
                    <label className="text-sm text-neutral-600">
                      Talla a publicar
                    </label>
                    <div className="w-full border rounded-xl p-3 bg-neutral-50">
                      <span className="font-semibold">{sizeValue || "—"}</span>
                    </div>
                    <p className="text-xs text-neutral-500 mt-1">
                      Se enviará en el atributo <code>SIZE</code>.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm text-neutral-600">
                      Marca (BRAND)
                    </label>
                    <input
                      className="w-full border rounded-xl p-3"
                      value={
                        draft.attributes.find((a) => a.id === "BRAND")
                          ?.value_name || ""
                      }
                      onChange={(e) => {
                        const v = e.target.value;
                        const attrs = draft.attributes.slice();
                        const i = attrs.findIndex((a) => a.id === "BRAND");
                        if (i >= 0) attrs[i] = { id: "BRAND", value_name: v };
                        else attrs.push({ id: "BRAND", value_name: v });
                        setDraft({ ...draft, attributes: attrs });
                      }}
                    />
                  </div>
                  <div>
                    <label className="text-sm text-neutral-600">
                      Modelo (MODEL)
                    </label>
                    <input
                      className="w-full border rounded-xl p-3"
                      value={
                        draft.attributes.find((a) => a.id === "MODEL")
                          ?.value_name || ""
                      }
                      onChange={(e) => {
                        const v = e.target.value;
                        const attrs = draft.attributes.slice();
                        const i = attrs.findIndex((a) => a.id === "MODEL");
                        if (i >= 0) attrs[i] = { id: "MODEL", value_name: v };
                        else attrs.push({ id: "MODEL", value_name: v });
                        setDraft({ ...draft, attributes: attrs });
                      }}
                    />
                  </div>
                </div>

                {/* Color (COLOR) — solo si la categoría lo requiere */}
                {categoryRequiresColor(draft?.category_id || "") && (
                  <div className="relative">
                    <label className="text-sm text-neutral-600">
                      Color (COLOR)
                    </label>
                    <button
                      type="button"
                      className="w-full border rounded-xl p-3 flex items-center justify-between hover:bg-neutral-50"
                      onClick={(e) => {
                        e.preventDefault();
                        const menu = e.currentTarget
                          .nextSibling as HTMLDivElement | null;
                        if (menu) menu.classList.toggle("hidden");
                      }}
                    >
                      <span className="flex items-center gap-2">
                        {/* Swatch actual */}
                        <span
                          aria-hidden
                          className="inline-block w-4 h-4 rounded border"
                          style={{
                            background: COLOR_OPTIONS.find(
                              (c) => c.key === colorKey
                            )?.hex,
                            borderColor: COLOR_OPTIONS.find(
                              (c) => c.key === colorKey
                            )?.border
                              ? "#D1D5DB"
                              : "transparent",
                          }}
                        />
                        <span>{colorLabel}</span>
                      </span>
                      <span className="text-xs text-neutral-500">Cambiar</span>
                    </button>

                    {/* Menú desplegable */}
                    <div className="absolute z-20 mt-1 w-full bg-white border rounded-lg shadow hidden max-h-64 overflow-auto">
                      {COLOR_OPTIONS.map((opt) => (
                        <button
                          type="button"
                          key={opt.key}
                          onClick={(e) => {
                            e.preventDefault();
                            setColorKey(opt.key);
                            (
                              e.currentTarget.parentElement as HTMLDivElement
                            )?.classList.add("hidden");
                          }}
                          className="w-full text-left px-3 py-2 hover:bg-neutral-50 flex items-center gap-2"
                        >
                          <span
                            aria-hidden
                            className="inline-block w-4 h-4 rounded border"
                            style={{
                              background: opt.hex,
                              borderColor: opt.border
                                ? "#D1D5DB"
                                : "transparent",
                            }}
                          />
                          <span className="text-sm">{opt.label}</span>
                        </button>
                      ))}
                    </div>

                    <p className="text-xs text-neutral-500 mt-1">
                      Se envía como <code>COLOR</code>.
                    </p>
                  </div>
                )}

                {/* Género (ML) */}
                <div>
                  <label className="text-sm text-neutral-600">
                    Género (ML)
                  </label>
                  <select
                    className="w-full border rounded-xl p-3"
                    value={gender}
                    onChange={(e) =>
                      setGender(e.target.value as "unisex" | "male" | "female")
                    }
                  >
                    {GENDER_OPTIONS.map((opt) => (
                      <option key={opt.key} value={opt.key}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-neutral-500 mt-1">
                    Se enviará en el atributo <code>GENDER</code>.
                  </p>
                </div>
                {/* Tipo de prenda (GARMENT_TYPE) — SOLO si la categoría lo requiere */}
                {categoryRequiresGarmentType(draft?.category_id || "") && (
                  <div>
                    <label className="text-sm text-neutral-600">
                      Tipo de prenda (GARMENT_TYPE)
                    </label>
                    <input
                      className="w-full border rounded-xl p-3"
                      value={garmentType}
                      onChange={(e) => setGarmentType(e.target.value)}
                      placeholder="Chaqueta, Parka, Cazadora…"
                    />
                    <p className="text-xs text-neutral-500 mt-1">
                      Requerido en esta categoría. Se envía como{" "}
                      <code>GARMENT_TYPE</code>.
                    </p>
                  </div>
                )}

                {/* Solo mostrar si la categoría es pantalones (Jeans) */}
                {draft?.category_id === "MLC158583" && (
                  <>
                    <div>
                      <label className="text-sm text-neutral-600">
                        Tipo de pantalón (PANT_TYPE)
                      </label>
                      <select
                        className="w-full border rounded-xl p-3"
                        value={pantType}
                        onChange={(e) => setPantType(e.target.value)}
                      >
                        <option value="">Selecciona un tipo…</option>
                        {PANT_TYPE_OPTIONS.map((opt) => (
                          <option key={opt.key} value={opt.key}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                      <p className="text-xs text-neutral-500 mt-1">
                        Requerido solo en <strong>Pantalones</strong>. Se envía
                        como <code>PANT_TYPE</code>.
                      </p>
                    </div>

                    <div>
                      <label className="text-sm text-neutral-600">
                        Material principal (MAIN_MATERIAL)
                      </label>
                      <input
                        className="w-full border rounded-xl p-3"
                        value={mainMaterial}
                        onChange={(e) => setMainMaterial(e.target.value)}
                        placeholder="Algodón, Denim, Poliéster..."
                      />
                      <p className="text-xs text-neutral-500 mt-1">
                        Requerido solo en <strong>Pantalones</strong>. Se envía
                        como <code>MAIN_MATERIAL</code>.
                      </p>
                    </div>
                  </>
                )}

                {draftError && (
                  <p className="text-sm text-red-600">{draftError}</p>
                )}

                <div className="flex gap-2 pt-2">
                  <button
                    onClick={confirmPublish}
                    disabled={draftSending}
                    className="flex-1 bg-amber-600 hover:bg-amber-700 text-white py-2 rounded-lg disabled:opacity-50"
                  >
                    {draftSending ? "Publicando…" : "Publicar ahora"}
                  </button>
                  <button
                    onClick={() => setShowPreview(false)}
                    className="px-4 py-2 rounded-lg border hover:bg-neutral-50"
                  >
                    Cancelar
                  </button>
                </div>
              </div>

              {/* Vista previa + dropzone */}
              <div className="border rounded-xl p-4">
                <p className="text-xs text-neutral-500 mb-2">Imágenes</p>

                <div
                  className={`bg-neutral-100 h-40 flex items-center justify-center relative rounded-md border-2 ${
                    isDragging
                      ? "border-amber-500 border-dashed bg-amber-50"
                      : "border-transparent"
                  }`}
                  onDragEnter={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    dragCounter.current++;
                    setIsDragging(true);
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
                  }}
                  onDragLeave={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    dragCounter.current = Math.max(0, dragCounter.current - 1);
                    if (dragCounter.current === 0) setIsDragging(false);
                  }}
                  onDrop={async (e) => {
                    e.preventDefault();
                    e.stopPropagation();
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
                      setDraftError(
                        err?.message || "No se pudo cargar la imagen"
                      );
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
                    <div className="absolute inset-0 flex items-center justify-center text-sm font-medium text-amber-700">
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
                          className="h-20 w-full object-cover rounded-md border"
                        />
                        <button
                          title="Eliminar"
                          onClick={() =>
                            setDraft((d) =>
                              d
                                ? {
                                    ...d,
                                    pictures: d.pictures.filter(
                                      (_, idx) => idx !== i
                                    ),
                                  }
                                : d
                            )
                          }
                          className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition bg-white/80 rounded-full p-1 shadow"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="p-3 space-y-1 mt-4 border rounded-lg">
                  <div className="text-sm text-neutral-500">
                    {draft.category_id} · valor asignado para Mercado Libre
                  </div>
                  <div className="font-semibold">{draft.title}</div>
                  <div className="text-lg font-bold">
                    {new Intl.NumberFormat("es-CL", {
                      style: "currency",
                      currency: "CLP",
                    }).format(draft.price || 0)}
                  </div>
                  <div className="text-sm text-neutral-600">
                    Stock: {draft.available_quantity} ·{" "}
                    {draft.condition === "new" ? "Nuevo" : "Usado"}
                  </div>
                  <div className="text-xs text-neutral-500">
                    Atributos:{" "}
                    {draft.attributes
                      .map((a) => `${a.id}=${a.value_name}`)
                      .join(", ")}
                  </div>
                </div>

                <p className="text-xs text-neutral-500 mt-3">
                  El resultado final puede variar según validaciones de Mercado
                  Libre.
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
