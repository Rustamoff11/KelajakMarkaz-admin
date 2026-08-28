import React, { useEffect, useState } from "react";
import {
  Calendar,
  Download,
  MapPin,
  Users2,
  CircleUserRound,
  Search,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  MoreVertical,
  X,
} from "lucide-react";
import { ResponsiveContainer, LineChart, Line } from "recharts";
import ExcelJS from "exceljs";
import AppShell from "./AppShell.jsx";
import { supabase } from "../supabaseClient";
import "./Tumanlar.css";

// O'zbekcha oy nomlari (tabel sarlavhasi uchun: "Avgust oyi uchun TABEL")
const UZ_MONTHS = [
  "Yanvar",
  "Fevral",
  "Mart",
  "Aprel",
  "May",
  "Iyun",
  "Iyul",
  "Avgust",
  "Sentyabr",
  "Oktyabr",
  "Noyabr",
  "Dekabr",
];

/* ==========================================================
   Tuman detali modali uchun stillar.
   Alohida CSS faylga ehtiyoj qolmasligi uchun shu yerda,
   komponent birinchi marta render bo'lganda <head>ga
   bir marta qo'shiladi.
   ========================================================== */
const MODAL_STYLE_ID = "km-district-modal-styles";
const MODAL_STYLE_CSS = `
.km-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(16, 20, 30, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 24px;
}

.km-modal {
  background: #ffffff;
  border-radius: 14px;
  width: 100%;
  max-width: 1080px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(16, 20, 30, 0.25);
  overflow: hidden;
}

.km-modal-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 20px 24px;
  border-bottom: 1px solid #eef0f4;
}

.km-modal-header h3 {
  margin: 0 0 4px 0;
  font-size: 18px;
  font-weight: 600;
  color: #101828;
}

.km-modal-subtitle {
  margin: 0;
  font-size: 13px;
  color: #667085;
}

.km-modal-body {
  overflow-y: auto;
  padding: 8px 20px 24px 20px;
}

/* Funksional filtr select'lari (Davomat / Holat bo'yicha) */
.km-filter-select-wrap {
  position: relative;
  display: flex;
  align-items: center;
}

.km-native-select {
  appearance: none;
  -webkit-appearance: none;
  -moz-appearance: none;
  width: 100%;
  border: 1px solid #e4e7ec;
  border-radius: 8px;
  background: #ffffff;
  padding: 9px 30px 9px 12px;
  font-size: 13px;
  color: #344054;
  cursor: pointer;
  font-family: inherit;
}

.km-native-select:focus {
  outline: none;
  border-color: #5b5bf0;
}

.km-filter-select-wrap .km-select-chevron {
  position: absolute;
  right: 10px;
  pointer-events: none;
}

/* "Tabelni yuklab olish" tugmasi */
.km-tabel-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
`;

function useDistrictModalStyles() {
  useEffect(() => {
    if (document.getElementById(MODAL_STYLE_ID)) return;
    const styleEl = document.createElement("style");
    styleEl.id = MODAL_STYLE_ID;
    styleEl.textContent = MODAL_STYLE_CSS;
    document.head.appendChild(styleEl);
  }, []);
}

/* ---------------- Yordamchi doimiylar ---------------- */

const TREND_COLOR = {
  good: "#16a34a",
  mid: "#d97706",
  bad: "#e13a3a",
};

const STATUS_TONE = {
  Yaxshi: "green",
  "O'rtacha": "yellow",
  Past: "red",
};

function statusFromAttendance(pct) {
  if (pct >= 85) return "Yaxshi";
  if (pct >= 70) return "O'rtacha";
  return "Past";
}

function trendKeyFromAttendance(pct) {
  if (pct >= 85) return "good";
  if (pct >= 70) return "mid";
  return "bad";
}

// Oxirgi N kun sanalarini "YYYY-MM-DD" formatida qaytaradi
function getLastNDates(n) {
  const dates = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

function getLast7Dates() {
  return getLastNDates(7);
}

/* ---------------- CSV yordamchi funksiyalari ---------------- */

function csvEscape(value) {
  const str = String(value ?? "");
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function downloadCsv(filename, rows) {
  const csvContent = rows.map((row) => row.map(csvEscape).join(",")).join("\n");
  // \uFEFF -- BOM, Excelda kirill/lotin harflari to'g'ri ko'rinishi uchun
  const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/* ---------------- Building blocks ---------------- */

function SummaryCard({ item }) {
  const Icon = item.icon;
  return (
    <div className="km-card km-summary-card">
      <div className="km-summary-icon" style={{ background: item.bg }}>
        <Icon size={20} color={item.fg} strokeWidth={2} />
      </div>
      <div className="km-summary-body">
        <p className="km-summary-label">{item.label}</p>
        <div className="km-summary-value-row">
          <span className="km-summary-value">{item.value}</span>
          {item.delta && <span className="km-summary-delta">{item.delta}</span>}
        </div>
      </div>
    </div>
  );
}

function Sparkline({ data, trendKey }) {
  if (!data || data.length === 0) {
    return <span style={{ fontSize: 11, color: "#c0c5d0" }}>—</span>;
  }
  const color = TREND_COLOR[trendKey] || "#667085";
  return (
    <div style={{ width: 90, height: 30 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 3, right: 2, left: 2, bottom: 3 }}>
          <Line type="monotone" dataKey="v" stroke={color} strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ---------------- Tuman detali modali ---------------- */

function DistrictDetailModal({ district, loading, error, students, onClose }) {
  useDistrictModalStyles();

  if (!district) return null;

  return (
    <div className="km-modal-overlay" onClick={onClose}>
      <div className="km-modal" onClick={(e) => e.stopPropagation()}>
        <div className="km-modal-header">
          <div>
            <h3>{district.name}</h3>
            <p className="km-modal-subtitle">O'quvchilar davomati — oxirgi 30 kun</p>
          </div>
          <button className="km-icon-btn" onClick={onClose} type="button" aria-label="Yopish">
            <X size={18} />
          </button>
        </div>

        <div className="km-modal-body">
          {loading ? (
            <p style={{ padding: "24px", textAlign: "center", color: "#98a2b3" }}>
              Yuklanmoqda...
            </p>
          ) : error ? (
            <p style={{ padding: "24px", textAlign: "center", color: "#e13a3a" }}>{error}</p>
          ) : (
            <table className="km-table">
              <thead>
                <tr>
                  <th>O'quvchi</th>
                  <th>Kelgan kunlar</th>
                  <th>Jami kunlar</th>
                  <th>Davomat foizi</th>
                  <th>Holat</th>
                </tr>
              </thead>
              <tbody>
                {students.map((s) => (
                  <tr key={s.id}>
                    <td>{s.name}</td>
                    <td>{s.keldi}</td>
                    <td>{s.jami}</td>
                    <td>{s.pct}%</td>
                    <td>
                      <span className={`km-tag ${STATUS_TONE[s.status]}`}>{s.status}</span>
                    </td>
                  </tr>
                ))}

                {students.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ textAlign: "center", padding: "24px", color: "#98a2b3" }}>
                      Bu tumanda o'quvchi topilmadi
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------------- Page ---------------- */

export default function Tumanlar({ onNavigate, session, onSignOut }) {
  useDistrictModalStyles();

  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);

  const [districts, setDistricts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");

  // Tuman detali (modal) uchun state
  const [selectedDistrict, setSelectedDistrict] = useState(null);
  const [studentAttendance, setStudentAttendance] = useState([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(null);

  // Oylik hisobotni yuklab olish uchun state
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState(null);

  // Filtrlar: Davomat foizi bo'yicha va Holat bo'yicha
  const [attendanceFilter, setAttendanceFilter] = useState("barchasi");
  const [statusFilter, setStatusFilter] = useState("barchasi");

  // Har bir tuman uchun "Tabelni yuklab olish" holati (tuman bo'yicha alohida xato)
  const [tabelDownloadingId, setTabelDownloadingId] = useState(null);
  const [tabelErrorsById, setTabelErrorsById] = useState({});

  // Sahifa birinchi ochilganda BIR MARTA barcha kerakli ma'lumotlarni olamiz.
  // Filtr / qidiruv / pagination bosilganda hech qanday qo'shimcha so'rov yubormaymiz.
  useEffect(() => {
    let isMounted = true;

    async function fetchAll() {
      setLoading(true);
      setError(null);

      const last7 = getLast7Dates();
      const weekStart = last7[0];

      try {
        const [tumanlarRes, oquvchilarRes, togaraklarRes, davomatRes] = await Promise.all([
          supabase.from("tumanlar").select("id, name, is_shahar").order("name", { ascending: true }),
          supabase.from("oquvchilar").select("tuman_id"),
          supabase.from("togaraklar").select("tuman_id, mavjud"),
          supabase
            .from("davomat")
            .select("tuman_id, sana, holat")
            .gte("sana", weekStart),
        ]);

        if (tumanlarRes.error) throw tumanlarRes.error;
        if (oquvchilarRes.error) throw oquvchilarRes.error;
        if (togaraklarRes.error) throw togaraklarRes.error;
        if (davomatRes.error) throw davomatRes.error;

        if (!isMounted) return;

        const tumanlarRows = tumanlarRes.data || [];
        const oquvchilarRows = oquvchilarRes.data || [];
        const togaraklarRows = togaraklarRes.data || [];
        const davomatRows = davomatRes.data || [];

        // --- O'quvchilar sonini tuman bo'yicha sanash ---
        const studentCountByTuman = {};
        for (const row of oquvchilarRows) {
          studentCountByTuman[row.tuman_id] = (studentCountByTuman[row.tuman_id] || 0) + 1;
        }

        // --- Faol to'garaklar sonini tuman bo'yicha sanash (mavjud = true) ---
        const clubCountByTuman = {};
        for (const row of togaraklarRows) {
          if (row.mavjud) {
            clubCountByTuman[row.tuman_id] = (clubCountByTuman[row.tuman_id] || 0) + 1;
          }
        }

        // --- Davomatni kun va tuman bo'yicha guruhlash ---
        // structure: { [tuman_id]: { [sana]: { keldi: n, jami: n } } }
        const attendanceByTumanDay = {};
        for (const row of davomatRows) {
          if (!attendanceByTumanDay[row.tuman_id]) attendanceByTumanDay[row.tuman_id] = {};
          if (!attendanceByTumanDay[row.tuman_id][row.sana]) {
            attendanceByTumanDay[row.tuman_id][row.sana] = { keldi: 0, jami: 0 };
          }
          attendanceByTumanDay[row.tuman_id][row.sana].jami += 1;
          if (row.holat === "keldi") {
            attendanceByTumanDay[row.tuman_id][row.sana].keldi += 1;
          }
        }

        // --- Har bir tuman uchun yakuniy qatorni yig'amiz ---
        const formatted = tumanlarRows.map((t, index) => {
          const dayMap = attendanceByTumanDay[t.id] || {};

          // Sparkline uchun 7 kunlik foiz massivi
          const sparkData = last7.map((date, i) => {
            const day = dayMap[date];
            const pct = day && day.jami > 0 ? Math.round((day.keldi / day.jami) * 100) : 0;
            return { i, v: pct };
          });

          // Umumiy o'rtacha davomat (7 kunlik yig'indi bo'yicha)
          let totalKeldi = 0;
          let totalJami = 0;
          Object.values(dayMap).forEach((d) => {
            totalKeldi += d.keldi;
            totalJami += d.jami;
          });
          const attendancePct = totalJami > 0 ? Math.round((totalKeldi / totalJami) * 100) : 0;

          return {
            rank: index + 1,
            id: t.id,
            name: t.name,
            isShahar: t.is_shahar,
            students: studentCountByTuman[t.id] || 0,
            clubs: clubCountByTuman[t.id] || 0,
            attendance: attendancePct,
            status: statusFromAttendance(attendancePct),
            trendKey: trendKeyFromAttendance(attendancePct),
            sparkData,
          };
        });

        setDistricts(formatted);
      } catch (e) {
        if (isMounted) setError("Ma'lumotlarni yuklashda xatolik yuz berdi.");
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    fetchAll();
    return () => {
      isMounted = false;
    };
  }, []); // <-- faqat mount bo'lganda bir marta ishlaydi

  // --- Umumiy statistikani frontendda hisoblaymiz (qo'shimcha so'rov shart emas) ---
  const totalStudents = districts.reduce((sum, d) => sum + d.students, 0);
  const totalClubs = districts.reduce((sum, d) => sum + d.clubs, 0);
  const avgAttendance =
    districts.length > 0
      ? Math.round(districts.reduce((sum, d) => sum + d.attendance, 0) / districts.length)
      : 0;

  const SUMMARY = [
    { label: "Jami tumanlar", value: String(districts.length), icon: MapPin, bg: "#eef0ff", fg: "#5b5bf0" },
    {
      label: "Jami o'quvchilar",
      value: totalStudents.toLocaleString("ru-RU"),
      icon: Users2,
      bg: "#e6f9f5",
      fg: "#0fae8f",
    },
    {
      label: "O'rtacha davomat",
      value: `${avgAttendance}%`,
      icon: CircleUserRound,
      bg: "#e7f0ff",
      fg: "#2f6fed",
    },
    {
      label: "Faol to'garaklar",
      value: totalClubs.toLocaleString("ru-RU"),
      icon: Users2,
      bg: "#f2ecff",
      fg: "#7c3aed",
    },
  ];

  // Qidiruv + Davomat filtri + Holat filtri — barchasi frontendda,
  // qayta so'rov yubormasdan
  const filteredDistricts = districts.filter((d) => {
    const matchesSearch = d.name.toLowerCase().includes(searchTerm.toLowerCase());

    let matchesAttendance = true;
    if (attendanceFilter === "yuqori") matchesAttendance = d.attendance >= 85;
    else if (attendanceFilter === "orta") matchesAttendance = d.attendance >= 70 && d.attendance < 85;
    else if (attendanceFilter === "past") matchesAttendance = d.attendance < 70;

    let matchesStatus = true;
    if (statusFilter !== "barchasi") matchesStatus = d.status === statusFilter;

    return matchesSearch && matchesAttendance && matchesStatus;
  });

  const totalPages = Math.max(1, Math.ceil(filteredDistricts.length / pageSize));
  const pagedDistricts = filteredDistricts.slice((page - 1) * pageSize, page * pageSize);

  /* ---------------- Tuman detali: "Batafsil" bosilganda ---------------- */

  async function openDistrictDetail(district) {
    setSelectedDistrict(district);
    setDetailLoading(true);
    setDetailError(null);
    setStudentAttendance([]);

    const last30 = getLastNDates(30);
    const monthStart = last30[0];

    try {
      // 1) Shu tumanga biriktirilgan o'quvchilar ro'yxati
      // MUHIM: "full_name" o'rniga sizning jadvalingizdagi haqiqiy ism ustuni
      // nomini qo'ying (masalan: ism_familiya, fio va h.k.)
      const { data: students, error: studentsErr } = await supabase
        .from("oquvchilar")
        .select("id, full_name")
        .eq("tuman_id", district.id);

      if (studentsErr) throw studentsErr;

      const studentRows = students || [];

      // 2) Shu tuman bo'yicha oxirgi 30 kunlik davomat yozuvlari
      // MUHIM: "oquvchi_id" ustuni "davomat" jadvalida mavjud bo'lishi kerak
      // (o'quvchini davomat yozuviga bog'lash uchun). Agar boshqacha
      // nomlangan bo'lsa (masalan "student_id"), shu yerda almashtiring.
      let attendanceRows = [];
      if (studentRows.length > 0) {
        const { data: attData, error: attErr } = await supabase
          .from("davomat")
          .select("oquvchi_id, sana, holat")
          .eq("tuman_id", district.id)
          .gte("sana", monthStart);

        if (attErr) throw attErr;
        attendanceRows = attData || [];
      }

      // 3) Har bir o'quvchi bo'yicha kelgan/jami kunlarni sanash
      const byStudent = {};
      for (const row of attendanceRows) {
        if (!byStudent[row.oquvchi_id]) byStudent[row.oquvchi_id] = { keldi: 0, jami: 0 };
        byStudent[row.oquvchi_id].jami += 1;
        if (row.holat === "keldi") {
          byStudent[row.oquvchi_id].keldi += 1;
        }
      }

      const formatted = studentRows.map((s) => {
        const stat = byStudent[s.id] || { keldi: 0, jami: 0 };
        const pct = stat.jami > 0 ? Math.round((stat.keldi / stat.jami) * 100) : 0;
        return {
          id: s.id,
          name: s.full_name,
          keldi: stat.keldi,
          jami: stat.jami,
          pct,
          status: statusFromAttendance(pct),
        };
      });

      // Eng past davomatlilar tepada ko'rinsin (e'tibor talab qiladiganlar)
      formatted.sort((a, b) => a.pct - b.pct);

      setStudentAttendance(formatted);
    } catch (e) {
      console.error("O'quvchilar davomatini yuklashda xatolik:", e);
      setDetailError("O'quvchilar davomatini yuklashda xatolik yuz berdi.");
    } finally {
      setDetailLoading(false);
    }
  }

  function closeDistrictDetail() {
    setSelectedDistrict(null);
    setStudentAttendance([]);
    setDetailError(null);
  }

  /* ---------------- Yuqoridagi "Hisobotni yuklab olish": bir oylik CSV ---------------- */

  async function downloadMonthlyReport() {
    setDownloading(true);
    setDownloadError(null);

    const last30 = getLastNDates(30);
    const monthStart = last30[0];

    try {
      const { data: attData, error: attErr } = await supabase
        .from("davomat")
        .select("tuman_id, sana, holat")
        .gte("sana", monthStart);

      if (attErr) throw attErr;

      const byTuman = {};
      for (const row of attData || []) {
        if (!byTuman[row.tuman_id]) byTuman[row.tuman_id] = { keldi: 0, jami: 0 };
        byTuman[row.tuman_id].jami += 1;
        if (row.holat === "keldi") {
          byTuman[row.tuman_id].keldi += 1;
        }
      }

      const rows = [
        ["Tuman", "O'quvchilar soni", "Faol to'garaklar", "Davomat foizi (30 kun)", "Holat"],
      ];

      for (const d of districts) {
        const stat = byTuman[d.id] || { keldi: 0, jami: 0 };
        const pct = stat.jami > 0 ? Math.round((stat.keldi / stat.jami) * 100) : 0;
        rows.push([d.name, d.students, d.clubs, `${pct}%`, statusFromAttendance(pct)]);
      }

      const today = new Date().toISOString().slice(0, 10);
      downloadCsv(`hisobot_${today}.csv`, rows);
    } catch (e) {
      console.error("Oylik hisobotni yuklab olishda xatolik:", e);
      setDownloadError("Hisobotni yuklab olishda xatolik yuz berdi.");
    } finally {
      setDownloading(false);
    }
  }

  /* ----------------------------------------------------------------
     Har bir tuman uchun "Tabelni yuklab olish" — rasmdagi ko'rinishga
     mos oylik davomat tabeli (.xlsx).

     TAXMIN QILINGAN "davomat" jadvali ustunlari (o'z bazangizga qarab
     moslashtiring):
       - tuman_id   -> qaysi tumanga tegishli
       - full_name  -> F.I.Sh
       - lavozim    -> Lavozimi
       - sana       -> "YYYY-MM-DD" formatidagi sana
       - holat      -> "keldi" | "kelmadi"
       - vaqt       -> "keldi" bo'lsa kelish vaqti, masalan "07:44"
  ---------------------------------------------------------------- */
  async function downloadTabelForDistrict(district) {
    setTabelDownloadingId(district.id);
    setTabelErrorsById((prev) => {
      const next = { ...prev };
      delete next[district.id];
      return next;
    });

    try {
      const now = new Date();
      const year = now.getFullYear();
      const monthIndex = now.getMonth(); // 0-11
      const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();

      const monthStartStr = `${year}-${String(monthIndex + 1).padStart(2, "0")}-01`;
      const monthEndStr = `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(
        daysInMonth
      ).padStart(2, "0")}`;

      const { data: rows, error: fetchErr } = await supabase
        .from("davomat")
        .select("*")
        .eq("tuman_id", district.id)
        .gte("sana", monthStartStr)
        .lte("sana", monthEndStr);

      if (fetchErr) throw fetchErr;

      // VAQTINCHALIK: "davomat" jadvalidagi haqiqiy ustun nomlarini
      // aniqlash uchun. Konsolda (F12 -> Console) chiqqan obyektni
      // ko'chirib yuboring, shundan keyin quyidagi ustun nomlarini
      // (full_name, lavozim, sana, holat, vaqt) to'g'rilaymiz.
      if (rows && rows.length > 0) {
        console.log("davomat jadvalidagi bitta qator namunasi:", rows[0]);
      } else {
        console.log("Bu tuman uchun 'davomat' jadvalida joriy oyda hech qanday yozuv topilmadi.");
      }

      // --- Xodimlar ro'yxatini va har biri uchun kunlik holatni yig'amiz ---
      // structure: { "F.I.Sh|Lavozimi": { name, lavozim, days: { 1: {...}, 2: {...} } } }
      const byEmployee = {};
      for (const row of rows || []) {
        const key = `${row.full_name}|${row.lavozim}`;
        if (!byEmployee[key]) {
          byEmployee[key] = { name: row.full_name, lavozim: row.lavozim, days: {} };
        }
        const dayNum = parseInt(String(row.sana).slice(8, 10), 10);
        byEmployee[key].days[dayNum] = { holat: row.holat, vaqt: row.vaqt };
      }

      const employees = Object.values(byEmployee).sort((a, b) =>
        (a.name || "").localeCompare(b.name || "")
      );

      // --- Excel workbook yaratish ---
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet("Tabel");

      const fixedCols = 3; // T/r, F.I.Sh, Lavozimi
      const totalCols = fixedCols + daysInMonth;

      // Ustun kengliklari
      sheet.getColumn(1).width = 6;
      sheet.getColumn(2).width = 28;
      sheet.getColumn(3).width = 20;
      for (let d = 1; d <= daysInMonth; d++) {
        sheet.getColumn(fixedCols + d).width = 8;
      }

      const greenBorder = {
        top: { style: "medium", color: { argb: "FF16A34A" } },
        left: { style: "medium", color: { argb: "FF16A34A" } },
        bottom: { style: "medium", color: { argb: "FF16A34A" } },
        right: { style: "medium", color: { argb: "FF16A34A" } },
      };
      const thinBorder = {
        top: { style: "thin", color: { argb: "FFD0D5DD" } },
        left: { style: "thin", color: { argb: "FFD0D5DD" } },
        bottom: { style: "thin", color: { argb: "FFD0D5DD" } },
        right: { style: "thin", color: { argb: "FFD0D5DD" } },
      };

      // --- 1-qator: sarlavha ("Avgust oyi uchun TABEL – 2026") ---
      sheet.mergeCells(1, 1, 1, totalCols);
      const titleCell = sheet.getCell(1, 1);
      titleCell.value = `${UZ_MONTHS[monthIndex]} oyi uchun TABEL – ${year}`;
      titleCell.font = { bold: true, size: 13 };
      titleCell.alignment = { horizontal: "center", vertical: "middle" };
      titleCell.border = greenBorder;
      sheet.getRow(1).height = 24;

      // --- 2-qator: "Oy kunlari" (kun ustunlari ustida) ---
      sheet.mergeCells(2, fixedCols + 1, 2, totalCols);
      const oyKunlariCell = sheet.getCell(2, fixedCols + 1);
      oyKunlariCell.value = "Oy kunlari";
      oyKunlariCell.font = { bold: true };
      oyKunlariCell.alignment = { horizontal: "center", vertical: "middle" };

      // --- 3-qator: sarlavhalar (T/r, F.I.Sh, Lavozimi, 1, 2, 3 ...) ---
      const headerRow = sheet.getRow(3);
      headerRow.getCell(1).value = "T/r";
      headerRow.getCell(2).value = "F.I.Sh";
      headerRow.getCell(3).value = "Lavozimi";
      for (let d = 1; d <= daysInMonth; d++) {
        headerRow.getCell(fixedCols + d).value = d;
      }
      headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        if (colNumber <= totalCols) {
          cell.font = { bold: true };
          cell.alignment = { horizontal: "center", vertical: "middle" };
          cell.border = thinBorder;
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFF2F4F7" },
          };
        }
      });

      // --- Ma'lumot qatorlari ---
      employees.forEach((emp, index) => {
        const row = sheet.getRow(4 + index);
        row.getCell(1).value = index + 1;
        row.getCell(2).value = emp.name;
        row.getCell(3).value = emp.lavozim;

        for (let d = 1; d <= daysInMonth; d++) {
          const cell = row.getCell(fixedCols + d);
          const dayData = emp.days[d];

          if (!dayData) {
            cell.value = "-";
          } else if (dayData.holat === "keldi") {
            cell.value = dayData.vaqt || "Keldi";
          } else {
            cell.value = "Kelmagan";
            cell.font = { color: { argb: "FF16A34A" } };
          }
          cell.alignment = { horizontal: "center", vertical: "middle" };
        }

        row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
          if (colNumber <= totalCols) cell.border = thinBorder;
        });
      });

      // --- Faylni yuklab olish ---
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute(
        "download",
        `Tabel_${district.name}_${UZ_MONTHS[monthIndex]}_${year}.xlsx`
      );
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (e) {
      // Haqiqiy xato tafsilotini konsolga chiqaramiz — devtools'dagi
      // Console bo'limida to'liq xabarni ko'rasiz (masalan, "davomat"
      // jadvalida mavjud bo'lmagan ustun nomi haqida xabar).
      console.error("Tabel yuklab olishda xatolik:", e);
      const rawMessage = e && (e.message || e.details || e.hint);
      setTabelErrorsById((prev) => ({
        ...prev,
        [district.id]: rawMessage
          ? `Xatolik: ${rawMessage}`
          : "Tabelni yuklab olishda xatolik yuz berdi.",
      }));
    } finally {
      setTabelDownloadingId(null);
    }
  }

  return (
    <AppShell active="tumanlar" onNavigate={onNavigate} session={session} onSignOut={onSignOut}>
      <div className="km-page-header">
        <div>
          <h2>Tumanlar ro'yxati</h2>
          <p>Viloyatdagi tumanlarni ko'rsatish va tahlil qilish</p>
        </div>
        <div className="km-header-actions">
          <div className="km-daterange">
            <Calendar size={15} color="#667085" />
            Oxirgi 7 kun
            <ChevronDown size={14} color="#98a2b3" />
          </div>
          <button
            className="km-btn-primary"
            type="button"
            onClick={downloadMonthlyReport}
            disabled={downloading}
          >
            <Download size={15} />
            {downloading ? "Tayyorlanmoqda..." : "Hisobotni yuklab olish"}
          </button>
        </div>
      </div>

      {downloadError && (
        <p style={{ color: "#e13a3a", marginTop: 8, marginBottom: 0 }}>{downloadError}</p>
      )}

      {/* Summary cards */}
      <div className="km-summary-grid">
        {SUMMARY.map((s) => (
          <SummaryCard key={s.label} item={s} />
        ))}
      </div>

      {/* Filters */}
      <div className="km-card km-filter-bar">
        <div className="km-filter-field km-filter-search">
          <Search size={15} color="#98a2b3" />
          <input
            type="text"
            placeholder="Tuman nomi bo'yicha qidirish..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setPage(1);
            }}
          />
        </div>

        <div className="km-filter-field">
          <label>Davomat bo'yicha filtr</label>
          <div className="km-filter-select-wrap">
            <select
              className="km-native-select"
              value={attendanceFilter}
              onChange={(e) => {
                setAttendanceFilter(e.target.value);
                setPage(1);
              }}
            >
              <option value="barchasi">Barchasi</option>
              <option value="yuqori">Yuqori (85%+)</option>
              <option value="orta">O'rtacha (70-84%)</option>
              <option value="past">Past (&lt;70%)</option>
            </select>
            <ChevronDown className="km-select-chevron" size={14} color="#98a2b3" />
          </div>
        </div>

        <div className="km-filter-field">
          <label>Holat bo'yicha</label>
          <div className="km-filter-select-wrap">
            <select
              className="km-native-select"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
            >
              <option value="barchasi">Barchasi</option>
              <option value="Yaxshi">Yaxshi</option>
              <option value="O'rtacha">O'rtacha</option>
              <option value="Past">Past</option>
            </select>
            <ChevronDown className="km-select-chevron" size={14} color="#98a2b3" />
          </div>
        </div>

        <button
          className="km-btn-secondary km-filter-clear"
          type="button"
          onClick={() => {
            setSearchTerm("");
            setAttendanceFilter("barchasi");
            setStatusFilter("barchasi");
            setPage(1);
          }}
        >
          <RefreshCw size={14} />
          Filterlarni tozalash
        </button>
      </div>

      {/* Table */}
      <div className="km-card km-table-card">
        {loading ? (
          <p style={{ padding: "24px", textAlign: "center", color: "#98a2b3" }}>
            Yuklanmoqda...
          </p>
        ) : error ? (
          <p style={{ padding: "24px", textAlign: "center", color: "#e13a3a" }}>{error}</p>
        ) : (
          <>
            <table className="km-table km-districts-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Tuman nomi</th>
                  <th>O'quvchilar soni</th>
                  <th>Faol to'garaklar</th>
                  <th>O'rtacha davomat</th>
                  <th>Holat</th>
                  <th>Trend (haftalik)</th>
                  <th>Amallar</th>
                </tr>
              </thead>
              <tbody>
                {pagedDistricts.map((d) => (
                  <tr key={d.id}>
                    <td className="muted">{d.rank}</td>
                    <td>
                      <span className="km-district-link">{d.name}</span>
                    </td>
                    <td>{d.students.toLocaleString("ru-RU")}</td>
                    <td>{d.clubs}</td>
                    <td>{d.attendance}%</td>
                    <td>
                      <span className={`km-tag ${STATUS_TONE[d.status]}`}>{d.status}</span>
                    </td>
                    <td>
                      <Sparkline data={d.sparkData} trendKey={d.trendKey} />
                    </td>
                    <td>
                      <div className="km-row-actions" style={{ position: "relative" }}>
                        <button
                          className="km-btn-secondary km-detail-btn"
                          type="button"
                          onClick={() => openDistrictDetail(d)}
                        >
                          Batafsil
                          <ChevronRight size={14} />
                        </button>
                        <button
                          className="km-btn-secondary km-tabel-btn"
                          type="button"
                          disabled={tabelDownloadingId === d.id}
                          onClick={() => downloadTabelForDistrict(d)}
                        >
                          <Download size={14} />
                          {tabelDownloadingId === d.id ? "Tayyorlanmoqda..." : "Tabel"}
                        </button>
                        <button className="km-icon-btn" type="button" aria-label="Ko'proq">
                          <MoreVertical size={16} />
                        </button>

                        {tabelErrorsById[d.id] && (
                          <div
                            style={{
                              position: "absolute",
                              top: "100%",
                              right: 0,
                              marginTop: 6,
                              maxWidth: 320,
                              background: "#fef3f2",
                              border: "1px solid #fda29b",
                              color: "#b42318",
                              fontSize: 12,
                              padding: "8px 10px",
                              borderRadius: 8,
                              zIndex: 20,
                              whiteSpace: "normal",
                            }}
                          >
                            {tabelErrorsById[d.id]}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}

                {pagedDistricts.length === 0 && (
                  <tr>
                    <td colSpan={8} style={{ textAlign: "center", padding: "24px", color: "#98a2b3" }}>
                      Hech narsa topilmadi
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            <div className="km-table-footer">
              <span className="km-table-count">Jami {filteredDistricts.length} ta tuman</span>

              <div className="km-pagination">
                <button
                  className="km-page-btn"
                  type="button"
                  disabled={page === 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft size={15} />
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                  <button
                    key={p}
                    className={`km-page-btn ${page === p ? "active" : ""}`}
                    type="button"
                    onClick={() => setPage(p)}
                  >
                    {p}
                  </button>
                ))}
                <button
                  className="km-page-btn"
                  type="button"
                  disabled={page === totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  <ChevronRight size={15} />
                </button>
              </div>

              <div className="km-page-size">
                Har sahifada
                <div className="km-filter-select km-page-size-select">
                  {pageSize}
                  <ChevronDown size={13} color="#98a2b3" />
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      <div className="km-footer">
        <span>&copy; 2024 Kelajak Markazi. Barcha huquqlar himoyalangan.</span>
        <span>Versiya 1.0.0</span>
      </div>

      <DistrictDetailModal
        district={selectedDistrict}
        loading={detailLoading}
        error={detailError}
        students={studentAttendance}
        onClose={closeDistrictDetail}
      />
    </AppShell>
  );
}