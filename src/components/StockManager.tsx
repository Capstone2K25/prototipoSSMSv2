// src/components/StockManager.tsx
import { useEffect, useMemo, useRef, useState, startTransition } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  X,
  ChevronsLeft,
  ChevronLeft,
  ChevronRight,
  ChevronsRight,
} from "lucide-react";
import toast from "react-hot-toast";
import { supabase } from "../supabaseClient";
import { emitAlert } from "../state/alertsBus";

type LookupCat = { id: number; name: string };
type LookupTal = {
  id: number;
  tipo: "alfanumerica" | "numerica" | "unica";
  etiqueta: string;
  orden: number | null;
};

type Product = {
  id: number;
  name: string;
  sku: string;
  price: number;
  categoria_id: number | null;
  talla_id: number | null;
  stockb2b: number;
  stockweb: number;
  stockml: number;
};

type SortOrder = "asc" | "desc";
type Channel = "B2B" | "Web" | "ML";

type FamKey = string; // `${name}::${categoria_id}::${tipo}`
type FamRow = {
  name: string;
  categoria_id: number | null;
  tipo: "alfanumerica" | "numerica" | "unica";
  byTalla: Record<number, Product>; // talla_id -> producto
};

type EditFamilyState = {
  name: string;
  categoria_id: number | null;
  tipo: "numerica" | "alfanumerica" | "unica";

  // SKU de la familia (para nuevas tallas)
  sku: string;

  cols: {
    id: number;
    etiqueta: string;
    tipo: string;
    orden: number | null;
  }[];

  values: Record<
    number,
    {
      id?: number;
      b2b: number;
      web: number;
      ml: number;
      price: number;
    }
  >;

  // precios por canal (misma familia)
  priceb2b: number;
  priceweb: number;

  // fallback cuando se crean tallas nuevas
  basePrice: number;
};

const ALFA_ORDER = ["XS", "S", "M", "L", "XL", "2XL", "3XL"];
const FamCard = ({
  fam,
  cols,
  catById,
  totalFam,
  openEditFamily,
  getStockStatusClass,
  formatPrice,
  expandAll,
}: any) => {
  const [isOpen, setIsOpen] = useState(false);
  const toggle = () => setIsOpen(!isOpen);

  // sincroniza con el estado global
  useEffect(() => {
    setIsOpen(expandAll);
  }, [expandAll]);
  const [deleting, setDeleting] = useState(false);

  return (
    <div className="bg-white rounded-2xl shadow-sm hover:shadow-md border border-neutral-200 overflow-hidden transition flex flex-col">
      {/* Header */}
      <div className="p-4 flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="font-semibold text-neutral-900">{fam.name}</h4>
            <p className="text-xs text-neutral-500">
              {fam.categoria_id ? catById[fam.categoria_id] : "Sin categoría"} ·{" "}
              {fam.tipo === "numerica" ? "Numérica" : "Alfanumérica"}
            </p>
          </div>
          <div className="text-right">
            <div className="text-sm font-bold text-neutral-800">
              {totalFam} unidades
            </div>
            <div className="flex gap-3 mt-2 justify-end">
              {/* Editar */}
              <button
                onClick={() => openEditFamily(fam)}
                disabled={deleting}
                className="text-blue-600 hover:text-blue-800 text-xs font-semibold flex items-center gap-1"
              >
                <Pencil size={14} /> Editar
              </button>

              {/* Eliminar */}
              <button
                onClick={async () => {
                  if (
                    !confirm(
                      `¿Eliminar "${fam.name}" y todas sus tallas? Esta acción no se puede deshacer.`
                    )
                  )
                    return;

                  try {
                    setDeleting(true);

                    const items = Object.values(fam.byTalla);
                    const ids = items.map((p) => p.id);
                    const skus = items.map((p) => String(p.sku));

                    // Eliminamos en BD
                    const { error } = await supabase
                      .from("productos")
                      .delete()
                      .in("id", ids);
                    if (error) {
                      console.error(error);
                      toast.error("No se pudo eliminar el producto.");
                      return;
                    }

                    toast.success(
                      `Producto "${fam.name}" eliminado (${ids.length} talla(s)).`
                    );

                    // Recarga datos o página
                    location.reload();
                  } catch (err) {
                    console.error(err);
                    toast.error("Error al eliminar el producto.");
                  } finally {
                    setDeleting(false);
                  }
                }}
                disabled={deleting}
                className={`text-xs font-semibold flex items-center gap-1 ${
                  deleting
                    ? "text-neutral-400 cursor-not-allowed"
                    : "text-red-600 hover:text-red-800"
                }`}
              >
                {deleting ? (
                  <>
                    <span className="animate-spin border-2 border-red-600 border-t-transparent rounded-full w-3 h-3"></span>
                    <span>Eliminando…</span>
                  </>
                ) : (
                  <>
                    <Trash2 size={14} /> Eliminar
                  </>
                )}
              </button>

              {/* Expandir / colapsar */}
              <button
                onClick={toggle}
                disabled={deleting}
                className="text-neutral-600 hover:text-neutral-800 text-xs font-semibold flex items-center gap-1"
              >
                {isOpen ? "Ocultar" : "Ver"} <span>{isOpen ? "˄" : "˅"}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Expandible */}
      {isOpen && (
        <div className="px-4 pb-4 border-t border-neutral-100 text-xs overflow-x-auto">
          <div
            className="grid grid-cols-[1fr,0.6fr,0.6fr,0.6fr]
 gap-2 py-2 font-semibold text-[11px] text-neutral-500"
          >
            <div>Talla</div>
            <div className="text-center">B2B</div>
            <div className="text-center">Web</div>
            <div className="text-center">Total</div>
          </div>

          {cols.map((t: any) => {
            const p = fam.byTalla[t.id];
            if (!p) return null;
            const total = (p.stockb2b || 0) + (p.stockweb || 0);
            const cls = getStockStatusClass(total);

            return (
              <div
                key={t.id}
                className="grid grid-cols-[1fr,0.6fr,0.6fr,0.6fr]
 gap-2 items-center py-1.5 rounded-md hover:bg-neutral-50"
              >
                <div className="font-semibold text-neutral-800">
                  {t.etiqueta}
                </div>
                <div className="text-center text-[11px] font-semibold text-fuchsia-700">
                  {p.stockb2b}
                </div>
                <div className="text-center text-[11px] font-semibold text-blue-700">
                  {p.stockweb}
                </div>
                <div className={`text-center text-[11px] font-semibold ${cls}`}>
                  {total}
                </div>
              </div>
            );
          })}
          {/* FILA DE PRECIO */}
          <div className="grid grid-cols-[1fr,0.7fr,0.7fr,0.7fr] gap-2 items-center py-2 border-t mt-2">
            <div className="font-semibold text-neutral-900">Precio</div>

            {/* PRECIO B2B */}
            <div className="text-center text-[12px] font-bold text-fuchsia-700">
              {formatPrice(fam.byTalla[cols[0].id]?.priceb2b || 0)}
            </div>

            {/* PRECIO WEB */}
            <div className="text-center text-[12px] font-bold text-blue-700">
              {formatPrice(fam.byTalla[cols[0].id]?.priceweb || 0)}
            </div>

            {/* TOTAL VACÍO */}
            <div></div>
          </div>
        </div>
      )}
    </div>
  );
};

export const StockManager = () => {
  // IMÁGENES PARA MODO CREAR
  const [newProductImages, setNewProductImages] = useState<string[]>([]);

  // datos
  const [products, setProducts] = useState<Product[]>([]);
  const [totalRows, setTotalRows] = useState<number>(0);

  // lookups
  const [cats, setCats] = useState<LookupCat[]>([]);
  const [tallas, setTallas] = useState<LookupTal[]>([]);

  // filtros / búsqueda
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<"all" | number>("all");

  // paginación (sobre familias)
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);

  // estados UI
  const [loading, setLoading] = useState(true);
  const [tableBusy, setTableBusy] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<string>("");

  const [expandAll, setExpandAll] = useState<boolean>(false);

  // modal
  const [showModal, setShowModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any>(null); // modo crear
  const [editingFamily, setEditingFamily] = useState<EditFamilyState | null>(
    null
  );
  const [isExistingSKU, setIsExistingSKU] = useState<boolean>(false);

  // selección múltiple
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  // abort de requests
  const abortRef = useRef<AbortController | null>(null);

  // debounce búsqueda
  const [debouncedSearch, setDebouncedSearch] = useState(searchTerm);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchTerm.trim()), 300);
    return () => clearTimeout(t);
  }, [searchTerm]);

  const toastAndLog = (
    msg: string,
    type: "info" | "error" | "sync" = "info"
  ) => {
    if (type === "error") toast.error(msg);
    else if (type === "sync") toast.success(msg);
    else toast(msg, { icon: "ℹ️" });
    emitAlert({ type, message: msg, channel: "stock" });
  };

  // cargar lookups
  const loadLookups = async () => {
    const [{ data: dc }, { data: dt }] = await Promise.all([
      supabase
        .from("categorias")
        .select("id_categoria, nombre_categoria")
        .order("nombre_categoria", { ascending: true }),
      supabase
        .from("tallas")
        .select("id_talla, tipo, etiqueta, valor_numerico")
        .order("tipo")
        .order("valor_numerico", { ascending: true, nullsFirst: true })
        .order("etiqueta"),
    ]);
    setCats(
      (dc ?? []).map((r) => ({ id: r.id_categoria, name: r.nombre_categoria }))
    );
    setTallas(
      (dt ?? []).map((r) => ({
        id: r.id_talla,
        tipo: r.tipo,
        etiqueta: r.etiqueta,
        orden: r.valor_numerico,
      }))
    );
  };
  // Añadir talla a la izquierda
  const addTallaLeft_edit = (cols: LookupTal[]) => {
    setEditingFamily((prev) => {
      if (!prev) return prev;

      const ordered = cols.map((c) => c.etiqueta);
      const current = prev.cols.map((c) => c.etiqueta);

      const indices = current
        .map((et) => ordered.indexOf(et))
        .filter((i) => i >= 0);
      if (!indices.length) return prev;

      const minIdx = Math.min(...indices);
      if (minIdx <= 0) return prev; // ya estamos en la mínima

      const newLabel = ordered[minIdx - 1];
      if (current.includes(newLabel)) return prev;

      const tallaObj = cols.find((t) => t.etiqueta === newLabel);
      if (!tallaObj) return prev;

      return {
        ...prev,
        cols: [tallaObj, ...prev.cols],
        values: {
          ...prev.values,
          [tallaObj.id]: {
            b2b: 0,
            web: 0,
            price: prev.basePrice ?? 0,
          },
        },
      };
    });
  };

  // Añadir talla a la derecha
  const addTallaRight_edit = (cols: LookupTal[]) => {
    setEditingFamily((prev) => {
      if (!prev) return prev;

      const ordered = cols.map((c) => c.etiqueta);
      const current = prev.cols.map((c) => c.etiqueta);

      const indices = current
        .map((et) => ordered.indexOf(et))
        .filter((i) => i >= 0);
      if (!indices.length) return prev;

      const maxIdx = Math.max(...indices);
      if (maxIdx >= ordered.length - 1) return prev; // ya estamos en la máxima

      const newLabel = ordered[maxIdx + 1];
      if (current.includes(newLabel)) return prev;

      const tallaObj = cols.find((t) => t.etiqueta === newLabel);
      if (!tallaObj) return prev;

      return {
        ...prev,
        cols: [...prev.cols, tallaObj],
        values: {
          ...prev.values,
          [tallaObj.id]: {
            b2b: 0,
            web: 0,
            price: prev.basePrice ?? 0,
          },
        },
      };
    });
  };

  // Quitar talla izquierda
  const removeTallaLeft_edit = () => {
    setEditingFamily((prev) => {
      if (!prev) return prev;
      if (prev.cols.length <= 1) return prev; // nunca menos de 1 talla

      const remaining = prev.cols.slice(1);
      return {
        ...prev,
        cols: remaining,
      };
    });
  };
  // Para modo CREAR: almacenar imágenes temporales
  const [productImages, setProductImages] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);

  // Quitar talla derecha
  const removeTallaRight_edit = () => {
    setEditingFamily((prev) => {
      if (!prev) return prev;
      if (prev.cols.length <= 1) return prev;

      const remaining = prev.cols.slice(0, -1);
      return {
        ...prev,
        cols: remaining,
      };
    });
  };
  async function uploadFileToStorage(
    file: File,
    sku: string,
    index: number
  ): Promise<string> {
    const bucket = "product_images";

    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const safeSku = sku.replace(/[^a-zA-Z0-9-_]/g, "_");

    // 🔥 nombre correcto del archivo
    const fileName = `${safeSku}_${index}.${ext}`;

    // 🔥 ruta en el bucket
    const path = `${safeSku}/${fileName}`;

    const { error: upErr } = await supabase.storage
      .from(bucket)
      .upload(path, file, {
        upsert: true,
        cacheControl: "3600",
        contentType: file.type,
      });

    if (upErr) throw upErr;

    // 🔥 retornamos solo el nombre (NO URL)
    return fileName;
  }

  // diccionarios
  const catById = useMemo(
    () => Object.fromEntries(cats.map((c) => [c.id, c.name])),
    [cats]
  );
  const tallaById = useMemo(
    () =>
      Object.fromEntries(
        tallas.map((t) => [
          t.id,
          { etiqueta: t.etiqueta, tipo: t.tipo, orden: t.orden ?? null },
        ])
      ),
    [tallas]
  );

  // query productos
  const fetchProducts = async (opts?: {
    silent?: boolean;
    keepSelection?: boolean;
  }) => {
    const { silent = false, keepSelection = false } = opts || {};
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      if (!silent && products.length === 0) setLoading(true);
      setTableBusy(true);

      let query = supabase
        .from("productos")
        .select(
          "id, name, sku, price, priceb2b, priceweb, categoria_id, talla_id, stockb2b, stockweb",
          { count: "exact" }
        );

      if (categoryFilter !== "all") {
        query = query.eq("categoria_id", categoryFilter);
      }

      if (debouncedSearch) {
        const term = debouncedSearch.replace(/%/g, "").toLowerCase();
        query = query.or(`name.ilike.%${term}%,sku.ilike.%${term}%`);
      }

      query = query.order("id", { ascending: true });

      const { data, error, count } = await query;
      if (error) throw error;

      const mapped: Product[] = (data || []).map((p: any) => ({
        id: Number(p.id),
        name: p.name,
        sku: p.sku,
        price: Number(p.price) || 0,
        categoria_id: p.categoria_id ?? null,
        talla_id: p.talla_id ?? null,
        stockb2b: Number(p.stockb2b) || 0,
        stockweb: Number(p.stockweb) || 0,
        priceb2b: Number(p.priceb2b) || 0,
        priceweb: Number(p.priceweb) || 0,
      }));

      startTransition(() => {
        setProducts(mapped);
        setTotalRows(count ?? 0);
        setLastUpdate(new Date().toLocaleTimeString());
        if (!keepSelection) setSelectedIds([]);
      });
    } catch (err: any) {
      if (err?.name === "AbortError") return;
      console.error("Error al obtener productos:", err);
      toastAndLog("No se pudieron cargar productos.", "error");
    } finally {
      setLoading(false);
      setTableBusy(false);
    }
  };

  // carga inicial
  useEffect(() => {
    loadLookups();
  }, []);
  useEffect(() => {
    if (cats.length && tallas.length) fetchProducts();
    const interval = setInterval(
      () => fetchProducts({ silent: true, keepSelection: true }),
      100000
    );
    return () => {
      clearInterval(interval);
      abortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cats.length, tallas.length]);
  useEffect(() => {
    if (!showModal || isExistingSKU) return;

    const rawCatName =
      cats.find((c) => c.id === Number(editingProduct?.categoria_id))?.name ||
      "";
    const catName = rawCatName.toLowerCase().trim();

    // GORROS y ACCESORIOS = TALLA ÚNICA
    if (catName === "gorros" || catName === "accesorios") {
      setVisibleTallas(["Única"]);
      return;
    }

    // Pantalones / Shorts → primeras 4 numéricas
    if (catName === "pantalones" || catName === "shorts") {
      const numeric = tallas
        .filter((t) => t.tipo === "numerica")
        .sort((a, b) => (a.valor_numerico ?? 0) - (b.valor_numerico ?? 0))
        .map((t) => t.etiqueta);

      setVisibleTallas(numeric.slice(0, 4));
      return;
    }

    // Todas las demás categorías → alfanuméricas
    setVisibleTallas(["XS", "S", "M", "L"]);
  }, [showModal, isExistingSKU, editingProduct?.categoria_id, cats, tallas]);

  const addTallaLeft = (cols: { etiqueta: string }[]) => {
    setVisibleTallas((prev) => {
      if (!cols.length) return prev;

      const ordered = cols.map((c) => c.etiqueta);
      const current = prev.filter((et) => ordered.includes(et));
      if (!current.length) return [ordered[0]];

      const indices = current
        .map((et) => ordered.indexOf(et))
        .filter((i) => i >= 0);
      const minIdx = Math.min(...indices);

      if (minIdx <= 0) return current; // ya estamos en la mínima

      const newLabel = ordered[minIdx - 1];
      if (current.includes(newLabel)) return current;

      return [newLabel, ...current];
    });
  };

  const addTallaRight = (cols: { etiqueta: string }[]) => {
    setVisibleTallas((prev) => {
      if (!cols.length) return prev;

      const ordered = cols.map((c) => c.etiqueta);
      const current = prev.filter((et) => ordered.includes(et));
      if (!current.length) return [ordered[0]];

      const indices = current
        .map((et) => ordered.indexOf(et))
        .filter((i) => i >= 0);
      const maxIdx = Math.max(...indices);

      if (maxIdx >= ordered.length - 1) return current; // ya en la máxima

      const newLabel = ordered[maxIdx + 1];
      if (current.includes(newLabel)) return current;

      return [...current, newLabel];
    });
  };

  const removeTallaLeft = (cols: { etiqueta: string }[]) => {
    setVisibleTallas((prev) => {
      const ordered = cols.map((c) => c.etiqueta);
      const current = prev.filter((et) => ordered.includes(et));
      if (current.length <= 1) return current; // nunca menos de 1 talla

      const indices = current
        .map((et) => ordered.indexOf(et))
        .filter((i) => i >= 0);
      const minIdx = Math.min(...indices);
      const minLabel = ordered[minIdx];

      return current.filter((et) => et !== minLabel);
    });
  };

  const removeTallaRight = (cols: { etiqueta: string }[]) => {
    setVisibleTallas((prev) => {
      const ordered = cols.map((c) => c.etiqueta);
      const current = prev.filter((et) => ordered.includes(et));
      if (current.length <= 1) return current;

      const indices = current
        .map((et) => ordered.indexOf(et))
        .filter((i) => i >= 0);
      const maxIdx = Math.max(...indices);
      const maxLabel = ordered[maxIdx];

      return current.filter((et) => et !== maxLabel);
    });
  };

  // refetch en cambios de filtros
  useEffect(() => {
    setPage(1);
  }, [categoryFilter, debouncedSearch, pageSize]);
  useEffect(() => {
    fetchProducts({ silent: true });
  }, [categoryFilter, debouncedSearch]); // eslint-disable-line

  const formatPrice = (price: number) =>
    new Intl.NumberFormat("es-CL", {
      style: "currency",
      currency: "CLP",
    }).format(price);

  const getStockStatusClass = (stock: number) => {
    if (stock < 5) return "text-red-600";
    if (stock < 10) return "text-orange-600";
    return "text-green-700";
  };

  // selección por checkbox (opcional)
  const toggleSelect = (id: number) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

  // eliminar seleccionados (opcional)
  const deleteSelected = async () => {
    if (selectedIds.length === 0)
      return toast.error("No hay productos seleccionados.");
    if (!confirm(`¿Eliminar ${selectedIds.length} producto(s) en BD y Woo?`))
      return;

    const selectedProducts = products.filter((p) => selectedIds.includes(p.id));
    const skus = selectedProducts.map((p) => String(p.sku));

    const { error } = await supabase
      .from("productos")
      .delete()
      .in("id", selectedIds);
    if (error) {
      console.error(error);
      toastAndLog(
        error.message || "Error al eliminar productos en BD.",
        "error"
      );
      return;
    }
    setSelectedIds([]);
    fetchProducts({ silent: true });
  };

  // ===== Agrupación por FAMILIA (name + categoria + tipo de talla)
  const filtered = useMemo(() => {
    const term = debouncedSearch.toLowerCase();
    return products.filter((p) => {
      const matchCat =
        categoryFilter === "all" || (p.categoria_id ?? null) === categoryFilter;
      const matchText =
        !term ||
        (p.name || "").toLowerCase().includes(term) ||
        (p.sku || "").toLowerCase().includes(term);
      return matchCat && matchText;
    });
  }, [products, categoryFilter, debouncedSearch]);

  const fams = useMemo<FamRow[]>(() => {
    const map = new Map<FamKey, FamRow>();
    for (const p of filtered) {
      const t = p.talla_id ? tallaById[p.talla_id] : null;
      const tipo = (t?.tipo ?? "alfanumerica") as "alfanumerica" | "numerica";
      const key: FamKey = `${p.name}::${p.categoria_id ?? 0}::${tipo}`;
      if (!map.has(key))
        map.set(key, {
          name: p.name,
          categoria_id: p.categoria_id ?? null,
          tipo,
          byTalla: {},
        });
      if (p.talla_id) map.get(key)!.byTalla[p.talla_id] = p;
    }
    return Array.from(map.values()).sort((a, b) =>
      a.name.localeCompare(b.name)
    );
  }, [filtered, tallaById]);

  const columnsForFam = (fam: FamRow) => {
    const tallasFam = tallas.filter((t) => t.tipo === fam.tipo);
    return fam.tipo === "numerica"
      ? [...tallasFam].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
      : [...tallasFam].sort(
          (a, b) =>
            ALFA_ORDER.indexOf(a.etiqueta) - ALFA_ORDER.indexOf(b.etiqueta)
        );
  };

  // abrir modal de edición MATRIZ por familia
  const openEditFamily = (fam: FamRow) => {
    // Todas las tallas posibles para este tipo (pantalón, alfa, única, etc.)
    const allCols = columnsForFam(fam);

    // 👇 Solo las tallas que REALMENTE existen en BD para esta familia
    // Solo las tallas que realmente existen en BD
    let existingCols = allCols.filter((t) => !!fam.byTalla[t.id]);

    // 🔥 Obtener categoría correctamente
    const catName = catById[fam.categoria_id]?.toLowerCase().trim() || "";

    // Si la categoría es gorros o accesorios → usar Única
    if (catName === "gorros" || catName === "accesorios") {
      const unica = tallas.find((t) => t.tipo === "unica");
      existingCols = unica ? [unica] : [];
    }

    const values: EditFamilyState["values"] = {};

    // Tomamos cualquier producto de la familia como referencia de precios
    const firstProd = Object.values(fam.byTalla)[0];
    const basePrice = Number(firstProd?.price ?? 0);

    // Usamos los precios por canal que YA tienes en la tabla
    const priceb2b = (firstProd as any)?.priceb2b ?? basePrice;
    const priceweb = (firstProd as any)?.priceweb ?? basePrice;

    // Solo llenamos valores para tallas que existen
    existingCols.forEach((t) => {
      const p = fam.byTalla[t.id];
      values[t.id] = {
        id: p?.id,
        b2b: Number(p?.stockb2b ?? 0),
        web: Number(p?.stockweb ?? 0),
        ml: Number(p?.stockml ?? 0),
        price: Number(p?.price ?? 0),
      };
    });

    setEditingFamily({
      name: fam.name,
      categoria_id: fam.categoria_id,
      tipo: fam.tipo,
      sku: firstProd?.sku ?? "",
      cols: existingCols, // 👈 solo las tallas con producto
      values,
      basePrice,
      priceb2b: Number(priceb2b) || 0,
      priceweb: Number(priceweb) || 0,
    });

    setIsExistingSKU(true);
    setShowModal(true);
  };

  /* ========================= PAGINACIÓN SOBRE FAMILIAS ========================= */

  const totalFamilies = fams.length;
  const totalPages = Math.max(1, Math.ceil(totalFamilies / pageSize));
  const showingFrom = totalFamilies === 0 ? 0 : (page - 1) * pageSize + 1;
  const showingTo = Math.min(totalFamilies, page * pageSize);

  const pageFams = useMemo(
    () => fams.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize),
    [fams, page, pageSize]
  );

  const goFirst = () => setPage(1);
  const goPrev = () => setPage((p) => Math.max(1, p - 1));
  const goNext = () => setPage((p) => Math.min(totalPages, p + 1));
  const goLast = () => setPage(totalPages);

  const [saving, setSaving] = useState(false);

  /* ========================= GUARDAR PRODUCTO ========================= */
  // ==========================
  // SUBIR VARIAS IMÁGENES A SUPABASE
  // ==========================
  const uploadProductImages = async (sku: string, files: File[]) => {
    if (!files.length) return [];

    const uploadedUrls: string[] = [];

    for (const file of files) {
      const ext = file.name.split(".").pop();
      const filePath = `${sku}/${Date.now()}-${Math.random()
        .toString(36)
        .slice(2)}.${ext}`;

      const { data, error } = await supabase.storage
        .from("product_images")
        .upload(filePath, file, {
          cacheControl: "3600",
          upsert: false,
        });

      if (error) {
        console.error("Error al subir imagen:", error);
        continue;
      }

      const publicUrl = supabase.storage
        .from("product_images")
        .getPublicUrl(filePath).data.publicUrl;

      uploadedUrls.push(publicUrl);
    }

    return uploadedUrls;
  };

  const saveProduct = async () => {
    setSaving(true);
    try {
      /* ===================== EDITAR FAMILIA ===================== */
      if (isExistingSKU && editingFamily) {
        // 🔥 SUBIR IMAGEN ANTES DE NADA
        let uploadedImageName: string | null = null;

        if (productImages.length > 0 && editingFamily.sku) {
          try {
            const file = productImages[0];
            const fileName = await uploadFileToStorage(
              file,
              editingFamily.sku,
              1
            );

            await supabase
              .from("productos")
              .update({ image_filename: fileName })
              .eq("sku", editingFamily.sku);

            uploadedImageName = fileName;
          } catch (err) {
            console.error("Error subiendo imagen en editar:", err);
            toast.error("No se pudo subir la imagen.");
            return;
          }
        }

        // precios por canal (si no los usas aún, puedes dejar basePrice)
        const priceb2b = Math.max(
          0,
          Number(editingFamily.priceb2b || editingFamily.basePrice || 0)
        );
        const priceweb = Math.max(
          0,
          Number(editingFamily.priceweb || editingFamily.basePrice || 0)
        );
        // productos actuales en BD para esta familia
        const famProducts = products.filter(
          (p) =>
            p.name === editingFamily.name &&
            (p.categoria_id ?? null) === (editingFamily.categoria_id ?? null)
        );

        const keptTallaIds = new Set(editingFamily.cols.map((c) => c.id));

        // IDs a eliminar (tallas que ya no están en cols)
        const idsToDelete = famProducts
          .filter((p) => p.talla_id && !keptTallaIds.has(p.talla_id))
          .map((p) => p.id);

        const updates: Array<{
          id: number;
          stockb2b: number;
          stockweb: number;
          priceb2b: number;
          priceweb: number;
        }> = [];

        const creates: Array<{
          name: string;
          sku: string;
          categoria_id: number | null;
          talla_id: number;
          stockb2b: number;
          stockweb: number;
          priceb2b: number;
          priceweb: number;
        }> = [];

        // recorrer solo tallas visibles (cols)
        for (const t of editingFamily.cols) {
          const v = editingFamily.values[t.id];
          if (!v) continue;

          const b2b = Math.max(0, Number(v.b2b || 0));
          const web = Math.max(0, Number(v.web || 0));
          const total = b2b + web;

          if (v.id) {
            // update existente
            updates.push({
              id: v.id,
              stockb2b: b2b,
              stockweb: web,
              priceb2b,
              priceweb,
            });
          } else if (total > 0) {
            // crear nueva talla
            creates.push({
              name: editingFamily.name,
              sku: editingFamily.sku || "",
              categoria_id: editingFamily.categoria_id ?? null,
              talla_id: t.id,
              stockb2b: b2b,
              stockweb: web,
              priceb2b,
              priceweb,
            });
          }
        }

        /* 1) ELIMINAR TALLAS QUITADAS DEL GRID */
        if (idsToDelete.length) {
          const prodsToDelete = famProducts.filter((p) =>
            idsToDelete.includes(p.id)
          );
          const skusToDelete = prodsToDelete.map((p) => String(p.sku || ""));

          const { error: delError } = await supabase
            .from("productos")
            .delete()
            .in("id", idsToDelete);
          if (delError) {
            console.error(delError);
            toastAndLog("No se pudieron eliminar algunas tallas.", "error");
          }
        }

        /* 2) ACTUALIZAR EXISTENTES */
        if (updates.length) {
          await Promise.allSettled(
            updates.map((u) =>
              supabase
                .from("productos")
                .update({
                  stockb2b: u.stockb2b,
                  stockweb: u.stockweb,
                  priceb2b: u.priceb2b,
                  priceweb: u.priceweb,
                  price: u.priceweb, // para Woo usamos Web como base
                })
                .eq("id", u.id)
            )
          );
        }

        const msg: string[] = [];
        if (updates.length) msg.push(`Actualizadas ${updates.length}`);
        if (creates.length) msg.push(`Creadas ${creates.length}`);
        if (idsToDelete.length) msg.push(`Eliminadas ${idsToDelete.length}`);
        toastAndLog(msg.join(" · ") || "Sin cambios", "sync");
      } else {
        const name = (editingProduct?.name || "").trim();
        const categoria_id = Number(editingProduct?.categoria_id || 0) || null;
        const sku = (editingProduct?.sku || "").trim();

        if (!name || !categoria_id)
          return toast.error("Completa nombre y categoría.");
        if (!sku) return toast.error("Ingresa un SKU para la familia.");

        const matrix = editingProduct?.matrix || {};
        const priceb2b = Math.max(0, Number(editingProduct?.priceb2b || 0));
        const priceweb = Math.max(0, Number(editingProduct?.priceweb || 0));

        const rows = Object.entries(matrix)
          .map(([tId, v]: any) => {
            const b2b = Math.max(0, Number(v?.b2b || 0));
            const web = Math.max(0, Number(v?.web || 0));
            const total = b2b + web;
            if (total === 0) return null;

            // 🔥 FORZAR TALLA ÚNICA PARA GORROS Y ACCESORIOS
            let tallaId = Number(tId);
            const catNameLower = (selectedCatName || "").toLowerCase().trim();

            if (catNameLower === "accesorios" || catNameLower === "gorros") {
              const unica = tallas.find((t) => t.tipo === "unica");
              tallaId = unica?.id ?? tallaId;
            }

            return {
              name,
              sku,
              categoria_id,
              talla_id: tallaId, // ← AQUÍ VA LA TALLA CORRECTA
              stockb2b: b2b,
              stockweb: web,
              priceb2b,
              priceweb,
              price: priceweb,
            };
          })
          .filter(Boolean);

        if (!rows.length)
          return toast.error("Ingresa stock en al menos una talla.");

        // 1) SUBIR IMAGEN ANTES DE CREAR EL PRODUCTO
        let uploadedImageName: string | null = null;

        if (productImages.length > 0 && sku) {
          try {
            const file = productImages[0];
            uploadedImageName = await uploadFileToStorage(file, sku, 1);
          } catch (err) {
            console.error("Error subiendo imagen:", err);
            return toast.error("No se pudo subir la imagen.");
          }
        }

        // 2) insertar productos usando image_filename si existe
        const rowsWithImage = rows.map((r) => ({
          ...r,
          image_filename: uploadedImageName ?? null,
        }));

        const { data, error } = await supabase
          .from("productos")
          .insert(rowsWithImage)
          .select();

        if (error || !data) {
          console.error(error);
          return toastAndLog("No se pudieron crear los productos.", "error");
        }

        toastAndLog(`Creadas ${rows.length} talla(s).`, "sync");
      }
    } catch (err) {
      console.error("Error en saveProduct:", err);
      toastAndLog("Error en la operación.", "error");
    } finally {
      setSaving(false);
      setShowModal(false);
      setEditingProduct(null);
      setEditingFamily(null);
      setIsExistingSKU(false);
      fetchProducts({ silent: true });
    }
  };

  /* ========================= SELECTED CATEGORY / TALLA OPTIONS ========================= */

  const selectedCatName = useMemo(() => {
    const id = Number(editingProduct?.categoria_id || 0);
    return cats.find((c) => c.id === id)?.name || "";
  }, [editingProduct?.categoria_id, cats]);

  const tallaOptions = useMemo(() => {
    const name = (selectedCatName || "").toLowerCase().trim();
    const usaNumericas = name === "pantalones" || name === "shorts";

    return tallas
      .filter((t) =>
        usaNumericas ? t.tipo === "numerica" : t.tipo === "alfanumerica"
      )
      .sort((a, b) => {
        if (a.tipo === "numerica" && b.tipo === "numerica") {
          return (a.orden ?? 0) - (b.orden ?? 0);
        }
        return ALFA_ORDER.indexOf(a.etiqueta) - ALFA_ORDER.indexOf(b.etiqueta);
      });
  }, [tallas, selectedCatName]);

  /* ========================= TALLAS VISIBLES (DINÁMICAS) ========================= */

  /* ========================= TALLAS VISIBLES (DINÁMICAS) ========================= */

  // Se usa SOLO en modo CREAR
  const [visibleTallas, setVisibleTallas] = useState<string[]>([]);

  // Agregar una talla adicional (modo crear)
  const addNextTalla = (availableCols: any[]) => {
    const remaining = availableCols.filter(
      (t) => !visibleTallas.includes(t.etiqueta)
    );
    if (remaining.length > 0) {
      setVisibleTallas((prev) => [...prev, remaining[0].etiqueta]);
    }
  };

  // Quitar última talla visible (modo crear)
  const removeLastTalla = () => {
    if (visibleTallas.length > 4) {
      setVisibleTallas((prev) => prev.slice(0, -1));
    }
  };

  // SKU autogenerado
  const generateSKU = (name: string, categoriaId: number | string) => {
    if (!name || !categoriaId) return "";
    const clean = name.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
    const prefix = clean.substring(0, 3) || "PRD";
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `${prefix}-${categoriaId}-${random}`;
  };

  /* ========================= FUNCIONES AUXILIARES PARA EDITAR FAMILIA ========================= */

  const updateFamilyStock = (
    tId: number,
    field: "b2b" | "web",
    value: string
  ) => {
    const n = Number((value || "0").replace(/[^\d]/g, ""));

    setEditingFamily((prev) => {
      if (!prev) return prev;

      const oldVal = prev.values[tId] || {
        id: null,
        b2b: 0,
        web: 0,
        price: prev.basePrice ?? 0,
      };

      return {
        ...prev,
        values: {
          ...prev.values,
          [tId]: { ...oldVal, [field]: n },
        },
      };
    });
  };

  /* ========================= CONTROL DE TALLAS PARA EDITAR (IZQ / DER) ========================= */

  const getAllTallasForFamily = () => {
    const catName =
      catById[editingFamily?.categoria_id]?.toLowerCase().trim() || "";

    const usaNumericas = catName === "pantalones" || catName === "shorts";
    const isUnica = catName === "accesorios" || catName === "gorros";

    const filtered = tallas.filter((t) =>
      isUnica
        ? t.tipo === "unica"
        : usaNumericas
        ? t.tipo === "numerica"
        : t.tipo === "alfanumerica"
    );

    return filtered.sort((a, b) =>
      usaNumericas
        ? (a.orden ?? 0) - (b.orden ?? 0)
        : ALFA_ORDER.indexOf(a.etiqueta) - ALFA_ORDER.indexOf(b.etiqueta)
    );
  };

  const handleAddLeft = () => {
    setEditingFamily((prev) => {
      if (!prev) return prev;

      const all = getAllTallasForFamily();
      const current = prev.cols;

      const first = current[0];
      const index = all.findIndex((t) => t.id === first.id);
      if (index <= 0) return prev;

      const newTalla = all[index - 1];

      return {
        ...prev,
        cols: [newTalla, ...prev.cols],
        values: {
          ...prev.values,
          [newTalla.id]: prev.values[newTalla.id] || {
            id: null,
            b2b: 0,
            web: 0,
            price: prev.basePrice ?? 0,
          },
        },
      };
    });
  };

  const handleAddRight = () => {
    setEditingFamily((prev) => {
      if (!prev) return prev;

      const all = getAllTallasForFamily();
      const current = prev.cols;

      const last = current[current.length - 1];
      const index = all.findIndex((t) => t.id === last.id);
      if (index >= all.length - 1) return prev;

      const newTalla = all[index + 1];

      return {
        ...prev,
        cols: [...prev.cols, newTalla],
        values: {
          ...prev.values,
          [newTalla.id]: prev.values[newTalla.id] || {
            id: null,
            b2b: 0,
            web: 0,
            price: prev.basePrice ?? 0,
          },
        },
      };
    });
  };

  // Remover izquierda
  const handleRemoveLeft = () => {
    setEditingFamily((prev) => {
      if (!prev) return prev;
      if (prev.cols.length <= 1) return prev;

      return {
        ...prev,
        cols: prev.cols.slice(1),
      };
    });
  };

  // Remover derecha
  const handleRemoveRight = () => {
    setEditingFamily((prev) => {
      if (!prev) return prev;
      if (prev.cols.length <= 1) return prev;

      return {
        ...prev,
        cols: prev.cols.slice(0, -1),
      };
    });
  };

  return (
    <div className="space-y-6 transition-colors duration-300">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-neutral-900 dark:text-white">
            Gestión de Inventario
          </h2>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Última sync: {lastUpdate}{" "}
            {tableBusy && (
              <span className="ml-2 text-xs text-neutral-400 dark:text-neutral-500">
                (actualizando…)
              </span>
            )}
          </p>
        </div>

        {/* Filtros */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 w-full">
          <input
            type="text"
            placeholder="Buscar por nombre o SKU..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="border border-neutral-300 dark:border-neutral-700 rounded-lg px-3 py-2 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white placeholder-neutral-500 dark:placeholder-neutral-400 focus:ring-2 focus:ring-neutral-500 focus:outline-none"
          />
          <select
            value={categoryFilter}
            onChange={(e) =>
              setCategoryFilter(
                e.target.value === "all" ? "all" : Number(e.target.value)
              )
            }
            className="border border-neutral-300 dark:border-neutral-700 rounded-lg px-3 py-2 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white focus:ring-2 focus:ring-neutral-500 focus:outline-none"
          >
            <option value="all">Todas las categorías</option>
            {cats.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          <button
            onClick={async () => {
              const tempSku = generateSKU(
                editingProduct?.name || "",
                editingProduct?.categoria_id || ""
              );

              const { data: found } = await supabase
                .from("productos")
                .select("*")
                .eq("sku", tempSku)
                .limit(1);

              if (found && found.length > 0) {
                const prod = found[0];

                const fam = fams.find(
                  (f) =>
                    f.name === prod.name && f.categoria_id === prod.categoria_id
                );

                if (fam) {
                  openEditFamily(fam);
                  return;
                }
              }

              setEditingProduct({
                name: "",
                categoria_id: "",
                sku: tempSku,
                priceb2b: 0,
                priceweb: 0,
                matrix: undefined,
              });
              setProductImages([]);
              setImagePreviews([]);
              setVisibleTallas(["S", "M", "L", "XL"]);
              setShowModal(true);
              setIsExistingSKU(false);
            }}
            className="bg-green-600 text-white px-4 py-2 rounded"
          >
            + Agregar
          </button>
        </div>
      </div>

      {/* Acciones eliminar */}
      {selectedIds.length > 0 && (
        <div>
          <button
            onClick={deleteSelected}
            className="bg-neutral-800 hover:bg-neutral-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 shadow-sm transition-all"
          >
            <Trash2 size={16} /> Eliminar seleccionados ({selectedIds.length})
          </button>
        </div>
      )}

      {/* Vista de tarjetas expandibles */}
      <div className="bg-white dark:bg-neutral-900 rounded-xl p-6 border border-neutral-200 dark:border-neutral-700 shadow-sm transition-colors">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-3">
          <div>
            <h3 className="text-lg font-bold text-neutral-900 dark:text-white">
              Stock Madre (Inventario por familia)
            </h3>
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              Última sync: {lastUpdate}
            </p>
          </div>

          <button
            onClick={() => setExpandAll((prev) => !prev)}
            className="self-start sm:self-auto bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 border border-neutral-300 dark:border-neutral-600 text-neutral-800 dark:text-neutral-200 text-sm font-semibold px-4 py-2 rounded-lg transition-all shadow-sm"
          >
            {expandAll ? "Colapsar todas" : "Expandir todas"}
          </button>
        </div>

        {pageFams.length === 0 ? (
          <div className="text-center py-12 text-neutral-500 dark:text-neutral-400">
            No hay productos para mostrar.
          </div>
        ) : (
          <div className="flex flex-wrap gap-6">
            {pageFams.map((fam, idx) => {
              const cols = columnsForFam(fam);
              const totalFam = Object.values(fam.byTalla).reduce(
                (acc, p) => acc + (p.stockb2b || 0) + (p.stockweb || 0),
                0
              );
              const famKey = `${fam.name}-${idx}`;

              return (
                <div
                  key={famKey}
                  className="w-full md:w-[calc(50%-12px)] xl:w-[calc(33.33%-16px)]"
                >
                  <FamCard
                    key={famKey}
                    fam={fam}
                    cols={cols}
                    catById={catById}
                    totalFam={totalFam}
                    openEditFamily={openEditFamily}
                    getStockStatusClass={getStockStatusClass}
                    formatPrice={formatPrice}
                    expandAll={expandAll}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Paginación de familias */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="text-sm text-neutral-600 dark:text-neutral-400">
          Mostrando <strong>{showingFrom}</strong>–<strong>{showingTo}</strong>{" "}
          de <strong>{totalFamilies}</strong> familias
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm text-neutral-600 dark:text-neutral-400">
            Filas por página:
          </span>
          <select
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
            className="border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 rounded px-2 py-1 text-sm text-neutral-800 dark:text-neutral-200 focus:ring-2 focus:ring-neutral-500 outline-none"
          >
            {[10, 20, 30, 50, 100].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>

          <div className="flex items-center gap-1 ml-2">
            <button
              className="border border-neutral-300 dark:border-neutral-700 rounded p-1 disabled:opacity-50 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition"
              onClick={goFirst}
              disabled={page === 1}
            >
              <ChevronsLeft size={16} />
            </button>
            <button
              className="border border-neutral-300 dark:border-neutral-700 rounded p-1 disabled:opacity-50 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition"
              onClick={goPrev}
              disabled={page === 1}
            >
              <ChevronLeft size={16} />
            </button>
            <span className="mx-2 text-sm text-neutral-700 dark:text-neutral-300">
              Página <strong>{page}</strong> de <strong>{totalPages}</strong>
            </span>
            <button
              className="border border-neutral-300 dark:border-neutral-700 rounded p-1 disabled:opacity-50 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition"
              onClick={goNext}
              disabled={page === totalPages}
            >
              <ChevronRight size={16} />
            </button>
            <button
              className="border border-neutral-300 dark:border-neutral-700 rounded p-1 disabled:opacity-50 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition"
              onClick={goLast}
              disabled={page === totalPages}
            >
              <ChevronsRight size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* MODAL */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 dark:bg-black/60 flex items-center justify-center z-50 p-4 transition-colors">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-2xl shadow-2xl w-full max-w-5xl relative p-6 transition-all max-h-[90vh] overflow-y-auto">
            <button
              className="absolute top-4 right-4 text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-white transition"
              onClick={() => {
                setShowModal(false);
                setEditingProduct(null);
                setEditingFamily(null);
                setIsExistingSKU(false);
                setProductImages([]);
                setImagePreviews([]);
              }}
            >
              <X size={20} />
            </button>

            <h3 className="text-xl font-semibold mb-4 text-neutral-900 dark:text-white">
              {isExistingSKU
                ? "Editar stock por tallas"
                : "Agregar producto nuevo"}
            </h3>

            <div className="mb-3 text-xs text-neutral-500 dark:text-neutral-400">
              Edita el stock <strong>absoluto</strong> por talla y por canal.{" "}
              <strong>Los precios se manejan por canal.</strong>
            </div>
            {/* ================== MODO EDITAR ================== */}
            {isExistingSKU && editingFamily && (
              <>
                <div className="mb-2 text-sm text-neutral-700 dark:text-neutral-300">
                  <strong>Producto:</strong> {editingFamily.name}
                </div>

                <div className="mb-2 text-sm text-neutral-700 dark:text-neutral-300">
                  <strong>Categoría:</strong>{" "}
                  {editingFamily.categoria_id
                    ? catById[editingFamily.categoria_id]
                    : "—"}
                </div>

                {/* SKU en vez del precio base */}
                <div className="mb-4">
                  <label className="block text-sm text-neutral-600 dark:text-neutral-400 mb-1">
                    SKU (solo lectura)
                  </label>
                  <input
                    type="text"
                    readOnly
                    value={editingFamily.sku}
                    className="border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-300 px-3 py-2 rounded-lg w-60 font-mono"
                  />
                </div>

                <div className="grid grid-cols-3 gap-4 mt-4">
                  <div>
                    <label className="block text-sm text-neutral-600 dark:text-neutral-400 mb-1">
                      Precio B2B
                    </label>
                    <input
                      type="number"
                      value={editingFamily.priceb2b}
                      onChange={(e) =>
                        setEditingFamily((p) => ({
                          ...p,
                          priceb2b: Number(e.target.value),
                        }))
                      }
                      className="w-full border border-neutral-300 dark:border-neutral-700 rounded-lg px-3 py-2 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-sm text-neutral-600 dark:text-neutral-400 mb-1">
                      Precio Web
                    </label>
                    <input
                      type="number"
                      value={editingFamily.priceweb}
                      onChange={(e) =>
                        setEditingFamily((p) => ({
                          ...p,
                          priceweb: Number(e.target.value),
                        }))
                      }
                      className="w-full border border-neutral-300 dark:border-neutral-700 rounded-lg px-3 py-2 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white"
                    />
                  </div>
                </div>
<br></br>
                {/* BOTONES de tallas */}
                <div className="flex justify-between mb-2">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleAddLeft}
                      className="px-2 py-1 bg-neutral-200 dark:bg-neutral-700 rounded text-xs hover:bg-neutral-300 dark:hover:bg-neutral-600"
                    >
                      + izq
                    </button>
                    <button
                      type="button"
                      onClick={handleRemoveLeft}
                      className="px-2 py-1 bg-neutral-200 dark:bg-neutral-700 rounded text-xs hover:bg-neutral-300 dark:hover:bg-neutral-600"
                    >
                      − izq
                    </button>
                  </div>

                  <span className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">
                    Matriz de tallas
                  </span>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleAddRight}
                      className="px-2 py-1 bg-neutral-200 dark:bg-neutral-700 rounded text-xs hover:bg-neutral-300 dark:hover:bg-neutral-600"
                    >
                      + der
                    </button>
                    <button
                      type="button"
                      onClick={handleRemoveRight}
                      className="px-2 py-1 bg-neutral-200 dark:bg-neutral-700 rounded text-xs hover:bg-neutral-300 dark:hover:bg-neutral-600"
                    >
                      − der
                    </button>
                  </div>
                </div>

                {/* MATRIZ EDITAR */}
                <div className="overflow-x-auto" style={{ minWidth: 480 }}>
                  <div
                    className="grid gap-y-2 gap-x-2 items-center text-sm"
                    style={{
                      gridTemplateColumns: `120px repeat(${editingFamily.cols.length}, minmax(72px, 1fr))`,
                    }}
                  >
                    {/* Cabecera tallas */}
                    <div></div>
                    {editingFamily.cols.map((t) => (
                      <div
                        key={t.id}
                        className="text-center text-xs text-neutral-700 dark:text-neutral-300 font-medium"
                      >
                        {t.etiqueta}
                      </div>
                    ))}

                    {/* ===== B2B ===== */}
                    <div className="text-right pr-2">
                      <span className="px-2 py-1 rounded bg-fuchsia-100 dark:bg-fuchsia-900 text-fuchsia-700 dark:text-fuchsia-200 text-xs font-semibold">
                        B2B
                      </span>
                    </div>
                    {editingFamily.cols.map((t) => (
                      <div key={t.id} className="text-center">
                        <input
                          type="text"
                          inputMode="numeric"
                          className="w-full border border-neutral-300 dark:border-neutral-700 rounded px-2 py-1 text-center bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-200"
                          value={editingFamily.values[t.id]?.b2b ?? 0}
                          onChange={(e) =>
                            updateFamilyStock(t.id, "b2b", e.target.value)
                          }
                        />
                      </div>
                    ))}

                    {/* ===== Web ===== */}
                    <div className="text-right pr-2">
                      <span className="px-2 py-1 rounded bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-200 text-xs font-semibold">
                        Web
                      </span>
                    </div>
                    {editingFamily.cols.map((t) => (
                      <div key={t.id} className="text-center">
                        <input
                          type="text"
                          inputMode="numeric"
                          className="w-full border border-neutral-300 dark:border-neutral-700 rounded px-2 py-1 text-center bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-200"
                          value={editingFamily.values[t.id]?.web ?? 0}
                          onChange={(e) =>
                            updateFamilyStock(t.id, "web", e.target.value)
                          }
                        />
                      </div>
                    ))}

                    {/* ===== Total ===== */}
                    <div className="text-right pr-2 text-neutral-600 dark:text-neutral-400 text-xs font-semibold">
                      Total
                    </div>
                    {editingFamily.cols.map((t) => {
                      const v = editingFamily.values[t.id] || {
                        b2b: 0,
                        web: 0,
                      };
                      const total = v.b2b + v.web;
                      const cls = getStockStatusClass(total);
                      return (
                        <div key={t.id} className="text-center">
                          <span className={`font-semibold ${cls}`}>
                            {total}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <br></br>
              </>
            )}

            {/* ================== MODO CREAR ================== */}
            {!isExistingSKU && (
              <>
                {/* Nombre + Categoría */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm text-neutral-700 dark:text-neutral-300 mb-1">
                      Nombre
                    </label>
                    <input
                      type="text"
                      value={editingProduct?.name || ""}
                      onChange={(e) => {
                        const newName = e.target.value;
                        const newSku = generateSKU(
                          newName,
                          editingProduct?.categoria_id || ""
                        );
                        setEditingProduct({
                          ...editingProduct,
                          name: newName,
                          sku: newSku,
                        });
                      }}
                      className="w-full border border-neutral-300 dark:border-neutral-700 rounded-lg px-3 py-2 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white focus:ring-2 focus:ring-green-500 outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-sm text-neutral-700 dark:text-neutral-300 mb-1">
                      Categoría
                    </label>
                    <select
                      value={editingProduct?.categoria_id ?? ""}
                      onChange={(e) => {
                        const catValue = e.target.value
                          ? Number(e.target.value)
                          : "";
                        const newSku = generateSKU(
                          editingProduct?.name || "",
                          catValue
                        );

                        // 🔥 RESET COMPLETO AL CAMBIAR CATEGORÍA
                        setEditingProduct({
                          ...editingProduct,
                          categoria_id: catValue,
                          sku: newSku,
                          matrix: {}, // ← << BORRAMOS TODAS LAS TALLAS Y SUS VALORES >>
                        });

                        // 🔥 LIMPIAMOS TALLAS VISIBLES TAMBIÉN
                        setVisibleTallas([]);
                      }}
                      className="w-full border border-neutral-300 dark:border-neutral-700 rounded-lg px-3 py-2 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white focus:ring-2 focus:ring-green-500 outline-none"
                    >
                      <option value="">Seleccionar categoría</option>
                      {cats.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* SKU */}
                <div className="mt-3">
                  <label className="block text-sm text-neutral-700 dark:text-neutral-300 mb-1">
                    SKU (generado automáticamente)
                  </label>
                  <input
                    type="text"
                    readOnly
                    value={editingProduct?.sku || ""}
                    className="border border-neutral-300 dark:border-neutral-700 rounded-lg px-3 py-2 w-60 bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-400 font-mono select-all"
                  />
                  <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                    Se genera automáticamente según el nombre y la categoría.
                  </p>
                </div>

                {/* PRECIOS POR CANAL */}
                <div className="grid grid-cols-3 gap-4 mt-5">
                  {[
                    { key: "priceb2b", label: "Precio B2B" },
                    { key: "priceweb", label: "Precio Web" },
                  ].map((field) => (
                    <div key={field.key}>
                      <label className="block text-sm text-neutral-700 dark:text-neutral-300 mb-1">
                        {field.label}
                      </label>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={String(
                          (editingProduct as any)?.[field.key] ?? 0
                        )}
                        onBeforeInput={(e) => {
                          const el = e.currentTarget;
                          const s = el.selectionStart ?? el.value.length;
                          const en = el.selectionEnd ?? el.value.length;
                          const d = (e as any).data ?? "";
                          const p =
                            el.value.slice(0, s) + d + el.value.slice(en);
                          if (!/^\d*$/.test(p)) e.preventDefault();
                        }}
                        onPaste={(e) => {
                          const t = e.clipboardData.getData("text");
                          if (!/^\d*$/.test(t)) e.preventDefault();
                        }}
                        onChange={(e) =>
                          setEditingProduct((p: any) => ({
                            ...p,
                            [field.key]: Number(e.target.value || 0),
                          }))
                        }
                        className="w-full border border-neutral-300 dark:border-neutral-700 rounded-lg px-3 py-2 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white focus:ring-2 focus:ring-green-500 outline-none"
                      />
                    </div>
                  ))}
                </div>

                {/* MATRIZ CREAR */}
                <div className="mt-6 overflow-x-auto" style={{ minWidth: 480 }}>
                  {(() => {
                    const rawCatName =
                      cats.find(
                        (c) => c.id === Number(editingProduct?.categoria_id)
                      )?.name || "";
                    const catName = rawCatName.toLowerCase().trim();

                    const isUnica =
                      catName === "accesorios" || catName === "gorros";
                    const usaNumericas =
                      catName === "pantalones" || catName === "shorts";

                    const cols = tallas
                      .filter((t) =>
                        isUnica
                          ? t.tipo === "unica"
                          : usaNumericas
                          ? t.tipo === "numerica"
                          : t.tipo === "alfanumerica"
                      )
                      .sort((a, b) =>
                        usaNumericas
                          ? (a.orden ?? 0) - (b.orden ?? 0)
                          : ALFA_ORDER.indexOf(a.etiqueta) -
                            ALFA_ORDER.indexOf(b.etiqueta)
                      );

                    const visibleCols = isUnica
                      ? cols
                      : cols.filter((c) => visibleTallas.includes(c.etiqueta));

                    const setVal = (
                      tId: number,
                      field: "b2b" | "web",
                      val: string
                    ) => {
                      const n = Number((val || "0").replace(/[^\d]/g, ""));
                      setEditingProduct((p: any) => ({
                        ...p,
                        matrix: {
                          ...p.matrix,
                          [tId]: {
                            ...(p.matrix?.[tId] || { b2b: 0, web: 0 }),
                            [field]: n,
                          },
                        },
                      }));
                    };

                    const gridTemplateColumns = `120px repeat(${visibleCols.length}, minmax(72px, 1fr))`;

                    return (
                      <>
                        {!isUnica && (
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => addTallaLeft(cols)}
                                className="px-2 py-1 rounded-lg text-xs bg-neutral-200 dark:bg-neutral-700 hover:bg-neutral-300 dark:hover:bg-neutral-600"
                              >
                                + izq
                              </button>
                              <button
                                type="button"
                                onClick={() => removeTallaLeft(cols)}
                                className="px-2 py-1 rounded-lg text-xs bg-neutral-200 dark:bg-neutral-700 hover:bg-neutral-300 dark:hover:bg-neutral-600"
                              >
                                − izq
                              </button>
                            </div>

                            <span className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">
                              Matriz de tallas
                            </span>

                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => addTallaRight(cols)}
                                className="px-2 py-1 rounded-lg text-xs bg-neutral-200 dark:bg-neutral-700 hover:bg-neutral-300 dark:hover:bg-neutral-600"
                              >
                                + der
                              </button>
                              <button
                                type="button"
                                onClick={() => removeTallaRight(cols)}
                                className="px-2 py-1 rounded-lg text-xs bg-neutral-200 dark:bg-neutral-700 hover:bg-neutral-300 dark:hover:bg-neutral-600"
                              >
                                − der
                              </button>
                            </div>
                          </div>
                        )}

                        <div
                          className="grid gap-y-2 gap-x-2 items-center"
                          style={{ gridTemplateColumns }}
                        >
                          {/* Encabezados */}
                          <div></div>
                          {visibleCols.map((t) => (
                            <div
                              key={t.id}
                              className="text-center text-xs text-neutral-700 dark:text-neutral-300 font-medium"
                            >
                              {t.etiqueta}
                            </div>
                          ))}

                          {/* B2B */}
                          <div className="text-right pr-2">
                            <span className="px-2 py-1 rounded text-xs font-semibold bg-fuchsia-100 text-fuchsia-700">
                              B2B
                            </span>
                          </div>
                          {visibleCols.map((t) => (
                            <div key={t.id} className="text-center">
                              <input
                                type="text"
                                inputMode="numeric"
                                className="w-full border border-neutral-300 dark:border-neutral-700 rounded px-2 py-1 text-center bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white"
                                value={String(
                                  editingProduct?.matrix?.[t.id]?.b2b ?? 0
                                )}
                                onChange={(e) =>
                                  setVal(t.id, "b2b", e.target.value)
                                }
                              />
                            </div>
                          ))}

                          {/* Web */}
                          <div className="text-right pr-2">
                            <span className="px-2 py-1 rounded text-xs font-semibold bg-blue-100 text-blue-700">
                              Web
                            </span>
                          </div>
                          {visibleCols.map((t) => (
                            <div key={t.id} className="text-center">
                              <input
                                type="text"
                                inputMode="numeric"
                                className="w-full border border-neutral-300 dark:border-neutral-700 rounded px-2 py-1 text-center bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white"
                                value={String(
                                  editingProduct?.matrix?.[t.id]?.web ?? 0
                                )}
                                onChange={(e) =>
                                  setVal(t.id, "web", e.target.value)
                                }
                              />
                            </div>
                          ))}

                          {/* Total */}
                          <div className="text-right pr-2">
                            <span className="px-2 py-1 rounded text-xs font-semibold bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300">
                              Total
                            </span>
                          </div>
                          {visibleCols.map((t) => {
                            const v = editingProduct?.matrix?.[t.id] || {
                              b2b: 0,
                              web: 0,
                            };
                            const total = v.b2b + v.web;
                            const cls = getStockStatusClass(total);
                            return (
                              <div key={t.id} className="text-center">
                                <span className={`font-semibold ${cls}`}>
                                  {total}
                                </span>
                              </div>
                              
                            );
                          })}
                        </div>
                      </>
                    
                    );
                  })()}
                </div>
              </>
            )}
            <br></br>
            {/* === IMÁGENES DEL PRODUCTO (MULTI-IMAGEN) === */}
            <div className="border rounded-xl border-neutral-300 dark:border-neutral-700 p-4">
              <label className="block text-sm font-semibold mb-2 text-neutral-700 dark:text-neutral-300">
                Imágenes del producto
              </label>

              {/* zona de imágenes ya seleccionadas */}
              {imagePreviews.length > 0 && (
                <div className="grid grid-cols-3 gap-3 mb-3">
                  {imagePreviews.map((src, i) => (
                    <div
                      key={i}
                      className="relative w-64 h-64 rounded-lg overflow-hidden border border-neutral-300 dark:border-neutral-600 flex-shrink-0"
                    >
                      <img
                        src={src}
                        className="w-full h-full object-cover"
                        alt="preview"
                      />
                      <button
                        onClick={() => {
                          setProductImages((prev) =>
                            prev.filter((_, idx) => idx !== i)
                          );
                          setImagePreviews((prev) =>
                            prev.filter((_, idx) => idx !== i)
                          );
                        }}
                        className="absolute top-1 right-1 bg-black/60 text-white p-1 rounded"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* INPUT MULTIPLE */}
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => {
                  const files = Array.from(e.target.files || []);

                  setProductImages((prev) => [...prev, ...files]);

                  const newPreviews = files.map((file) =>
                    URL.createObjectURL(file)
                  );

                  setImagePreviews((prev) => [...prev, ...newPreviews]);
                }}
                className="w-full text-sm text-neutral-400 dark:text-neutral-500"
              />

              <p className="text-xs mt-2 text-neutral-500 dark:text-neutral-400">
                Puedes subir múltiples imágenes. Se almacenarán en Supabase al
                guardar el producto.
              </p>
            </div>

            {/* BOTONES GUARDAR/CANCELAR */}
            <div className="mt-4 flex gap-2">
              <button
                onClick={!saving ? saveProduct : undefined}
                disabled={saving}
                className={`px-4 py-2 rounded text-white flex items-center justify-center gap-2 ${
                  saving
                    ? "bg-green-400 cursor-not-allowed"
                    : "bg-green-600 hover:bg-green-700"
                }`}
              >
                {saving ? (
                  <>
                    <span className="animate-spin border-2 border-white border-t-transparent rounded-full w-4 h-4" />
                    Guardando...
                  </>
                ) : isExistingSKU ? (
                  "Guardar cambios"
                ) : (
                  "Guardar producto"
                )}
              </button>

              <button
                onClick={() => {
                  setShowModal(false);
                  setEditingProduct(null);
                  setEditingFamily(null);
                  setIsExistingSKU(false);
                  setProductImages([]);
                  setImagePreviews([]);
                }}
                className="border px-4 py-2 rounded"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
