import { useState, useEffect, useCallback, useRef } from "react";
import AppShell from "./AppShell";
// ⚠️ Loyihangizdagi haqiqiy yo'lga moslang (odatda lib/supabaseClient.js)
import { supabase } from "../supabaseClient";
import {
  Search,
  Plus,
  Eye,
  Pencil,
  MoreVertical,
  X,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Download,
  Users,
  ShieldCheck,
  Briefcase,
  GraduationCap,
  School,
  CheckCircle2,
  XCircle,
  RotateCcw,
  Trash2,
} from "lucide-react";
import * as XLSX from "xlsx";
import "./Foydalanuvchilar.css";

/* ------------------------------------------------------------------ */
/*  Arxitekturadagi rollar (ARXITEKTURA.md, 2-bo'lim)                  */
/* ------------------------------------------------------------------ */
const ROLE_META = {
  super_admin: { label: "Super Admin", cls: "role-admin" },
  direktor: { label: "Direktor", cls: "role-rahbar" },
  aparat_hodimi: { label: "Aparat xodimi", cls: "role-aparat" },
  markaz_hodimi: { label: "Markaz xodimi", cls: "role-markaz" },
  togarak_rahbari: { label: "To'garak rahbari", cls: "role-oqituvchi" },
  maktab_maslahatchisi: { label: "Maktab maslahatchisi", cls: "role-maslahatchi" },
  oddiy_hodim: { label: "Oddiy xodim", cls: "role-oddiy" },
};

// Yuqoridagi statistika kartalari — arxitekturadagi rollarga mos
const STAT_CARDS = [
  { key: "__total", label: "Jami foydalanuvchilar", icon: Users, accent: "stat-total" },
  { key: "direktor", label: "Markaz rahbarlari", icon: ShieldCheck, accent: "stat-rahbar" },
  { key: "aparat_hodimi", label: "Aparat xodimlari", icon: Briefcase, accent: "stat-aparat" },
  { key: "togarak_rahbari", label: "O'qituvchilar", icon: GraduationCap, accent: "stat-oqituvchi" },
  { key: "maktab_maslahatchisi", label: "Maktab maslahatchilari", icon: School, accent: "stat-maslahatchi" },
];

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];
const MANAGE_USERS_URL =
  "https://yzoavkxtburfhegmtbeb.supabase.co/functions/v1/manage-users";

function initials(name = "") {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("") || "?";
}

function timeAgo(dateStr) {
  if (!dateStr) return "—";
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "hozirgina";
  if (min < 60) return `${min} daqiqa oldin`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} soat oldin`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day} kun oldin`;
  return new Date(dateStr).toLocaleDateString("uz-UZ");
}

export default function Foydalanuvchilar({ session, onSignOut, onNavigate, active }) {
  /* ----------------------------- ma'lumotlar holati ----------------------------- */
  const [rows, setRows] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [counts, setCounts] = useState({});
  const [tumanlar, setTumanlar] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  /* ------------------------------- filtrlar ------------------------------- */
  const [roleFilter, setRoleFilter] = useState("hammasi");
  const [tumanFilter, setTumanFilter] = useState("hammasi");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const searchDebounce = useRef(null);

  /* --------------------------------- modal --------------------------------- */
  const [modal, setModal] = useState(null); // { mode: 'view'|'edit'|'create', user }
  const [menuOpenId, setMenuOpenId] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null); // user

  /* ------------------------------------------------------------------ */
  /*  Tumanlar ro'yxatini bir marta yuklash                              */
  /* ------------------------------------------------------------------ */
  useEffect(() => {
    supabase
      .from("tumanlar")
      .select("id, name")
      .order("name")
      .then(({ data, error }) => {
        if (!error) setTumanlar(data || []);
      });
  }, []);

  /* ------------------------------------------------------------------ */
  /*  Yuqori statistika kartalari — filtrlardan mustaqil, umumiy sonlar   */
  /* ------------------------------------------------------------------ */
  const loadCounts = useCallback(async () => {
    const roleKeys = STAT_CARDS.filter((c) => c.key !== "__total").map((c) => c.key);
    const [{ count: total }, ...roleCounts] = await Promise.all([
      supabase.from("profiles").select("id", { count: "exact", head: true }),
      ...roleKeys.map((role) =>
        supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", role)
      ),
    ]);
    const next = { __total: total || 0 };
    roleKeys.forEach((role, i) => {
      next[role] = roleCounts[i].count || 0;
    });
    setCounts(next);
  }, []);

  /* ------------------------------------------------------------------ */
  /*  Foydalanuvchilar jadvalini filtr/sahifa bo'yicha yuklash            */
  /* ------------------------------------------------------------------ */
  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let query = supabase
        .from("profiles")
        .select("*, tumanlar:tuman_id(name), maktablar:maktab_id(nomi)", { count: "exact" })
        .order("created_at", { ascending: false });

      if (roleFilter !== "hammasi") query = query.eq("role", roleFilter);
      if (tumanFilter !== "hammasi") query = query.eq("tuman_id", tumanFilter);
      if (search.trim()) {
        query = query.or(`full_name.ilike.%${search.trim()}%,phone.ilike.%${search.trim()}%`);
      }

      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      const { data, error, count } = await query.range(from, to);
      if (error) throw error;
      setRows(data || []);
      setTotalCount(count || 0);
    } catch (e) {
      setError(e.message || "Ma'lumotlarni yuklab bo'lmadi");
    } finally {
      setLoading(false);
    }
  }, [roleFilter, tumanFilter, search, page, pageSize]);

  useEffect(() => {
    loadCounts();
  }, [loadCounts]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  // Qidiruvni debounce qilish
  useEffect(() => {
    clearTimeout(searchDebounce.current);
    searchDebounce.current = setTimeout(() => {
      setPage(1);
      setSearch(searchInput);
    }, 400);
    return () => clearTimeout(searchDebounce.current);
  }, [searchInput]);

  const refreshAll = () => {
    loadUsers();
    loadCounts();
  };

  /* ------------------------------------------------------------------ */
  /*  Faollashtirish / Nofaol qilish (is_active)                         */
  /* ------------------------------------------------------------------ */
  const toggleActive = async (user) => {
    setMenuOpenId(null);
    const { error } = await supabase
      .from("profiles")
      .update({ is_active: !user.is_active })
      .eq("id", user.id);
    if (error) {
      alert("Xatolik: " + error.message);
      return;
    }
    refreshAll();
  };

  /* ------------------------------------------------------------------ */
  /*  O'chirish — FAQAT bitta profiles qatorini, aniq id bo'yicha.       */
  /*                                                                      */
  /*  MUHIM XAVFSIZLIK ESLATMASI:                                        */
  /*  Bu yerda ATAYLAB manage-users Edge Function'ga DELETE so'rovi       */
  /*  YUBORILMAYDI. Edge Function service_role kaliti bilan ishlaydi —   */
  /*  ya'ni RLS'ni chetlab o'tadi. Agar u yerda DELETE rejimi filtrni     */
  /*  (masalan, id kelmasa ham) to'g'ri tekshirmasa, bitta so'rov BUTUN   */
  /*  profiles jadvalini o'chirib yuborishi mumkin — aynan shu sabab      */
  /*  bilan avvalgi versiyada "bitta o'chirsam hammasi o'chib ketdi"      */
  /*  degan xato yuzaga kelgan bo'lishi katta ehtimol.                    */
  /*                                                                      */
  /*  Shu sababli bu yerda faqat oddiy Supabase client (anon/aal2 token, */
  /*  RLS himoyasi ostida) orqali, .eq("id", ...) bilan qat'iy cheklab    */
  /*  o'chiramiz — bu hech qachon bir qatordan ko'pini o'chira olmaydi.   */
  /*                                                                      */
  /*  Auth.users hisobini ham butunlay o'chirmoqchi bo'lsangiz, buni      */
  /*  faqat server tomonda, id majburiy tekshiruvi bilan (masalan:        */
  /*  if (!id) return new Response("id required", {status:400});         */
  /*  supabase.auth.admin.deleteUser(id) — .delete() emas, aynan shu      */
  /*  metod) amalga oshiring, va avval staging'da sinab ko'ring.          */
  /* ------------------------------------------------------------------ */
  const deleteUser = async (user) => {
    if (!user?.id) {
      alert("Xatolik: foydalanuvchi ID topilmadi, o'chirish bekor qilindi.");
      return;
    }
    const { data, error } = await supabase
      .from("profiles")
      .delete()
      .eq("id", user.id)
      .select("id"); // qaytgan qatorlarni tekshirish uchun

    if (error) {
      alert("O'chirishda xatolik: " + error.message);
      return;
    }
    // Xavfsizlik nazorati: aynan 1 ta qator o'chirilganini tekshiramiz
    if (!data || data.length !== 1) {
      console.warn("Kutilmagan natija: o'chirilgan qatorlar", data);
      alert(
        `Ogohlantirish: kutilganidan boshqa sondagi qator o'chirildi (${data?.length ?? 0} ta). Ma'lumotlar bazasini tekshiring.`
      );
    }
    setConfirmDelete(null);
    // Agar joriy sahifada boshqa qator qolmasa, oldingi sahifaga qaytamiz
    setPage((p) => (rows.length <= 1 && p > 1 ? p - 1 : p));
    refreshAll();
  };

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  /* ------------------------------------------------------------------ */
  /*  Excel eksport — joriy filtr bo'yicha to'liq ro'yxatni yuklab oladi */
  /* ------------------------------------------------------------------ */
  const exportExcel = async () => {
    let query = supabase
      .from("profiles")
      .select("full_name, phone, role, is_active, created_at, tumanlar:tuman_id(name), maktablar:maktab_id(nomi)")
      .order("created_at", { ascending: false });
    if (roleFilter !== "hammasi") query = query.eq("role", roleFilter);
    if (tumanFilter !== "hammasi") query = query.eq("tuman_id", tumanFilter);
    if (search.trim()) {
      query = query.or(`full_name.ilike.%${search.trim()}%,phone.ilike.%${search.trim()}%`);
    }
    const { data, error } = await query;
    if (error) {
      alert("Eksportda xatolik: " + error.message);
      return;
    }
    const sheetData = (data || []).map((u) => ({
      "F.I.Sh.": u.full_name,
      Telefon: u.phone,
      Rol: ROLE_META[u.role]?.label || u.role,
      Tuman: u.tumanlar?.name || "",
      Maktab: u.maktablar?.nomi || "",
      Holat: u.is_active ? "Faol" : "Nofaol",
      "Qo'shilgan sana": u.created_at ? new Date(u.created_at).toLocaleDateString("uz-UZ") : "",
    }));
    const ws = XLSX.utils.json_to_sheet(sheetData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Foydalanuvchilar");
    XLSX.writeFile(wb, `foydalanuvchilar_${Date.now()}.xlsx`);
  };

  /* ------------------------------------------------------------------ */
  /*  Render                                                              */
  /* ------------------------------------------------------------------ */
  return (
    <AppShell active={active || "foydalanuvchilar"} onNavigate={onNavigate} onSignOut={onSignOut}>
      <div className="km-page-header">
        <div>
          <h2>Foydalanuvchilar</h2>
          <p>Tizimdagi barcha foydalanuvchilar ro'yxati</p>
        </div>
        <button className="km-btn km-btn-primary" onClick={() => setModal({ mode: "create" })}>
          <Plus size={16} /> Foydalanuvchi qo'shish
        </button>
      </div>

      {/* --------------------------- Statistika kartalari --------------------------- */}
      <div className="km-stats-grid">
        {STAT_CARDS.map(({ key, label, icon: Icon, accent }) => (
          <div className={`km-stat-card ${accent}`} key={key}>
            <div className="km-stat-icon">
              <Icon size={20} />
            </div>
            <div>
              <div className="km-stat-value">
                {counts[key] === undefined ? <Loader2 className="km-spin" size={14} /> : counts[key]}
              </div>
              <div className="km-stat-label">{label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ------------------------------- Filtrlar ------------------------------- */}
      <div className="km-toolbar">
        <div className="km-search-box">
          <Search size={16} />
          <input
            placeholder="Ism yoki telefon bo'yicha qidirish..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>

        <select
          className="km-select"
          value={roleFilter}
          onChange={(e) => {
            setRoleFilter(e.target.value);
            setPage(1);
          }}
        >
          <option value="hammasi">Barcha rollar</option>
          {Object.entries(ROLE_META).map(([key, meta]) => (
            <option key={key} value={key}>
              {meta.label}
            </option>
          ))}
        </select>

        <select
          className="km-select"
          value={tumanFilter}
          onChange={(e) => {
            setTumanFilter(e.target.value);
            setPage(1);
          }}
        >
          <option value="hammasi">Barcha tumanlar</option>
          {tumanlar.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>

        <button className="km-btn km-btn-outline" onClick={exportExcel}>
          <Download size={16} /> Eksport (Excel)
        </button>
      </div>

      {/* --------------------------------- Jadval --------------------------------- */}
      <div className="km-table-card">
        {error && <div className="km-error-banner">{error}</div>}

        <table className="km-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Foydalanuvchi</th>
              <th>Telefon raqam</th>
              <th>Rol</th>
              <th>Tuman</th>
              <th>Qo'shilgan</th>
              <th>Holat</th>
              <th className="km-th-actions">Amallar</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="km-table-loading">
                  <Loader2 className="km-spin" size={20} /> Yuklanmoqda...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="km-table-empty">
                  Hech narsa topilmadi
                </td>
              </tr>
            ) : (
              rows.map((u, i) => (
                <tr key={u.id}>
                  <td>{(page - 1) * pageSize + i + 1}</td>
                  <td>
                    <div className="km-user-cell">
                      <div className="km-avatar">{initials(u.full_name)}</div>
                      <div>
                        <div className="km-user-name">{u.full_name}</div>
                        {u.maktablar?.nomi && (
                          <div className="km-user-sub">{u.maktablar.nomi}</div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td>{u.phone || "—"}</td>
                  <td>
                    <span className={`km-badge ${ROLE_META[u.role]?.cls || ""}`}>
                      {ROLE_META[u.role]?.label || u.role}
                    </span>
                  </td>
                  <td>{u.tumanlar?.name || "—"}</td>
                  <td>{timeAgo(u.created_at)}</td>
                  <td>
                    <span className={`km-status ${u.is_active ? "is-faol" : "is-nofaol"}`}>
                      <span className="km-status-dot" />
                      {u.is_active ? "Faol" : "Nofaol"}
                    </span>
                  </td>
                  <td className="km-actions-cell">
                    <button
                      className="km-icon-btn"
                      title="Ko'rish"
                      onClick={() => setModal({ mode: "view", user: u })}
                    >
                      <Eye size={16} />
                    </button>
                    <button
                      className="km-icon-btn"
                      title="Tahrirlash"
                      onClick={() => setModal({ mode: "edit", user: u })}
                    >
                      <Pencil size={16} />
                    </button>
                    <div className="km-menu-wrap">
                      <button
                        className="km-icon-btn"
                        title="Boshqa amallar"
                        onClick={() => setMenuOpenId(menuOpenId === u.id ? null : u.id)}
                      >
                        <MoreVertical size={16} />
                      </button>
                      {menuOpenId === u.id && (
                        <div className="km-dropdown" onMouseLeave={() => setMenuOpenId(null)}>
                          <button onClick={() => toggleActive(u)}>
                            {u.is_active ? (
                              <>
                                <XCircle size={14} /> Nofaol qilish
                              </>
                            ) : (
                              <>
                                <CheckCircle2 size={14} /> Faollashtirish
                              </>
                            )}
                          </button>
                          <button
                            className="km-dropdown-danger"
                            onClick={() => {
                              setMenuOpenId(null);
                              setConfirmDelete(u);
                            }}
                          >
                            <Trash2 size={14} /> O'chirish
                          </button>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* -------------------------------- Pagination -------------------------------- */}
        <div className="km-pagination">
          <button
            className="km-page-btn"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            <ChevronLeft size={16} />
          </button>
          <PageNumbers page={page} totalPages={totalPages} onChange={setPage} />
          <button
            className="km-page-btn"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            <ChevronRight size={16} />
          </button>

          <div className="km-page-size">
            Har sahifada:
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
            >
              {PAGE_SIZE_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {modal && (
        <UserModal
          mode={modal.mode}
          user={modal.user}
          tumanlar={tumanlar}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            refreshAll();
          }}
        />
      )}

      {confirmDelete && (
        <ConfirmDialog
          title="Foydalanuvchini o'chirish"
          message={`"${confirmDelete.full_name}" haqiqatan ham o'chirilsinmi? Bu amalni orqaga qaytarib bo'lmaydi.`}
          confirmLabel="O'chirish"
          danger
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => deleteUser(confirmDelete)}
        />
      )}
    </AppShell>
  );
}

/* ------------------------------------------------------------------ */
/*  Sahifa raqamlari (1 2 3 ... 125 uslubida)                          */
/* ------------------------------------------------------------------ */
function PageNumbers({ page, totalPages, onChange }) {
  const items = [];
  const push = (v) => items.push(v);
  const windowSize = 1;

  push(1);
  if (page - windowSize > 2) push("...");
  for (let p = Math.max(2, page - windowSize); p <= Math.min(totalPages - 1, page + windowSize); p++) {
    push(p);
  }
  if (page + windowSize < totalPages - 1) push("...");
  if (totalPages > 1) push(totalPages);

  return (
    <div className="km-page-numbers">
      {items.map((it, idx) =>
        it === "..." ? (
          <span key={`dots-${idx}`} className="km-page-dots">
            …
          </span>
        ) : (
          <button
            key={it}
            className={`km-page-btn ${it === page ? "is-active" : ""}`}
            onClick={() => onChange(it)}
          >
            {it}
          </button>
        )
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Ko'rish / Tahrirlash / Qo'shish modali                             */
/* ------------------------------------------------------------------ */
function UserModal({ mode, user, tumanlar, onClose, onSaved }) {
  const readOnly = mode === "view";
  const isCreate = mode === "create";

  const [form, setForm] = useState({
    full_name: user?.full_name || "",
    phone: user?.phone || "",
    role: user?.role || "oddiy_hodim",
    tuman_id: user?.tuman_id || "",
    maktab_id: user?.maktab_id || "",
    is_active: user?.is_active ?? true,
    password: "",
  });
  const [maktablar, setMaktablar] = useState([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  const needsTuman = form.role !== "super_admin";
  const needsMaktab = ["maktab_maslahatchisi", "oddiy_hodim"].includes(form.role);

  useEffect(() => {
    if (!form.tuman_id || !needsMaktab) {
      setMaktablar([]);
      return;
    }
    supabase
      .from("maktablar")
      .select("id, nomi")
      .eq("tuman_id", form.tuman_id)
      .order("raqami")
      .then(({ data }) => setMaktablar(data || []));
  }, [form.tuman_id, needsMaktab]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const handleSave = async () => {
    setSaving(true);
    setErr(null);
    try {
      if (isCreate) {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData?.session?.access_token;
        const res = await fetch(MANAGE_USERS_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            email: form.email,
            password: form.password,
            full_name: form.full_name,
            phone: form.phone,
            role: form.role,
            tuman_id: needsTuman ? form.tuman_id : null,
            maktab_id: needsMaktab ? form.maktab_id : null,
          }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || "Foydalanuvchi yaratilmadi");
      } else {
        const { error } = await supabase
          .from("profiles")
          .update({
            full_name: form.full_name,
            phone: form.phone,
            role: form.role,
            tuman_id: needsTuman ? form.tuman_id : null,
            maktab_id: needsMaktab ? form.maktab_id : null,
            is_active: form.is_active,
          })
          .eq("id", user.id);
        if (error) throw error;
      }
      onSaved();
    } catch (e) {
      setErr(e.message || "Xatolik yuz berdi");
    } finally {
      setSaving(false);
    }
  };

  const title = isCreate ? "Yangi foydalanuvchi" : readOnly ? "Foydalanuvchi ma'lumotlari" : "Foydalanuvchini tahrirlash";

  return (
    <div className="km-modal-overlay" onClick={onClose}>
      <div className="km-modal" onClick={(e) => e.stopPropagation()}>
        <div className="km-modal-header">
          <h3>{title}</h3>
          <button className="km-icon-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="km-modal-body">
          {err && <div className="km-error-banner">{err}</div>}

          {isCreate && (
            <div className="km-field">
              <label>Email</label>
              <input
                type="email"
                value={form.email || ""}
                onChange={set("email")}
                placeholder="foydalanuvchi@mail.uz"
              />
            </div>
          )}

          <div className="km-field">
            <label>F.I.Sh.</label>
            <input value={form.full_name} onChange={set("full_name")} disabled={readOnly} />
          </div>

          <div className="km-field">
            <label>Telefon raqam</label>
            <input value={form.phone} onChange={set("phone")} disabled={readOnly} placeholder="+998 90 123 45 67" />
          </div>

          {isCreate && (
            <div className="km-field">
              <label>Parol</label>
              <input type="password" value={form.password} onChange={set("password")} />
            </div>
          )}

          <div className="km-field">
            <label>Rol</label>
            <select value={form.role} onChange={set("role")} disabled={readOnly}>
              {Object.entries(ROLE_META).map(([key, meta]) => (
                <option key={key} value={key}>
                  {meta.label}
                </option>
              ))}
            </select>
          </div>

          {needsTuman && (
            <div className="km-field">
              <label>Tuman</label>
              <select value={form.tuman_id} onChange={set("tuman_id")} disabled={readOnly}>
                <option value="">Tanlang...</option>
                {tumanlar.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {needsMaktab && (
            <div className="km-field">
              <label>Maktab</label>
              <select value={form.maktab_id} onChange={set("maktab_id")} disabled={readOnly}>
                <option value="">Tanlang...</option>
                {maktablar.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nomi}
                  </option>
                ))}
              </select>
            </div>
          )}

          {!isCreate && (
            <div className="km-field km-field-row">
              <label>Holat</label>
              <label className="km-switch">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  disabled={readOnly}
                  onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
                />
                <span>{form.is_active ? "Faol" : "Nofaol"}</span>
              </label>
            </div>
          )}
        </div>

        {!readOnly && (
          <div className="km-modal-footer">
            <button className="km-btn km-btn-outline" onClick={onClose}>
              Bekor qilish
            </button>
            <button className="km-btn km-btn-primary" onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="km-spin" size={14} />} Saqlash
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Tasdiqlash oynasi (o'chirish uchun)                                 */
/* ------------------------------------------------------------------ */
function ConfirmDialog({ title, message, confirmLabel, danger, onCancel, onConfirm }) {
  return (
    <div className="km-modal-overlay" onClick={onCancel}>
      <div className="km-modal km-modal-sm" onClick={(e) => e.stopPropagation()}>
        <div className="km-modal-header">
          <h3>{title}</h3>
          <button className="km-icon-btn" onClick={onCancel}>
            <X size={18} />
          </button>
        </div>
        <div className="km-modal-body">
          <p className="km-confirm-text">{message}</p>
        </div>
        <div className="km-modal-footer">
          <button className="km-btn km-btn-outline" onClick={onCancel}>
            Bekor qilish
          </button>
          <button className={`km-btn ${danger ? "km-btn-danger" : "km-btn-primary"}`} onClick={onConfirm}>
            <RotateCcw size={14} style={{ display: "none" }} />
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}