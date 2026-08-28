import { useEffect, useState, useCallback } from "react";
import AppShell from "./AppShell";
// ⚠️ Loyihangizdagi haqiqiy yo'lga moslang (masalan "../lib/supabaseClient")
import { supabase } from "../supabaseClient";

/* ------------------------------------------------------------------ */
/*  Kichik yordamchi komponentlar                                      */
/* ------------------------------------------------------------------ */

function Avatar({ name, size = 40 }) {
  const initials = (name || "?")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
  return (
    <div className="km-avatar" style={{ width: size, height: size, fontSize: size * 0.4 }}>
      {initials || "?"}
    </div>
  );
}

function Banner({ type = "info", children, onClose }) {
  if (!children) return null;
  return (
    <div className={`km-banner km-banner--${type}`}>
      <span>{children}</span>
      {onClose && (
        <button className="km-banner__close" onClick={onClose} aria-label="Yopish">
          ×
        </button>
      )}
    </div>
  );
}

function summarizeAuditChange(oldData, newData) {
  if (!oldData && !newData) return "—";
  if (!oldData) return "Yangi yozuv qo'shildi";
  if (!newData) return "Yozuv o'chirildi";

  const keys = new Set([...Object.keys(oldData || {}), ...Object.keys(newData || {})]);
  const changed = [...keys].filter(
    (k) => JSON.stringify(oldData[k]) !== JSON.stringify(newData[k])
  );

  if (changed.length === 0) return "O'zgarish yo'q";

  return changed
    .slice(0, 3)
    .map((k) => `${k}: "${oldData[k] ?? "—"}" → "${newData[k] ?? "—"}"`)
    .join("; ") + (changed.length > 3 ? ` (+${changed.length - 3} ta yana)` : "");
}

function formatDateTime(value) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString("uz-UZ", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return value;
  }
}

/* ------------------------------------------------------------------ */
/*  Tab: Mening profilim                                               */
/* ------------------------------------------------------------------ */

function ProfileTab({ session }) {
  const [profile, setProfile] = useState(null);
  const [createdByName, setCreatedByName] = useState(null);
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, phone, role, created_at, created_by")
      .eq("id", session.user.id)
      .single();

    if (error) {
      setErr("Profil ma'lumotlarini yuklab bo'lmadi: " + error.message);
      setLoading(false);
      return;
    }

    setProfile(data);
    setPhone(data.phone || "");

    if (data.created_by) {
      const { data: creator } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", data.created_by)
        .single();
      setCreatedByName(creator?.full_name || null);
    } else {
      setCreatedByName(null);
    }
    setLoading(false);
  }, [session.user.id]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    setErr(null);
    const { error } = await supabase
      .from("profiles")
      .update({ phone })
      .eq("id", session.user.id);
    setSaving(false);
    if (error) {
      setErr("Saqlashda xatolik: " + error.message);
    } else {
      setMsg("Telefon raqami yangilandi.");
      setProfile((p) => ({ ...p, phone }));
    }
  }

  if (loading) return <div className="km-loading">Yuklanmoqda...</div>;
  if (!profile) return <Banner type="error">{err || "Profil topilmadi."}</Banner>;

  return (
    <div className="km-settings-panel">
      <div className="km-profile-head">
        <Avatar name={profile.full_name} size={64} />
        <div>
          <h3 className="km-profile-name">{profile.full_name || "—"}</h3>
          <span className="km-role-badge">{profile.role}</span>
        </div>
      </div>

      <Banner type="success" onClose={() => setMsg(null)}>{msg}</Banner>
      <Banner type="error" onClose={() => setErr(null)}>{err}</Banner>

      <form className="km-form-grid" onSubmit={handleSave}>
        <div className="km-field">
          <label>F.I.Sh.</label>
          <input value={profile.full_name || ""} disabled />
        </div>

        <div className="km-field">
          <label>Telefon raqami</label>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+998 90 123 45 67"
          />
        </div>

        <div className="km-field">
          <label>Yaratilgan sana</label>
          <input value={formatDateTime(profile.created_at)} disabled />
        </div>

        <div className="km-field">
          <label>Kim tomonidan yaratilgan</label>
          <input value={createdByName || "—"} disabled />
        </div>

        <div className="km-form-actions">
          <button type="submit" className="km-btn km-btn--primary" disabled={saving}>
            {saving ? "Saqlanmoqda..." : "Saqlash"}
          </button>
        </div>
      </form>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Tab: Xavfsizlik (parol + MFA/TOTP)                                 */
/* ------------------------------------------------------------------ */

function SecurityTab() {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMsg, setPwMsg] = useState(null);
  const [pwErr, setPwErr] = useState(null);

  const [factors, setFactors] = useState([]);
  const [loadingFactors, setLoadingFactors] = useState(true);
  const [enrolling, setEnrolling] = useState(false);
  const [enrollData, setEnrollData] = useState(null); // { factorId, qrSvg, secret }
  const [verifyCode, setVerifyCode] = useState("");
  const [mfaErr, setMfaErr] = useState(null);
  const [mfaMsg, setMfaMsg] = useState(null);

  const loadFactors = useCallback(async () => {
    setLoadingFactors(true);
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (!error) setFactors(data?.totp || []);
    setLoadingFactors(false);
  }, []);

  useEffect(() => {
    loadFactors();
  }, [loadFactors]);

  async function handlePasswordChange(e) {
    e.preventDefault();
    setPwMsg(null);
    setPwErr(null);

    if (newPassword.length < 8) {
      setPwErr("Parol kamida 8 belgidan iborat bo'lishi kerak.");
      return;
    }
    const hasLower = /[a-z]/.test(newPassword);
    const hasUpper = /[A-Z]/.test(newPassword);
    const hasDigit = /[0-9]/.test(newPassword);
    const hasSpecial = /[!@#$%^&*()_+\-=[\]{};':"|<>?,./`~]/.test(newPassword);
    if (!hasLower || !hasUpper || !hasDigit || !hasSpecial) {
      setPwErr(
        "Parolda kamida bittadan: kichik harf, katta harf, raqam va maxsus belgi (masalan !@#$%) bo'lishi kerak."
      );
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwErr("Parollar mos kelmadi.");
      return;
    }
    setPwSaving(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setPwSaving(false);
    if (error) {
      setPwErr("Xatolik: " + error.message);
    } else {
      setPwMsg("Parol muvaffaqiyatli almashtirildi.");
      setNewPassword("");
      setConfirmPassword("");
    }
  }

  async function startEnroll() {
    setMfaErr(null);
    setMfaMsg(null);
    setEnrolling(true);
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp" });
    if (error) {
      setMfaErr("Xatolik: " + error.message);
      setEnrolling(false);
      return;
    }
    setEnrollData({
      factorId: data.id,
      qrSvg: data.totp.qr_code,
      secret: data.totp.secret,
    });
  }

  async function confirmEnroll(e) {
    e.preventDefault();
    setMfaErr(null);
    if (!enrollData) return;
    const { data: challenge, error: challengeErr } = await supabase.auth.mfa.challenge({
      factorId: enrollData.factorId,
    });
    if (challengeErr) {
      setMfaErr("Xatolik: " + challengeErr.message);
      return;
    }
    const { error: verifyErr } = await supabase.auth.mfa.verify({
      factorId: enrollData.factorId,
      challengeId: challenge.id,
      code: verifyCode,
    });
    if (verifyErr) {
      setMfaErr("Kod noto'g'ri: " + verifyErr.message);
      return;
    }
    setMfaMsg("Yangi TOTP qurilma qo'shildi.");
    setEnrolling(false);
    setEnrollData(null);
    setVerifyCode("");
    loadFactors();
  }

  function cancelEnroll() {
    setEnrolling(false);
    setEnrollData(null);
    setVerifyCode("");
    setMfaErr(null);
  }

  async function removeFactor(factorId) {
    if (!window.confirm("Ushbu MFA qurilmasini o'chirmoqchimisiz?")) return;
    setMfaErr(null);
    const { error } = await supabase.auth.mfa.unenroll({ factorId });
    if (error) {
      setMfaErr("O'chirishda xatolik: " + error.message);
    } else {
      setMfaMsg("Qurilma o'chirildi.");
      loadFactors();
    }
  }

  return (
    <div className="km-settings-panel">
      {/* Parol */}
      <section className="km-subsection">
        <h4>Parolni almashtirish</h4>
        <Banner type="success" onClose={() => setPwMsg(null)}>{pwMsg}</Banner>
        <Banner type="error" onClose={() => setPwErr(null)}>{pwErr}</Banner>
        <form className="km-form-grid" onSubmit={handlePasswordChange}>
          <div className="km-field">
            <label>Yangi parol</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Kamida 8 belgi"
            />
            <span className="km-field-hint">
              Kichik va katta harf, raqam va maxsus belgi (!@#$%...) bo'lishi shart.
            </span>
          </div>
          <div className="km-field">
            <label>Parolni tasdiqlang</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </div>
          <div className="km-form-actions">
            <button type="submit" className="km-btn km-btn--primary" disabled={pwSaving}>
              {pwSaving ? "Saqlanmoqda..." : "Parolni yangilash"}
            </button>
          </div>
        </form>
      </section>

      <div className="km-divider" />

      {/* MFA */}
      <section className="km-subsection">
        <div className="km-subsection__head">
          <h4>MFA / TOTP qurilmalar</h4>
          {!enrolling && (
            <button className="km-btn km-btn--outline" onClick={startEnroll}>
              + Yangi qurilma qo'shish
            </button>
          )}
        </div>

        <Banner type="success" onClose={() => setMfaMsg(null)}>{mfaMsg}</Banner>
        <Banner type="error" onClose={() => setMfaErr(null)}>{mfaErr}</Banner>

        {enrolling && enrollData && (
          <div className="km-mfa-enroll">
            <div className="km-mfa-enroll__qr" dangerouslySetInnerHTML={{ __html: enrollData.qrSvg }} />
            <div className="km-mfa-enroll__side">
              <p>
                Google Authenticator yoki boshqa TOTP ilovasi bilan QR kodni skanerlang, keyin
                ilovada chiqqan 6 xonali kodni kiriting.
              </p>
              <p className="km-mfa-secret">Qo'lda kiritish uchun kalit: <code>{enrollData.secret}</code></p>
              <form className="km-mfa-verify-form" onSubmit={confirmEnroll}>
                <input
                  value={verifyCode}
                  onChange={(e) => setVerifyCode(e.target.value)}
                  placeholder="6 xonali kod"
                  maxLength={6}
                />
                <button type="submit" className="km-btn km-btn--primary">Tasdiqlash</button>
                <button type="button" className="km-btn km-btn--ghost" onClick={cancelEnroll}>
                  Bekor qilish
                </button>
              </form>
            </div>
          </div>
        )}

        {loadingFactors ? (
          <div className="km-loading">Yuklanmoqda...</div>
        ) : factors.length === 0 ? (
          <p className="km-empty-hint">Hozircha hech qanday MFA qurilma ulanmagan.</p>
        ) : (
          <ul className="km-mfa-list">
            {factors.map((f) => (
              <li key={f.id} className="km-mfa-item">
                <div>
                  <strong>{f.friendly_name || "TOTP qurilma"}</strong>
                  <span className={`km-status-dot km-status-dot--${f.status}`}>{f.status}</span>
                  <div className="km-mfa-item__meta">Qo'shilgan: {formatDateTime(f.created_at)}</div>
                </div>
                <button className="km-btn km-btn--danger-outline" onClick={() => removeFactor(f.id)}>
                  O'chirish
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Tab: Super adminlar ro'yxati                                       */
/* ------------------------------------------------------------------ */

function SuperAdminsTab() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, phone, created_at")
        .eq("role", "super_admin")
        .order("created_at", { ascending: true });
      if (error) setErr(error.message);
      else setList(data || []);
      setLoading(false);
    })();
  }, []);

  if (loading) return <div className="km-loading">Yuklanmoqda...</div>;
  if (err) return <Banner type="error">{err}</Banner>;

  return (
    <div className="km-settings-panel">
      <p className="km-panel-hint">
        Tizimda <strong>{list.length}</strong> ta super_admin mavjud. Ehtiyot bo'ling — o'zingizni
        yoki boshqa yagona super_adminni tasodifan o'chirib qo'ymang.
      </p>
      <div className="km-table-wrap">
        <table className="km-table">
          <thead>
            <tr>
              <th>F.I.Sh.</th>
              <th>Telefon</th>
              <th>Qo'shilgan sana</th>
            </tr>
          </thead>
          <tbody>
            {list.map((u) => (
              <tr key={u.id}>
                <td>
                  <div className="km-table-user">
                    <Avatar name={u.full_name} size={28} />
                    <span>{u.full_name || "—"}</span>
                  </div>
                </td>
                <td>{u.phone || "—"}</td>
                <td>{formatDateTime(u.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Tab: Audit log                                                     */
/* ------------------------------------------------------------------ */

function buildAuditQuery(filters) {
  let q = supabase
    .from("audit_log")
    .select("id, action, table_name, record_id, old_data, new_data, created_at, actor_id", {
      count: "exact",
    })
    .order("created_at", { ascending: false });

  if (filters.dateFrom) q = q.gte("created_at", `${filters.dateFrom}T00:00:00`);
  if (filters.dateTo) q = q.lte("created_at", `${filters.dateTo}T23:59:59`);
  if (filters.actorId) q = q.eq("actor_id", filters.actorId);
  if (filters.action) q = q.ilike("action", `%${filters.action}%`);

  return q;
}

function csvEscape(value) {
  const s = value === null || value === undefined ? "" : String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function downloadCsv(filename, rows) {
  const header = ["Sana/vaqt", "Foydalanuvchi", "Amal", "Jadval", "Yozuv ID", "O'zgarish"];
  const lines = [header.map(csvEscape).join(",")];
  for (const r of rows) {
    lines.push(
      [
        formatDateTime(r.created_at),
        r.actor?.full_name || "",
        r.action || "",
        r.table_name || "",
        r.record_id || "",
        summarizeAuditChange(r.old_data, r.new_data),
      ]
        .map(csvEscape)
        .join(",")
    );
  }
  // Excel'da o'zbek/kirill belgilar to'g'ri ko'rinishi uchun BOM qo'shiladi
  const blob = new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function attachActorNames(rows) {
  const actorIds = [...new Set((rows || []).map((r) => r.actor_id).filter(Boolean))];
  let namesById = {};
  if (actorIds.length > 0) {
    const { data: actors } = await supabase.from("profiles").select("id, full_name").in("id", actorIds);
    namesById = Object.fromEntries((actors || []).map((a) => [a.id, a.full_name]));
  }
  return (rows || []).map((r) => ({ ...r, actor: { full_name: namesById[r.actor_id] || null } }));
}

function AuditLogTab() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [totalCount, setTotalCount] = useState(null);
  const PAGE_SIZE = 25;
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  const [actorOptions, setActorOptions] = useState([]);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [actorId, setActorId] = useState("");
  const [actionText, setActionText] = useState("");
  const [appliedFilters, setAppliedFilters] = useState({});
  const [exporting, setExporting] = useState(false);

  // Filter uchun foydalanuvchilar ro'yxati
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name")
        .order("full_name", { ascending: true });
      setActorOptions(data || []);
    })();
  }, []);

  const load = useCallback(async (pageIndex, filters) => {
    setLoading(true);
    setErr(null);
    const from = pageIndex * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    // ⚠️ FK embedding audit_log.actor_id da haqiqiy FOREIGN KEY talab qiladi,
    // shuning uchun ismlar qo'lda (manual) join qilinadi.
    const { data: rows, error, count } = await buildAuditQuery(filters).range(from, to);

    if (error) {
      setErr(error.message);
      setLoading(false);
      return;
    }

    const merged = await attachActorNames(rows);
    setLogs(merged);
    setTotalCount(count ?? null);
    setHasMore((rows || []).length === PAGE_SIZE);
    setLoading(false);
  }, []);

  useEffect(() => {
    load(page, appliedFilters);
  }, [page, appliedFilters, load]);

  function applyFilters(e) {
    e.preventDefault();
    setPage(0);
    setAppliedFilters({ dateFrom, dateTo, actorId, action: actionText });
  }

  function resetFilters() {
    setDateFrom("");
    setDateTo("");
    setActorId("");
    setActionText("");
    setPage(0);
    setAppliedFilters({});
  }

  async function handleExportCsv() {
    setExporting(true);
    setErr(null);
    const MAX_ROWS = 5000;
    const { data: rows, error } = await buildAuditQuery(appliedFilters)
      .range(0, MAX_ROWS - 1);
    setExporting(false);
    if (error) {
      setErr("Eksportda xatolik: " + error.message);
      return;
    }
    const merged = await attachActorNames(rows);
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    downloadCsv(`audit-log-${stamp}.csv`, merged);
  }

  const hasActiveFilters = !!(appliedFilters.dateFrom || appliedFilters.dateTo || appliedFilters.actorId || appliedFilters.action);

  return (
    <div className="km-settings-panel">
      {err && <Banner type="error">{err}</Banner>}

      <form className="km-audit-filters" onSubmit={applyFilters}>
        <div className="km-field km-field--sm">
          <label>Sana (dan)</label>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </div>
        <div className="km-field km-field--sm">
          <label>Sana (gacha)</label>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
        <div className="km-field km-field--sm">
          <label>Foydalanuvchi</label>
          <select value={actorId} onChange={(e) => setActorId(e.target.value)}>
            <option value="">Barchasi</option>
            {actorOptions.map((a) => (
              <option key={a.id} value={a.id}>{a.full_name || a.id}</option>
            ))}
          </select>
        </div>
        <div className="km-field km-field--sm">
          <label>Amal</label>
          <input
            value={actionText}
            onChange={(e) => setActionText(e.target.value)}
            placeholder="masalan: update, delete..."
          />
        </div>
        <div className="km-audit-filters__actions">
          <button type="submit" className="km-btn km-btn--primary">Filtrlash</button>
          {hasActiveFilters && (
            <button type="button" className="km-btn km-btn--ghost" onClick={resetFilters}>
              Tozalash
            </button>
          )}
          <button
            type="button"
            className="km-btn km-btn--outline"
            onClick={handleExportCsv}
            disabled={exporting}
          >
            {exporting ? "Eksport qilinmoqda..." : "⭳ CSV yuklab olish"}
          </button>
        </div>
      </form>

      {totalCount !== null && (
        <p className="km-panel-hint">
          Jami <strong>{totalCount}</strong> ta yozuv{hasActiveFilters ? " (filtr qo'llangan)" : ""}.
        </p>
      )}

      <div className="km-table-wrap">
        <table className="km-table">
          <thead>
            <tr>
              <th>Sana / vaqt</th>
              <th>Foydalanuvchi</th>
              <th>Amal</th>
              <th>Jadval</th>
              <th>O'zgarish</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="km-loading">Yuklanmoqda...</td>
              </tr>
            ) : logs.length === 0 ? (
              <tr>
                <td colSpan={5} className="km-empty-hint">Yozuvlar topilmadi.</td>
              </tr>
            ) : (
              logs.map((l) => (
                <tr key={l.id}>
                  <td>{formatDateTime(l.created_at)}</td>
                  <td>{l.actor?.full_name || "—"}</td>
                  <td><span className="km-action-tag">{l.action}</span></td>
                  <td>{l.table_name || "—"}</td>
                  <td className="km-audit-details">
                    {summarizeAuditChange(l.old_data, l.new_data)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="km-pagination">
        <button
          className="km-btn km-btn--ghost"
          disabled={page === 0 || loading}
          onClick={() => setPage((p) => Math.max(0, p - 1))}
        >
          ← Oldingi
        </button>
        <span>{page + 1}-sahifa</span>
        <button
          className="km-btn km-btn--ghost"
          disabled={!hasMore || loading}
          onClick={() => setPage((p) => p + 1)}
        >
          Keyingi →
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Tab: Bildirishnomalar                                              */
/* ------------------------------------------------------------------ */

// ⚠️ Bu tab "notification_settings" jadvalini talab qiladi (bir hodisa = bir qator):
//
//   create table notification_settings (
//     event_key      text primary key,
//     email_enabled  boolean not null default false,
//     email_recipients text not null default '',   -- vergul bilan ajratilgan
//     sms_enabled    boolean not null default false,
//     sms_recipients text not null default '',      -- vergul bilan ajratilgan
//     updated_at     timestamptz not null default now(),
//     updated_by     uuid references profiles(id)
//   );
//
// Ustun nomlari boshqacha bo'lsa, shu tabdagi select/upsert'ni moslang.

const NOTIFICATION_EVENTS = [
  { key: "user_created", label: "Yangi foydalanuvchi qo'shilganda" },
  { key: "super_admin_created", label: "Yangi super_admin qo'shilganda" },
  { key: "role_changed", label: "Foydalanuvchi roli o'zgartirilganda" },
  { key: "mfa_removed", label: "MFA qurilma o'chirilganda" },
];

function NotificationsTab({ session }) {
  const [rows, setRows] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null); // event_key hozir saqlanmoqda
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    const { data, error } = await supabase.from("notification_settings").select("*");
    if (error) {
      setErr(
        "Bildirishnoma sozlamalarini yuklab bo'lmadi (jadval mavjudligini tekshiring): " +
          error.message
      );
      setLoading(false);
      return;
    }
    const byKey = Object.fromEntries((data || []).map((r) => [r.event_key, r]));
    setRows(byKey);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function getRow(eventKey) {
    return (
      rows[eventKey] || {
        event_key: eventKey,
        email_enabled: false,
        email_recipients: "",
        sms_enabled: false,
        sms_recipients: "",
      }
    );
  }

  function updateLocal(eventKey, patch) {
    setRows((prev) => ({ ...prev, [eventKey]: { ...getRow(eventKey), ...patch } }));
  }

  async function saveRow(eventKey) {
    setSaving(eventKey);
    setMsg(null);
    setErr(null);
    const row = getRow(eventKey);
    const { error } = await supabase.from("notification_settings").upsert({
      event_key: eventKey,
      email_enabled: row.email_enabled,
      email_recipients: row.email_recipients,
      sms_enabled: row.sms_enabled,
      sms_recipients: row.sms_recipients,
      updated_at: new Date().toISOString(),
      updated_by: session?.user?.id,
    });
    setSaving(null);
    if (error) {
      setErr("Saqlashda xatolik: " + error.message);
    } else {
      setMsg("Sozlama saqlandi.");
    }
  }

  if (loading) return <div className="km-loading">Yuklanmoqda...</div>;

  return (
    <div className="km-settings-panel">
      <p className="km-panel-hint">
        Har bir hodisa uchun email va/yoki SMS orqali kimlarga xabar borishini belgilang.
        Manzillarni vergul bilan ajrating.
      </p>
      <Banner type="success" onClose={() => setMsg(null)}>{msg}</Banner>
      <Banner type="error" onClose={() => setErr(null)}>{err}</Banner>

      <div className="km-notif-list">
        {NOTIFICATION_EVENTS.map((ev) => {
          const row = getRow(ev.key);
          return (
            <div key={ev.key} className="km-notif-card">
              <div className="km-notif-card__head">
                <strong>{ev.label}</strong>
              </div>

              <div className="km-notif-card__row">
                <label className="km-switch">
                  <input
                    type="checkbox"
                    checked={!!row.email_enabled}
                    onChange={(e) => updateLocal(ev.key, { email_enabled: e.target.checked })}
                  />
                  <span>Email</span>
                </label>
                <input
                  className="km-notif-recipients"
                  value={row.email_recipients || ""}
                  onChange={(e) => updateLocal(ev.key, { email_recipients: e.target.value })}
                  placeholder="admin@misol.uz, boshqa@misol.uz"
                  disabled={!row.email_enabled}
                />
              </div>

              <div className="km-notif-card__row">
                <label className="km-switch">
                  <input
                    type="checkbox"
                    checked={!!row.sms_enabled}
                    onChange={(e) => updateLocal(ev.key, { sms_enabled: e.target.checked })}
                  />
                  <span>SMS</span>
                </label>
                <input
                  className="km-notif-recipients"
                  value={row.sms_recipients || ""}
                  onChange={(e) => updateLocal(ev.key, { sms_recipients: e.target.value })}
                  placeholder="+998901234567, +998907654321"
                  disabled={!row.sms_enabled}
                />
              </div>

              <div className="km-notif-card__actions">
                <button
                  className="km-btn km-btn--outline"
                  onClick={() => saveRow(ev.key)}
                  disabled={saving === ev.key}
                >
                  {saving === ev.key ? "Saqlanmoqda..." : "Saqlash"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Asosiy Sozlamalar komponenti                                       */
/* ------------------------------------------------------------------ */

const TABS = [
  { id: "profile", label: "Mening profilim" },
  { id: "security", label: "Xavfsizlik" },
  { id: "admins", label: "Super adminlar" },
  { id: "audit", label: "Audit log" },
  { id: "notifications", label: "Bildirishnomalar" },
];

export default function Sozlamalar({ session, onSignOut, onNavigate, active }) {
  const [tab, setTab] = useState("profile");

  return (
    <AppShell active={active || "sozlamalar"} onNavigate={onNavigate} onSignOut={onSignOut}>
      <div className="km-page-header">
        <h2>Sozlamalar</h2>
        <p>Profilingiz, xavfsizlik va tizim faoliyati shu yerda boshqariladi.</p>
      </div>

      <div className="km-settings-tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`km-settings-tab ${tab === t.id ? "km-settings-tab--active" : ""}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "profile" && <ProfileTab session={session} />}
      {tab === "security" && <SecurityTab />}
      {tab === "admins" && <SuperAdminsTab />}
      {tab === "audit" && <AuditLogTab />}
      {tab === "notifications" && <NotificationsTab session={session} />}

      <style>{`
        .km-settings-tabs {
          display: flex;
          gap: 6px;
          background: #eef0f7;
          padding: 6px;
          border-radius: 12px;
          width: fit-content;
          margin: 20px 0 24px;
          flex-wrap: wrap;
        }
        .km-settings-tab {
          border: none;
          background: transparent;
          padding: 9px 18px;
          border-radius: 9px;
          font-size: 14px;
          font-weight: 600;
          color: #5b5f73;
          cursor: pointer;
          transition: background 0.15s ease, color 0.15s ease, box-shadow 0.15s ease;
        }
        .km-settings-tab:hover { color: #372f8f; }
        .km-settings-tab--active {
          background: #ffffff;
          color: #4338ca;
          box-shadow: 0 1px 3px rgba(30, 24, 90, 0.12);
        }

        .km-settings-panel {
          background: #ffffff;
          border: 1px solid #ececf3;
          border-radius: 16px;
          padding: 28px;
          box-shadow: 0 1px 2px rgba(20, 16, 60, 0.03);
          max-width: 920px;
        }

        .km-profile-head {
          display: flex;
          align-items: center;
          gap: 16px;
          margin-bottom: 24px;
        }
        .km-profile-name { margin: 0 0 4px; font-size: 19px; color: #1c1a33; }
        .km-avatar {
          border-radius: 50%;
          background: linear-gradient(135deg, #4338ca, #7c3aed);
          color: #fff;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          flex-shrink: 0;
        }
        .km-role-badge {
          display: inline-block;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.03em;
          text-transform: uppercase;
          color: #4338ca;
          background: #eef0fd;
          padding: 3px 10px;
          border-radius: 999px;
        }

        .km-form-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px 20px;
        }
        .km-field { display: flex; flex-direction: column; gap: 6px; }
        .km-field label { font-size: 13px; font-weight: 600; color: #5b5f73; }
        .km-field-hint { font-size: 12px; color: #8a8ea3; margin-top: -2px; }
        .km-field input {
          border: 1px solid #dfe1ec;
          border-radius: 9px;
          padding: 10px 12px;
          font-size: 14px;
          color: #1c1a33;
          background: #fff;
        }
        .km-field input:disabled { background: #f6f7fb; color: #8a8ea3; }
        .km-field input:focus { outline: none; border-color: #7c6ff0; box-shadow: 0 0 0 3px rgba(124, 111, 240, 0.15); }
        .km-form-actions { grid-column: 1 / -1; display: flex; justify-content: flex-end; margin-top: 4px; }

        .km-btn {
          border-radius: 9px;
          padding: 10px 18px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          border: 1px solid transparent;
          transition: opacity 0.15s ease, background 0.15s ease;
        }
        .km-btn:disabled { opacity: 0.6; cursor: not-allowed; }
        .km-btn--primary { background: linear-gradient(135deg, #4338ca, #7c3aed); color: #fff; }
        .km-btn--primary:hover:not(:disabled) { opacity: 0.92; }
        .km-btn--outline { background: #fff; border-color: #cfd2e6; color: #4338ca; }
        .km-btn--outline:hover { background: #f5f5ff; }
        .km-btn--ghost { background: transparent; color: #5b5f73; }
        .km-btn--ghost:hover:not(:disabled) { background: #f2f3f8; }
        .km-btn--danger-outline { background: #fff; border-color: #f3c8c8; color: #c2373d; }
        .km-btn--danger-outline:hover { background: #fdf3f3; }

        .km-subsection h4 { margin: 0 0 14px; font-size: 15px; color: #1c1a33; }
        .km-subsection__head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
        .km-divider { height: 1px; background: #eeeff5; margin: 28px 0; }

        .km-mfa-enroll {
          display: flex;
          gap: 24px;
          background: #f8f8fd;
          border: 1px solid #ececf6;
          border-radius: 12px;
          padding: 20px;
          margin-bottom: 18px;
          flex-wrap: wrap;
        }
        .km-mfa-enroll__qr svg { width: 160px; height: 160px; }
        .km-mfa-enroll__side { flex: 1; min-width: 240px; display: flex; flex-direction: column; gap: 10px; }
        .km-mfa-enroll__side p { margin: 0; font-size: 13.5px; color: #4c4f63; line-height: 1.5; }
        .km-mfa-secret code { background: #eceefc; padding: 2px 6px; border-radius: 5px; font-size: 12.5px; }
        .km-mfa-verify-form { display: flex; gap: 8px; margin-top: 6px; flex-wrap: wrap; }
        .km-mfa-verify-form input {
          border: 1px solid #dfe1ec; border-radius: 9px; padding: 9px 12px;
          font-size: 14px; width: 130px; letter-spacing: 0.1em;
        }

        .km-mfa-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 10px; }
        .km-mfa-item {
          display: flex; align-items: center; justify-content: space-between;
          border: 1px solid #ececf3; border-radius: 10px; padding: 12px 16px;
        }
        .km-mfa-item__meta { font-size: 12.5px; color: #8a8ea3; margin-top: 2px; }
        .km-status-dot { margin-left: 10px; font-size: 11px; font-weight: 700; text-transform: uppercase;
          padding: 2px 8px; border-radius: 999px; background: #eef7ee; color: #2b8a3e; }
        .km-status-dot--unverified { background: #fdf3e4; color: #b9740c; }

        .km-panel-hint { font-size: 13.5px; color: #5b5f73; margin: 0 0 16px; }

        .km-audit-filters {
          display: flex; align-items: flex-end; gap: 14px; flex-wrap: wrap;
          background: #f8f8fd; border: 1px solid #ececf6; border-radius: 12px;
          padding: 16px; margin-bottom: 16px;
        }
        .km-field--sm { min-width: 150px; }
        .km-field--sm select, .km-field--sm input {
          border: 1px solid #dfe1ec; border-radius: 9px; padding: 9px 11px;
          font-size: 13.5px; color: #1c1a33; background: #fff;
        }
        .km-audit-filters__actions { display: flex; gap: 8px; margin-left: auto; flex-wrap: wrap; }

        .km-notif-list { display: flex; flex-direction: column; gap: 14px; }
        .km-notif-card {
          border: 1px solid #ececf3; border-radius: 12px; padding: 16px 18px;
          display: flex; flex-direction: column; gap: 10px;
        }
        .km-notif-card__head strong { font-size: 14.5px; color: #1c1a33; }
        .km-notif-card__row { display: flex; align-items: center; gap: 14px; }
        .km-notif-recipients {
          flex: 1; border: 1px solid #dfe1ec; border-radius: 9px; padding: 8px 11px;
          font-size: 13.5px; color: #1c1a33;
        }
        .km-notif-recipients:disabled { background: #f6f7fb; color: #b3b6c6; }
        .km-notif-card__actions { display: flex; justify-content: flex-end; }

        .km-switch { display: flex; align-items: center; gap: 8px; font-size: 13.5px; color: #4c4f63; width: 90px; cursor: pointer; }
        .km-switch input { width: 16px; height: 16px; accent-color: #4338ca; cursor: pointer; }

        .km-table-wrap { overflow-x: auto; border: 1px solid #ececf3; border-radius: 12px; }
        .km-table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
        .km-table th {
          text-align: left; background: #f8f8fd; color: #5b5f73; font-weight: 600;
          padding: 11px 16px; border-bottom: 1px solid #ececf3; white-space: nowrap;
        }
        .km-table td { padding: 11px 16px; border-bottom: 1px solid #f2f2f7; color: #1c1a33; vertical-align: top; }
        .km-table tr:last-child td { border-bottom: none; }
        .km-table-user { display: flex; align-items: center; gap: 10px; }
        .km-action-tag {
          background: #eef0fd; color: #4338ca; font-size: 12px; font-weight: 600;
          padding: 3px 9px; border-radius: 999px;
        }
        .km-audit-details { color: #6a6d80; max-width: 360px; }

        .km-pagination { display: flex; align-items: center; gap: 14px; justify-content: flex-end; margin-top: 14px; font-size: 13px; color: #5b5f73; }

        .km-loading, .km-empty-hint { padding: 18px 4px; color: #8a8ea3; font-size: 13.5px; text-align: center; }

        .km-banner {
          display: flex; align-items: center; justify-content: space-between;
          border-radius: 9px; padding: 10px 14px; font-size: 13.5px; margin-bottom: 14px;
        }
        .km-banner:empty { display: none; }
        .km-banner--success { background: #eaf7ec; color: #257a3a; }
        .km-banner--error { background: #fdeeee; color: #c2373d; }
        .km-banner__close { border: none; background: transparent; font-size: 16px; cursor: pointer; color: inherit; }

        @media (max-width: 640px) {
          .km-form-grid { grid-template-columns: 1fr; }
          .km-settings-panel { padding: 18px; }
        }
      `}</style>
    </AppShell>
  );
}