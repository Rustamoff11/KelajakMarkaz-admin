import { useState, useEffect, useMemo } from "react";
import { supabase } from "../supabaseClient";
import AppShell from "./AppShell.jsx";
import "./Rahbarlar.css";


const EDGE_FUNCTION_NAME = "manage-users"; // <-- O'ZINGIZDAGI HAQIQIY NOMGA ALMASHTIRING

// Endi faqat shu ikki rolni qo'shish mumkin — ikkalasi ham faqat o'z tumaniga biriktiriladi,
// maktab/markaz biriktirilmaydi.
const ROLLAR = [
  { value: "direktor", label: "Direktor" },
  { value: "aparat_hodimi", label: "Aparat hodimi" },
];

const ROLE_LABEL = Object.fromEntries(ROLLAR.map((r) => [r.value, r.label]));

export default function Rahbarlar({ session, onSignOut, onNavigate }) {
  const [rahbarlar, setRahbarlar] = useState([]);
  const [tumanlar, setTumanlar] = useState([]);
  const [loading, setLoading] = useState(false); // form submit uchun
  const [listLoading, setListLoading] = useState(true); // jadval yuklanishi uchun
  const [listError, setListError] = useState(""); // jadvalni olishda xato bo'lsa
  const [deletingId, setDeletingId] = useState(null);
  const [togglingId, setTogglingId] = useState(null); // bloklash/faollashtirish holati
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [searchQuery, setSearchQuery] = useState(""); // qidiruv matni

  const [form, setForm] = useState({
    full_name: "",
    phone: "", // faqat 9 ta raqam saqlanadi, +998 prefiksisiz
    email: "",
    password: "",
    role: "direktor",
    tuman_id: "",
  });

  useEffect(() => {
    fetchRahbarlar();
    fetchTumanlar();
  }, []);

  async function fetchRahbarlar() {
    setListLoading(true);
    setListError("");

    const { data, error } = await supabase
      .from("profiles")
      .select(`
        id, full_name, phone, role, is_active,
        tumanlar:tuman_id ( name ),
        maktablar:maktab_id ( nomi )
      `)
      .order("created_at", { ascending: false });

    if (error) {
      setListError(error.message);
      setRahbarlar([]);
    } else {
      setRahbarlar(data || []);
    }
    setListLoading(false);
  }

  async function fetchTumanlar() {
    const { data } = await supabase.from("tumanlar").select("id, name").order("name");
    setTumanlar(data || []);
  }

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  // Telefon inputi: foydalanuvchi faqat 9 ta raqam kiritadi, +998 doim old qismda turadi
  function handlePhoneChange(e) {
    const digitsOnly = e.target.value.replace(/\D/g, "").slice(0, 9);
    setForm((prev) => ({ ...prev, phone: digitsOnly }));
  }

  async function callEdgeFunction(body) {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;

    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${EDGE_FUNCTION_NAME}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      }
    );

    const result = await res.json();
    if (!res.ok) throw new Error(result.error || "Xatolik yuz berdi");
    return result;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSuccess("");

    // Frontend darajasida oldindan tekshirish (backend baribir o'zi ham tekshiradi)
    if (!form.tuman_id) {
      setError("Tuman tanlanishi shart");
      return;
    }
    if (form.password.length < 8) {
      setError("Parol kamida 8 belgidan iborat bo'lishi kerak");
      return;
    }
    if (form.phone && form.phone.length !== 9) {
      setError("Telefon raqami 9 ta raqamdan iborat bo'lishi kerak");
      return;
    }

    setLoading(true);
    try {
      await callEdgeFunction({
        action: "create",
        email: form.email,
        password: form.password,
        full_name: form.full_name,
        role: form.role,
        tuman_id: form.tuman_id,
        maktab_id: null,
        phone: form.phone ? `+998${form.phone}` : null,
      });

      setSuccess("Rahbar muvaffaqiyatli qo'shildi");
      setForm({
        full_name: "",
        phone: "",
        email: "",
        password: "",
        role: "direktor",
        tuman_id: "",
      });
      fetchRahbarlar();
    } catch (err) {
      // Backend MFA talab qilsa, xabar shundan iborat bo'ladi:
      // "Bu amal uchun 2 bosqichli tasdiqlash (MFA) talab qilinadi..."
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(userId, fullName) {
    if (!window.confirm(`"${fullName}" haqiqatan ham o'chirilsinmi?`)) return;

    setError("");
    setSuccess("");
    setDeletingId(userId);
    try {
      await callEdgeFunction({ action: "delete", user_id: userId });
      setSuccess("Foydalanuvchi o'chirildi");
      fetchRahbarlar();
    } catch (err) {
      setError(err.message);
    } finally {
      setDeletingId(null);
    }
  }

  // Bloklash / faollashtirish — bazadagi is_active maydonini yangilaydi
  async function handleToggleActive(userId, fullName, currentStatus) {
    const actionLabel = currentStatus ? "bloklansinmi" : "faollashtirilsinmi";
    if (!window.confirm(`"${fullName}" ${actionLabel}?`)) return;

    setError("");
    setSuccess("");
    setTogglingId(userId);

    // Optimistik yangilash: UI darhol o'zgaradi, xato bo'lsa qaytariladi
    const nextStatus = !currentStatus;
    setRahbarlar((prev) =>
      prev.map((r) => (r.id === userId ? { ...r, is_active: nextStatus } : r))
    );

    try {
      await callEdgeFunction({
        action: "toggle_active",
        user_id: userId,
        is_active: nextStatus,
      });
      setSuccess(nextStatus ? "Foydalanuvchi faollashtirildi" : "Foydalanuvchi bloklandi");
    } catch (err) {
      // Xato bo'lsa — eski holatga qaytaramiz
      setRahbarlar((prev) =>
        prev.map((r) => (r.id === userId ? { ...r, is_active: currentStatus } : r))
      );
      setError(err.message);
    } finally {
      setTogglingId(null);
    }
  }

  // Qidiruv bo'yicha filtrlangan ro'yxat (F.I.O, telefon, tuman, lavozim)
  const filteredRahbarlar = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return rahbarlar;

    return rahbarlar.filter((r) => {
      const fullName = (r.full_name || "").toLowerCase();
      const phone = (r.phone || "").toLowerCase();
      const tuman = (r.tumanlar?.name || "").toLowerCase();
      const maktab = (r.maktablar?.nomi || "").toLowerCase();
      const roleLabel = (ROLE_LABEL[r.role] || r.role || "").toLowerCase();

      return (
        fullName.includes(q) ||
        phone.includes(q) ||
        tuman.includes(q) ||
        maktab.includes(q) ||
        roleLabel.includes(q)
      );
    });
  }, [rahbarlar, searchQuery]);

  return (
    <AppShell active="rahbarlar" onNavigate={onNavigate} onSignOut={onSignOut}>
      <div className="rahbarlar-page">
        <h2>Rahbarlar</h2>

        <form className="rahbar-form" onSubmit={handleSubmit}>
          <div className="form-row">
            <input
              name="full_name"
              placeholder="F.I.O"
              value={form.full_name}
              onChange={handleChange}
              required
            />
            <div
              className="phone-input-wrap"
              style={{
                display: "flex",
                alignItems: "center",
                border: "1px solid #ccc",
                borderRadius: 6,
                overflow: "hidden",
                flex: 1,
              }}
            >
              <span
                style={{
                  padding: "0 8px",
                  color: "#666",
                  userSelect: "none",
                  borderRight: "1px solid #ccc",
                  background: "#f5f5f5",
                  height: "100%",
                  display: "flex",
                  alignItems: "center",
                }}
              >
                +998
              </span>
              <input
                name="phone"
                type="tel"
                inputMode="numeric"
                placeholder="90 123 45 67"
                value={form.phone}
                onChange={handlePhoneChange}
                maxLength={9}
                style={{ border: "none", outline: "none", flex: 1, padding: "8px" }}
              />
            </div>
          </div>

          <div className="form-row">
            <input
              name="email"
              type="email"
              placeholder="Email (login uchun)"
              value={form.email}
              onChange={handleChange}
              required
            />
            <input
              name="password"
              type="password"
              placeholder="Parol (kamida 8 belgi)"
              value={form.password}
              onChange={handleChange}
              required
              minLength={8}
            />
          </div>

          <div className="form-row">
            <select name="role" value={form.role} onChange={handleChange}>
              {ROLLAR.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>

            <select
              name="tuman_id"
              value={form.tuman_id}
              onChange={handleChange}
              required
            >
              <option value="">Tumanni tanlang</option>
              {tumanlar.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>

          {error && <p className="form-error">{error}</p>}
          {success && <p className="form-success">{success}</p>}

          <button type="submit" disabled={loading}>
            {loading ? "Qo'shilmoqda..." : "Rahbar qo'shish"}
          </button>
        </form>

        <div className="rahbarlar-table-head">
          <h3>
            Mavjud hodimlar{" "}
            {!listLoading && !listError ? `(${filteredRahbarlar.length})` : ""}
          </h3>
          <input
            type="text"
            className="rahbarlar-search"
            placeholder="Qidirish: F.I.O, telefon, tuman, lavozim..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              padding: "8px 12px",
              border: "1px solid #ccc",
              borderRadius: 6,
              minWidth: 260,
            }}
          />
        </div>

        {listError && (
          <p className="form-error">
            Hodimlar ro'yxatini yuklashda xatolik: {listError}
          </p>
        )}

        {listLoading ? (
          <p className="rahbarlar-empty">Yuklanmoqda...</p>
        ) : rahbarlar.length === 0 && !listError ? (
          <p className="rahbarlar-empty">Hozircha bazada hodimlar mavjud emas</p>
        ) : filteredRahbarlar.length === 0 ? (
          <p className="rahbarlar-empty">Qidiruv bo'yicha hech narsa topilmadi</p>
        ) : (
          <table className="rahbarlar-table">
            <thead>
              <tr>
                <th>F.I.O</th>
                <th>Lavozim</th>
                <th>Tuman</th>
                <th>Maktab/Markaz</th>
                <th>Telefon</th>
                <th>Holati</th>
                <th></th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredRahbarlar.map((r) => {
                const isSelf = r.id === session?.user?.id;
                return (
                  <tr key={r.id}>
                    <td>{r.full_name}</td>
                    <td>{ROLE_LABEL[r.role] || r.role}</td>
                    <td>{r.tumanlar?.name || "—"}</td>
                    <td>{r.maktablar?.nomi || "—"}</td>
                    <td>{r.phone || "—"}</td>
                    <td>
                      <span className={r.is_active ? "status-active" : "status-blocked"}>
                        {r.is_active ? "Faol" : "Bloklangan"}
                      </span>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="row-toggle-btn"
                        disabled={togglingId === r.id || isSelf}
                        onClick={() => handleToggleActive(r.id, r.full_name, r.is_active)}
                      >
                        {togglingId === r.id
                          ? "..."
                          : r.is_active
                          ? "Bloklash"
                          : "Faollashtirish"}
                      </button>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="row-delete-btn"
                        disabled={deletingId === r.id || isSelf}
                        onClick={() => handleDelete(r.id, r.full_name)}
                      >
                        {deletingId === r.id ? "..." : "O'chirish"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </AppShell>
  );
}