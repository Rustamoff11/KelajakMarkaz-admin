import { useEffect, useState } from "react";
import { supabase, MANAGE_USERS_FN_URL, ALLOWED_ROLES, ROLES_WITHOUT_TUMAN } from "../supabaseClient";

const initialForm = {
  full_name: "",
  email: "",
  password: "",
  role: "markaz_hodimi",
  tuman_id: "",
  phone: "",
};

function generatePassword() {
  const chars =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  let out = "";
  for (let i = 0; i < 14; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

export default function CreateUserForm({ session }) {
  const [form, setForm] = useState(initialForm);
  const [tumanlar, setTumanlar] = useState([]);
  const [tumanlarError, setTumanlarError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  useEffect(() => {
    loadTumanlar();
  }, []);

  async function loadTumanlar() {
    const { data, error: fetchError } = await supabase
      .from("tumanlar")
      .select("id,name")
      .order("name", { ascending: true });

    if (fetchError) {
      setTumanlarError("Tumanlar ro'yxatini yuklab bo'lmadi: " + fetchError.message);
      return;
    }
    setTumanlar(data ?? []);
  }

  function update(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleGeneratePassword() {
    update("password", generatePassword());
  }

  const needsTuman = !ROLES_WITHOUT_TUMAN.includes(form.role);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setResult(null);

    if (needsTuman && !form.tuman_id) {
      setError("Tanlangan rol uchun tuman majburiy.");
      return;
    }

    setSubmitting(true);

    try {
      const res = await fetch(MANAGE_USERS_FN_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          email: form.email.trim(),
          password: form.password,
          full_name: form.full_name.trim(),
          role: form.role,
          tuman_id: needsTuman ? form.tuman_id : null,
          phone: form.phone.trim() || null,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Foydalanuvchi yaratishda xatolik yuz berdi.");
        setSubmitting(false);
        return;
      }

      setResult(data);
      setForm(initialForm);
    } catch (err) {
      setError("Tarmoq xatoligi: " + err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="panel">
      {error && <div className="alert-error">{error}</div>}
      {tumanlarError && <div className="alert-error">{tumanlarError}</div>}
      {result && (
        <div className="alert-success">
          Foydalanuvchi muvaffaqiyatli yaratildi. ID: {result.user_id}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="full_name">To'liq ism</label>
          <input
            id="full_name"
            value={form.full_name}
            onChange={(e) => update("full_name", e.target.value)}
            placeholder="Aliyev Ali Aliyevich"
            required
          />
        </div>

        <div className="panel-row">
          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={form.email}
              onChange={(e) => update("email", e.target.value)}
              placeholder="ism@example.com"
              required
            />
          </div>
          <div className="field">
            <label htmlFor="phone">Telefon (ixtiyoriy)</label>
            <input
              id="phone"
              value={form.phone}
              onChange={(e) => update("phone", e.target.value)}
              placeholder="+998 90 000 00 00"
            />
          </div>
        </div>

        <div className="field">
          <label htmlFor="password">Vaqtinchalik parol</label>
          <input
            id="password"
            value={form.password}
            onChange={(e) => update("password", e.target.value)}
            placeholder="Kamida 8 belgi"
            minLength={8}
            required
          />
          <div className="field-hint">
            <button type="button" className="btn-link" onClick={handleGeneratePassword}>
              Kuchli parol generatsiya qilish
            </button>
          </div>
        </div>

        <div className="panel-row">
          <div className="field">
            <label htmlFor="role">Rol</label>
            <select id="role" value={form.role} onChange={(e) => update("role", e.target.value)}>
              {ALLOWED_ROLES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>

          {needsTuman && (
            <div className="field">
              <label htmlFor="tuman">Tuman</label>
              <select
                id="tuman"
                value={form.tuman_id}
                onChange={(e) => update("tuman_id", e.target.value)}
                required
              >
                <option value="">Tanlang...</option>
                {tumanlar.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="panel-actions">
          <button className="btn-primary" type="submit" disabled={submitting}>
            {submitting ? "Yaratilmoqda..." : "Foydalanuvchi yaratish"}
          </button>
        </div>
      </form>
    </div>
  );
}
