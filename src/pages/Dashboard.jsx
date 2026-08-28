import React, { useEffect, useMemo, useState } from "react";
import {
  GraduationCap,
  Users2,
  Search,
  Building2,
  ShieldCheck,
  FileText,
} from "lucide-react";
import AppShell from "./AppShell"; // <-- yo'lni loyihangizga qarab tekshiring
import { supabase } from "../supabaseClient"; // <-- Supabase client'ingiz joylashgan yo'lni tekshiring
import "./Dashboard.css";

/* ---------------- Konstantalar ---------------- */

// ARXITEKTURA.md, 3-bo'lim: hisobotlar.holat va murojaatlar.holat enum'lari
const HISOBOT_HOLAT = {
  tasdiqlangan: { label: "Tasdiqlandi", tone: "green" },
  kutilmoqda: { label: "Ko'rib chiqilmoqda", tone: "yellow" },
  rad_etilgan: { label: "Rad etildi", tone: "red" },
};

const MUROJAAT_HOLAT = {
  kutilmoqda: { label: "Yangi", tone: "blue" },
  korib_chiqilmoqda: { label: "Ko'rib chiqilmoqda", tone: "yellow" },
  javob_berilgan: { label: "Javob berilgan", tone: "green" },
  yopilgan: { label: "Yopilgan", tone: "gray" },
};

const OY_QISQA = [
  "yan", "fev", "mar", "apr", "may", "iyun",
  "iyul", "avg", "sen", "okt", "noy", "dek",
];

/* ---------------- Yordamchi funksiyalar ---------------- */

function fmtNum(n) {
  return Number(n || 0).toLocaleString("ru-RU");
}

function fmtPct(n) {
  return `${Number(n || 0).toFixed(1)}%`;
}

function fmtDate(d) {
  return `${d.getDate()}-${OY_QISQA[d.getMonth()]}`;
}

// "Bugun, 10:30" / "Kecha, 16:40" / "26-may, 14:30"
function fmtWhen(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const startOf = (dt) => new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
  const diffDays = Math.round((startOf(now) - startOf(d)) / 86400000);
  const hhmm = d.toLocaleTimeString("uz-UZ", { hour: "2-digit", minute: "2-digit" });
  if (diffDays === 0) return `Bugun, ${hhmm}`;
  if (diffDays === 1) return `Kecha, ${hhmm}`;
  return `${fmtDate(d)}, ${hhmm}`;
}

function attendanceTone(pct) {
  if (pct >= 85) return "#0fae8f";
  if (pct >= 60) return "#f2b23c";
  return "#e64545";
}

// Bir jadvaldagi qatorlarni tuman_id bo'yicha guruhlab sanaydi
function countByTuman(rows, key = "tuman_id") {
  const map = new Map();
  for (const r of rows || []) {
    const k = r[key];
    map.set(k, (map.get(k) || 0) + 1);
  }
  return map;
}

/* ---------------- Kichik komponentlar ---------------- */

function StatCard({ icon: Icon, tone, label, value, sub }) {
  return (
    <div className="km-card km-stat-card">
      <div className={`km-stat-icon tone-${tone}`}>
        <Icon size={20} strokeWidth={2} />
      </div>
      <p className="km-stat-value">{value}</p>
      <p className="km-stat-label">{label}</p>
      <div className="km-stat-change">
        <span className="sub">{sub}</span>
      </div>
    </div>
  );
}

function StatusDot({ color }) {
  return <span className="km-status-dot" style={{ background: color }} />;
}

function Tag({ tone, children }) {
  return <span className={`km-tag ${tone}`}>{children}</span>;
}

/* ---------------- Asosiy komponent ---------------- */

export default function Dashboard({ session, onSignOut, onNavigate }) {
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);

  const [totals, setTotals] = useState({
    oquvchilar: 0,
    togaraklar: 0,
    maktablar: 0,
    foydalanuvchilar: 0,
    davomatPct: 0,
  });
  const [ranking, setRanking] = useState([]);
  const [reports, setReports] = useState([]);
  const [appeals, setAppeals] = useState([]);

  // Sarlavhadagi standart oraliq: so'nggi 7 kun (haqiqiy sanalar bilan)
  const range = useMemo(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 6);
    return { start, end };
  }, []);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setErrorMsg(null);
      try {
        const startISO = range.start.toISOString().slice(0, 10);
        const endISO = range.end.toISOString().slice(0, 10);

        const [
          tumanlarRes,
          maktablarRes,
          oquvchilarRes,
          togaraklarRes,
          profilesRes,
          davomatRes,
          hisobotlarRes,
          murojaatlarRes,
        ] = await Promise.all([
          supabase.from("tumanlar").select("id, name"),
          supabase.from("maktablar").select("id, tuman_id"),
          supabase.from("oquvchilar").select("id, tuman_id"),
          supabase.from("togaraklar").select("id, tuman_id, mavjud"),
          supabase.from("profiles").select("id", { count: "exact", head: true }),
          supabase
            .from("davomat")
            .select("tuman_id, holat, sana")
            .gte("sana", startISO)
            .lte("sana", endISO),
          supabase
            .from("hisobotlar")
            .select("id, turi, holat, created_at, maktablar(nomi), tumanlar(name)")
            .order("created_at", { ascending: false })
            .limit(4),
          supabase
            .from("murojaatlar")
            .select("id, mavzu, holat, created_at, tumanlar(name)")
            .order("created_at", { ascending: false })
            .limit(4),
        ]);

        const firstError =
          tumanlarRes.error ||
          maktablarRes.error ||
          oquvchilarRes.error ||
          togaraklarRes.error ||
          profilesRes.error ||
          davomatRes.error ||
          hisobotlarRes.error ||
          murojaatlarRes.error;
        if (firstError) throw firstError;

        const tumanlar = tumanlarRes.data || [];
        const maktablar = maktablarRes.data || [];
        const oquvchilar = oquvchilarRes.data || [];
        const togaraklar = (togaraklarRes.data || []).filter((t) => t.mavjud);
        const davomat = davomatRes.data || [];

        const maktabByTuman = countByTuman(maktablar);
        const oquvchiByTuman = countByTuman(oquvchilar);

        // Tuman bo'yicha davomat foizi: keldi / jami
        const davomatByTuman = new Map();
        for (const row of davomat) {
          const t = davomatByTuman.get(row.tuman_id) || { keldi: 0, jami: 0 };
          t.jami += 1;
          if (row.holat === "keldi") t.keldi += 1;
          davomatByTuman.set(row.tuman_id, t);
        }

        const rankingRows = tumanlar
          .map((t) => {
            const d = davomatByTuman.get(t.id);
            const pct = d && d.jami > 0 ? (d.keldi / d.jami) * 100 : 0;
            return {
              id: t.id,
              name: t.name,
              schools: maktabByTuman.get(t.id) || 0,
              students: oquvchiByTuman.get(t.id) || 0,
              attendance: pct,
            };
          })
          .sort((a, b) => b.attendance - a.attendance)
          .map((r, i) => ({ ...r, rank: i + 1 }));

        const jamiDavomat = davomat.length;
        const jamiKeldi = davomat.filter((r) => r.holat === "keldi").length;
        const davomatPct = jamiDavomat > 0 ? (jamiKeldi / jamiDavomat) * 100 : 0;

        const reportRows = (hisobotlarRes.data || []).map((r) => ({
          id: r.id,
          title: r.turi || "Hisobot",
          sub: r.maktablar?.nomi || r.tumanlar?.name || "—",
          time: fmtWhen(r.created_at),
          ...(HISOBOT_HOLAT[r.holat] || { label: r.holat, tone: "gray" }),
        }));

        const appealRows = (murojaatlarRes.data || []).map((m) => ({
          id: m.id,
          title: m.mavzu || "Murojaat",
          sub: m.tumanlar?.name || "—",
          time: fmtWhen(m.created_at),
          ...(MUROJAAT_HOLAT[m.holat] || { label: m.holat, tone: "gray" }),
        }));

        if (!active) return;
        setTotals({
          oquvchilar: oquvchilar.length,
          togaraklar: togaraklar.length,
          maktablar: maktablar.length,
          foydalanuvchilar: profilesRes.count || 0,
          davomatPct,
        });
        setRanking(rankingRows.slice(0, 6));
        setReports(reportRows);
        setAppeals(appealRows);
      } catch (err) {
        console.error("Dashboard ma'lumotlarini yuklashda xatolik:", err);
        if (active) setErrorMsg("Ma'lumotlarni yuklab bo'lmadi. Qaytadan urinib ko'ring.");
      } finally {
        if (active) setLoading(false);
      }
    }

    load();
    return () => {
      active = false;
    };
  }, [range]);

  const stats = [
    {
      key: "oquvchilar",
      label: "Jami o'quvchilar",
      icon: GraduationCap,
      tone: "purple",
      value: fmtNum(totals.oquvchilar),
      sub: "Barcha tumanlar bo'yicha",
    },
    {
      key: "togaraklar",
      label: "Faol to'garaklar",
      icon: Users2,
      tone: "blue",
      value: fmtNum(totals.togaraklar),
      sub: "Barcha tumanlar bo'yicha",
    },
    {
      key: "davomat",
      label: "O'rtacha davomat",
      icon: Search,
      tone: "teal",
      value: fmtPct(totals.davomatPct),
      sub: `${fmtDate(range.start)} – ${fmtDate(range.end)}`,
    },
    {
      key: "maktablar",
      label: "Maktablar soni",
      icon: Building2,
      tone: "orange",
      value: fmtNum(totals.maktablar),
      sub: "Jami ro'yxatdan o'tgan",
    },
    {
      key: "foydalanuvchilar",
      label: "Foydalanuvchilar",
      icon: ShieldCheck,
      tone: "purple",
      value: fmtNum(totals.foydalanuvchilar),
      sub: "Tizim foydalanuvchilari",
    },
  ];

  return (
    <AppShell active="dashboard" onNavigate={onNavigate} onSignOut={onSignOut}>
      <div className="km-page-header">
        <div>
          <h2>Bosh sahifa</h2>
          <p>Viloyat bo'yicha umumiy statistika va ko'rsatkichlar</p>
        </div>
      </div>

      {errorMsg && <div className="km-error-banner">{errorMsg}</div>}

      {/* Stats */}
      <div className="km-stats-grid">
        {stats.map((s) => (
          <StatCard key={s.key} {...s} value={loading ? "…" : s.value} />
        ))}
      </div>

      {/* Tumanlar reytingi + So'nggi hisobotlar */}
      <div className="km-row-2">
        <div className="km-card km-panel">
          <div className="km-panel-head">
            <div>
              <h3>Tumanlar reytingi (davomat bo'yicha)</h3>
            </div>
          </div>
          <table className="km-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Tuman nomi</th>
                <th>Maktablar</th>
                <th>O'quvchilar</th>
                <th>Davomat (%)</th>
                <th>Holat</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={6} className="muted">
                    Yuklanmoqda…
                  </td>
                </tr>
              )}
              {!loading && ranking.length === 0 && (
                <tr>
                  <td colSpan={6} className="muted">
                    Ma'lumot topilmadi
                  </td>
                </tr>
              )}
              {!loading &&
                ranking.map((d) => (
                  <tr key={d.id}>
                    <td className="muted">{d.rank}</td>
                    <td>{d.name}</td>
                    <td>{fmtNum(d.schools)}</td>
                    <td>{fmtNum(d.students)}</td>
                    <td>{fmtPct(d.attendance)}</td>
                    <td>
                      <StatusDot color={attendanceTone(d.attendance)} />
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
          <div className="km-panel-footer" onClick={() => onNavigate?.("tumanlar")}>
            Barcha tumanlarni ko'rish &rarr;
          </div>
        </div>

        <div className="km-card km-panel">
          <div className="km-panel-head">
            <div>
              <h3>So'nggi hisobotlar</h3>
            </div>
            <span className="link" onClick={() => onNavigate?.("hisobotlar")}>
              Barchasi
            </span>
          </div>
          <div className="km-list">
            {loading && <p className="muted km-list-empty">Yuklanmoqda…</p>}
            {!loading && reports.length === 0 && (
              <p className="muted km-list-empty">Hisobotlar topilmadi</p>
            )}
            {!loading &&
              reports.map((r) => (
                <div className="km-list-item" key={r.id}>
                  <div className="km-list-icon">
                    <FileText size={16} />
                  </div>
                  <div className="km-list-body">
                    <p className="km-list-title">{r.title}</p>
                    <p className="km-list-sub">{r.sub}</p>
                    <p className="km-list-time">{r.time}</p>
                  </div>
                  <Tag tone={r.tone}>{r.label}</Tag>
                </div>
              ))}
          </div>
          <div className="km-panel-footer" onClick={() => onNavigate?.("hisobotlar")}>
            Barcha hisobotlarni ko'rish &rarr;
          </div>
        </div>
      </div>

      {/* So'nggi murojaatlar */}
      <div className="km-card km-panel">
        <div className="km-panel-head">
          <div>
            <h3>So'nggi murojaatlar</h3>
          </div>
          <span className="link" onClick={() => onNavigate?.("murojaatlar")}>
            Barchasi
          </span>
        </div>
        <div className="km-list km-list-wide">
          {loading && <p className="muted km-list-empty">Yuklanmoqda…</p>}
          {!loading && appeals.length === 0 && (
            <p className="muted km-list-empty">Murojaatlar topilmadi</p>
          )}
          {!loading &&
            appeals.map((a) => (
              <div className="km-list-item" key={a.id}>
                <div className="km-list-icon">
                  <FileText size={16} />
                </div>
                <div className="km-list-body">
                  <p className="km-list-title">{a.title}</p>
                  <p className="km-list-sub">{a.sub}</p>
                  <p className="km-list-time">{a.time}</p>
                </div>
                <Tag tone={a.tone}>{a.label}</Tag>
              </div>
            ))}
        </div>
        <div className="km-panel-footer" onClick={() => onNavigate?.("murojaatlar")}>
          Barcha murojaatlarni ko'rish &rarr;
        </div>
      </div>

      <div className="km-footer">
        <span>&copy; {new Date().getFullYear()} Kelajak Markazi. Barcha huquqlar himoyalangan.</span>
        <span>Versiya 1.0.0</span>
      </div>
    </AppShell>
  );
}