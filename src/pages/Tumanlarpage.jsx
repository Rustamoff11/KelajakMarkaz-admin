import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  LayoutGrid,
  List,
  Filter,
  ChevronDown,
  Plus,
  Download,
  MapPin,
  Users,
  GraduationCap,
  ShieldCheck,
  UserCheck,
  Clock3,
  MoreHorizontal,
  X,
  Loader2,
} from "lucide-react";
import { supabase } from "./supabaseClient";
import "./TumanlarPage.css";

const PAGE_SIZE = 8;

const SORT_OPTIONS = [
  { key: "nomi", label: "Nomi bo'yicha" },
  { key: "oquvchilar", label: "O'quvchilar soni bo'yicha" },
  { key: "xodimlar", label: "Xodimlar soni bo'yicha" },
  { key: "sana", label: "Sana bo'yicha" },
];

/**
 * DIQQAT: `tumanlar` jadvalida holat (faol/nofaol) ustuni yo'q
 * (ARXITEKTURA.md, 3.1-bo'lim: id, name, is_shahar, created_at).
 * Shu sababli "Faol/Nofaol" belgisi shu yerda HISOBLAB chiqariladi:
 * tumanda kamida bitta faol (is_active=true) profil bo'lsa — Faol.
 * Agar buni bazada saqlab qo'yish kerak bo'lsa, `tumanlar` jadvaliga
 * `is_active boolean default true` ustuni qo'shish tavsiya etiladi.
 */

export default function TumanlarPage() {
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [rows, setRows] = useState([]); // birlashtirilgan tumanlar + hisoblangan sonlar

  const [viewMode, setViewMode] = useState("grid"); // grid | list
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState("nomi");
  const [sortOpen, setSortOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterTuri, setFilterTuri] = useState("hammasi"); // hammasi | shahar | tuman
  const [filterHolat, setFilterHolat] = useState("hammasi"); // hammasi | faol | nofaol
  const [addOpen, setAddOpen] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setErrorMsg("");
    try {
      const [tumanlarRes, oquvchilarRes, profilesRes] = await Promise.all([
        supabase.from("tumanlar").select("id, name, is_shahar, created_at"),
        supabase.from("oquvchilar").select("tuman_id"),
        supabase.from("profiles").select("tuman_id, is_active"),
      ]);

      if (tumanlarRes.error) throw tumanlarRes.error;
      if (oquvchilarRes.error) throw oquvchilarRes.error;
      if (profilesRes.error) throw profilesRes.error;

      const oquvchilarByTuman = {};
      for (const r of oquvchilarRes.data || []) {
        if (!r.tuman_id) continue;
        oquvchilarByTuman[r.tuman_id] = (oquvchilarByTuman[r.tuman_id] || 0) + 1;
      }

      const xodimlarByTuman = {};
      const faolXodimlarByTuman = {};
      for (const r of profilesRes.data || []) {
        if (!r.tuman_id) continue;
        xodimlarByTuman[r.tuman_id] = (xodimlarByTuman[r.tuman_id] || 0) + 1;
        if (r.is_active) {
          faolXodimlarByTuman[r.tuman_id] = (faolXodimlarByTuman[r.tuman_id] || 0) + 1;
        }
      }

      const merged = (tumanlarRes.data || []).map((t) => ({
        id: t.id,
        name: t.name,
        isShahar: !!t.is_shahar,
        createdAt: t.created_at,
        oquvchilar: oquvchilarByTuman[t.id] || 0,
        xodimlar: xodimlarByTuman[t.id] || 0,
        faol: (faolXodimlarByTuman[t.id] || 0) > 0,
      }));

      setRows(merged);
    } catch (err) {
      console.error(err);
      setErrorMsg(
        err?.message || "Ma'lumotlarni yuklab bo'lmadi. Internet aloqasini yoki Supabase sozlamalarini tekshiring."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ---------- Filtr + saralash ----------
  const filtered = useMemo(() => {
    let out = rows;
    if (filterTuri === "shahar") out = out.filter((r) => r.isShahar);
    if (filterTuri === "tuman") out = out.filter((r) => !r.isShahar);
    if (filterHolat === "faol") out = out.filter((r) => r.faol);
    if (filterHolat === "nofaol") out = out.filter((r) => !r.faol);
    return out;
  }, [rows, filterTuri, filterHolat]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    switch (sortKey) {
      case "oquvchilar":
        arr.sort((a, b) => b.oquvchilar - a.oquvchilar);
        break;
      case "xodimlar":
        arr.sort((a, b) => b.xodimlar - a.xodimlar);
        break;
      case "sana":
        arr.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        break;
      default:
        arr.sort((a, b) => a.name.localeCompare(b.name, "uz"));
    }
    return arr;
  }, [filtered, sortKey]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages);
  const pageRows = sorted.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [filterTuri, filterHolat, sortKey]);

  // ---------- Statistikalar ----------
  const stats = useMemo(() => {
    const jami = rows.length;
    const faol = rows.filter((r) => r.faol).length;
    const nofaol = jami - faol;
    const jamiOquvchilar = rows.reduce((s, r) => s + r.oquvchilar, 0);
    const jamiXodimlar = rows.reduce((s, r) => s + r.xodimlar, 0);
    return { jami, faol, nofaol, jamiOquvchilar, jamiXodimlar };
  }, [rows]);

  // ---------- Yangi tuman qo'shish ----------
  const handleAddTuman = async (name, isShahar) => {
    const { error } = await supabase.from("tumanlar").insert({ name, is_shahar: isShahar });
    if (error) {
      alert("Xatolik: " + error.message);
      return;
    }
    setAddOpen(false);
    fetchData();
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Ushbu tumanni o'chirishni tasdiqlaysizmi?")) return;
    const { error } = await supabase.from("tumanlar").delete().eq("id", id);
    if (error) {
      alert("Xatolik: " + error.message);
      return;
    }
    fetchData();
  };

  const handleExport = () => {
    const header = ["Nomi", "Turi", "Holat", "O'quvchilar", "Xodimlar"];
    const lines = sorted.map((r) =>
      [r.name, r.isShahar ? "Shahar" : "Tuman", r.faol ? "Faol" : "Nofaol", r.oquvchilar, r.xodimlar].join(",")
    );
    const csv = [header.join(","), ...lines].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "tumanlar.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="tm-page">
      <div className="tm-header">
        <div>
          <h1 className="tm-title">Tumanlar</h1>
          <p className="tm-breadcrumb">
            Bosh sahifa <span>›</span> Tumanlar
          </p>
        </div>
        <div className="tm-header-actions">
          <button className="tm-btn tm-btn-ghost" type="button" onClick={handleExport}>
            <Download size={16} /> Export
          </button>
          <button className="tm-btn tm-btn-primary" type="button" onClick={() => setAddOpen(true)}>
            <Plus size={16} /> Tuman qo'shish
          </button>
        </div>
      </div>

      {errorMsg && <div className="tm-error">{errorMsg}</div>}

      <div className="tm-stats">
        <StatCard icon={ShieldCheck} tone="purple" value={stats.jami} label="Jami tumanlar" sub={`+${stats.jami} bazada`} />
        <StatCard icon={UserCheck} tone="teal" value={stats.faol} label="Faol tumanlar" sub={pct(stats.faol, stats.jami)} />
        <StatCard icon={Clock3} tone="red" value={stats.nofaol} label="Nofaol tumanlar" sub={pct(stats.nofaol, stats.jami)} negative />
        <StatCard icon={GraduationCap} tone="amber" value={stats.jamiOquvchilar} label="Jami o'quvchilar" />
        <StatCard icon={Users} tone="blue" value={stats.jamiXodimlar} label="Jami xodimlar" />
      </div>

      <div className="tm-toolbar">
        <div className="tm-view-toggle">
          <button
            type="button"
            className={viewMode === "grid" ? "active" : ""}
            onClick={() => setViewMode("grid")}
            aria-label="Katakcha ko'rinish"
          >
            <LayoutGrid size={16} />
          </button>
          <button
            type="button"
            className={viewMode === "list" ? "active" : ""}
            onClick={() => setViewMode("list")}
            aria-label="Ro'yxat ko'rinishi"
          >
            <List size={16} />
          </button>
        </div>

        <p className="tm-count">Tumanlar ({sorted.length} ta)</p>

        <div className="tm-toolbar-right">
          <div className="tm-dropdown">
            <button className="tm-btn tm-btn-ghost" type="button" onClick={() => setSortOpen((v) => !v)}>
              {SORT_OPTIONS.find((o) => o.key === sortKey)?.label} <ChevronDown size={14} />
            </button>
            {sortOpen && (
              <div className="tm-dropdown-menu">
                {SORT_OPTIONS.map((o) => (
                  <button
                    key={o.key}
                    type="button"
                    className={o.key === sortKey ? "active" : ""}
                    onClick={() => {
                      setSortKey(o.key);
                      setSortOpen(false);
                    }}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="tm-dropdown">
            <button className="tm-btn tm-btn-ghost" type="button" onClick={() => setFilterOpen((v) => !v)}>
              <Filter size={14} /> Filtr
            </button>
            {filterOpen && (
              <div className="tm-dropdown-menu tm-filter-menu">
                <p className="tm-filter-label">Turi</p>
                {[
                  ["hammasi", "Hammasi"],
                  ["shahar", "Shahar"],
                  ["tuman", "Tuman"],
                ].map(([val, label]) => (
                  <button
                    key={val}
                    type="button"
                    className={filterTuri === val ? "active" : ""}
                    onClick={() => setFilterTuri(val)}
                  >
                    {label}
                  </button>
                ))}
                <p className="tm-filter-label">Holat</p>
                {[
                  ["hammasi", "Hammasi"],
                  ["faol", "Faol"],
                  ["nofaol", "Nofaol"],
                ].map(([val, label]) => (
                  <button
                    key={val}
                    type="button"
                    className={filterHolat === val ? "active" : ""}
                    onClick={() => setFilterHolat(val)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="tm-loading">
          <Loader2 className="tm-spin" size={22} /> Yuklanmoqda...
        </div>
      ) : pageRows.length === 0 ? (
        <div className="tm-empty">Hech narsa topilmadi.</div>
      ) : viewMode === "grid" ? (
        <div className="tm-grid">
          {pageRows.map((r) => (
            <TumanCard key={r.id} tuman={r} onDelete={handleDelete} />
          ))}
        </div>
      ) : (
        <TumanTable rows={pageRows} onDelete={handleDelete} />
      )}

      {totalPages > 1 && (
        <Pagination page={pageSafe} totalPages={totalPages} onChange={setPage} />
      )}

      {addOpen && <AddTumanModal onClose={() => setAddOpen(false)} onSubmit={handleAddTuman} />}
    </div>
  );
}

function pct(part, whole) {
  if (!whole) return "0%";
  return `${((part / whole) * 100).toFixed(1)}%`;
}

function StatCard({ icon: Icon, tone, value, label, sub, negative }) {
  return (
    <div className="tm-stat-card">
      <div className={`tm-stat-icon tone-${tone}`}>
        <Icon size={18} />
      </div>
      <div>
        <p className="tm-stat-value">{value.toLocaleString("uz-UZ")}</p>
        <p className="tm-stat-label">{label}</p>
        {sub && <p className={`tm-stat-sub ${negative ? "negative" : ""}`}>{sub}</p>}
      </div>
    </div>
  );
}

function TumanCard({ tuman, onDelete }) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div className="tm-card">
      <div className="tm-card-top">
        <h3>{tuman.name}</h3>
        <span className={`tm-badge ${tuman.faol ? "faol" : "nofaol"}`}>{tuman.faol ? "Faol" : "Nofaol"}</span>
      </div>
      <p className="tm-card-location">
        <MapPin size={13} /> {tuman.name} {tuman.isShahar ? "shahri" : "tumani"}
      </p>
      <div className="tm-card-metrics">
        <div>
          <span className="tm-metric-icon violet">
            <GraduationCap size={14} />
          </span>
          <div>
            <p className="tm-metric-label">O'quvchilar</p>
            <p className="tm-metric-value">{tuman.oquvchilar.toLocaleString("uz-UZ")}</p>
          </div>
        </div>
        <div>
          <span className="tm-metric-icon amber">
            <Users size={14} />
          </span>
          <div>
            <p className="tm-metric-label">Xodimlar</p>
            <p className="tm-metric-value">{tuman.xodimlar.toLocaleString("uz-UZ")}</p>
          </div>
        </div>
      </div>
      <div className="tm-card-actions">
        <button className="tm-btn tm-btn-outline" type="button">
          Batafsil
        </button>
        <div className="tm-dropdown">
          <button className="tm-btn tm-btn-icon" type="button" onClick={() => setMenuOpen((v) => !v)}>
            <MoreHorizontal size={16} />
          </button>
          {menuOpen && (
            <div className="tm-dropdown-menu tm-card-menu">
              <button type="button" onClick={() => setMenuOpen(false)}>
                Tahrirlash
              </button>
              <button
                type="button"
                className="tm-danger"
                onClick={() => {
                  setMenuOpen(false);
                  onDelete(tuman.id);
                }}
              >
                O'chirish
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TumanTable({ rows, onDelete }) {
  return (
    <div className="tm-table-wrap">
      <table className="tm-table">
        <thead>
          <tr>
            <th>Nomi</th>
            <th>Turi</th>
            <th>Holat</th>
            <th>O'quvchilar</th>
            <th>Xodimlar</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{r.name}</td>
              <td>{r.isShahar ? "Shahar" : "Tuman"}</td>
              <td>
                <span className={`tm-badge ${r.faol ? "faol" : "nofaol"}`}>{r.faol ? "Faol" : "Nofaol"}</span>
              </td>
              <td>{r.oquvchilar.toLocaleString("uz-UZ")}</td>
              <td>{r.xodimlar.toLocaleString("uz-UZ")}</td>
              <td>
                <button className="tm-btn tm-btn-outline tm-btn-sm" type="button">
                  Batafsil
                </button>
                <button
                  className="tm-btn tm-btn-icon tm-btn-sm"
                  type="button"
                  onClick={() => onDelete(r.id)}
                  aria-label="O'chirish"
                >
                  <X size={14} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Pagination({ page, totalPages, onChange }) {
  const pages = useMemo(() => {
    const arr = [];
    const start = Math.max(1, page - 2);
    const end = Math.min(totalPages, start + 4);
    for (let i = start; i <= end; i++) arr.push(i);
    return arr;
  }, [page, totalPages]);

  return (
    <div className="tm-pagination">
      <button type="button" disabled={page === 1} onClick={() => onChange(page - 1)}>
        ‹
      </button>
      {pages.map((p) => (
        <button key={p} type="button" className={p === page ? "active" : ""} onClick={() => onChange(p)}>
          {p}
        </button>
      ))}
      <button type="button" disabled={page === totalPages} onClick={() => onChange(page + 1)}>
        ›
      </button>
    </div>
  );
}

function AddTumanModal({ onClose, onSubmit }) {
  const [name, setName] = useState("");
  const [isShahar, setIsShahar] = useState(false);
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    await onSubmit(name.trim(), isShahar);
    setSaving(false);
  };

  return (
    <div className="tm-modal-overlay" onClick={onClose}>
      <div className="tm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="tm-modal-header">
          <h3>Yangi tuman qo'shish</h3>
          <button type="button" onClick={onClose} aria-label="Yopish">
            <X size={18} />
          </button>
        </div>
        <form onSubmit={submit} className="tm-modal-body">
          <label className="tm-field">
            <span>Nomi</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Masalan: Beshariq" autoFocus />
          </label>
          <label className="tm-checkbox">
            <input type="checkbox" checked={isShahar} onChange={(e) => setIsShahar(e.target.checked)} />
            <span>Shahar hisoblanadi</span>
          </label>
          <div className="tm-modal-actions">
            <button type="button" className="tm-btn tm-btn-ghost" onClick={onClose}>
              Bekor qilish
            </button>
            <button type="submit" className="tm-btn tm-btn-primary" disabled={saving}>
              {saving ? "Saqlanmoqda..." : "Saqlash"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}