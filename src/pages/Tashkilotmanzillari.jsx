import React, { useState, useEffect, useCallback } from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  MapPin,
  Filter,
  X,
  Search,
  Loader2,
  Lock,
} from "lucide-react";
import AppShell from "./AppShell"; // <-- Dashboard.jsx dagi bilan bir xil yo'l
import { supabase } from "../supabaseClient";
import "./TashkilotManzillari.css";

/* ------------------------------------------------------------------ */
/*  Supabase — HAQIQIY jadval strukturasi (tekshirilgan):              */
/*                                                                      */
/*  maktablar            (id, tuman_id, nomi, raqami, is_markaz)        */
/*  tumanlar             (id, name, is_shahar)                          */
/*  tashkilot_manzillari (id, maktab_id UNIQUE, latitude, longitude,    */
/*                         radius_metr default 100, tuman_id)           */
/*                                                                      */
/*  Eslatma: bu jadvalda matnli "manzil" ustuni YO'Q — faqat            */
/*  koordinata (latitude/longitude) va radius_metr bor.                 */
/* ------------------------------------------------------------------ */

const TABLE_NAME = "tashkilot_manzillari";

/* ------------------------------------------------------------------ */
/*  Bo'limni ochish uchun maxsus parol                                  */
/*  DIQQAT: bu parol faqat frontend (JS) kodida saqlanadi, ya'ni        */
/*  brauzer devtools orqali ko'rish mumkin — haqiqiy xavfsizlik emas,   */
/*  faqat oddiy ekranlovchi to'siq (gate) sifatida ishlaydi.            */
/* ------------------------------------------------------------------ */
const ACCESS_PASSWORD = "199719772003";

/** Barcha tumanlar ro'yxatini olib keladi (filtr va modal uchun) */
async function fetchTumanlarApi() {
  const { data, error } = await supabase
    .from("tumanlar")
    .select("id, name")
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return data;
}

/**
 * Maktablar ro'yxatini tashkilot_manzillari + maktablar + tumanlar
 * jadvallarini birlashtirib olib keladi.
 * holat === "Joylashuv biriktirilmagan" -> latitude/longitude NULL bo'lganlar
 * holat === "Joylashuv biriktirilgan"   -> latitude/longitude to'ldirilganlar
 *
 * MUHIM (tartib haqida): oldingi versiyada natija
 * "tashkilot_manzillari.maktab_id" (UUID) bo'yicha saralanardi — bu esa
 * ekranda maktablarni tasodifiy tartibda (masalan f3a1..., 09b2..., ...)
 * chiqarardi, "1, 2, 3, 4, 5" kabi tabiiy tartibda EMAS.
 * Endi "maktablar" jadvalidagi "raqami" ustunini ham so'raymiz va
 * natijani shu raqam bo'yicha (tanlangan tuman ichida) o'sish tartibida
 * qayta tartiblab beramiz.
 */
async function fetchSchoolsApi({ tumanId, holat }) {
  let query = supabase.from(TABLE_NAME).select(`
    id,
    maktab_id,
    tuman_id,
    latitude,
    longitude,
    radius_metr,
    maktablar ( nomi, raqami ),
    tumanlar ( name )
  `);

  if (tumanId) {
    query = query.eq("tuman_id", tumanId);
  }

  if (holat === "Joylashuv biriktirilmagan") {
    query = query.is("latitude", null);
  } else if (holat === "Joylashuv biriktirilgan") {
    query = query.not("latitude", "is", null);
  }

  // DIQQAT: bazadan buyurtma olishga tayanmaymiz (UUID bo'yicha saralash
  // ma'nosiz tartib beradi) — pastda natijani "raqami" bo'yicha o'zimiz
  // qayta tartiblaymiz, shuning uchun bu yerda .order() chaqirilmaydi.
  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const royxat = data.map((row) => ({
    id: row.id, // tashkilot_manzillari.id — update shu bo'yicha bo'ladi
    maktabId: row.maktab_id,
    name: row.maktablar?.nomi ?? "—",
    raqami: row.maktablar?.raqami ?? null, // maktabning tartib raqami (1,2,3...)
    tumanId: row.tuman_id,
    tumanName: row.tumanlar?.name ?? "—",
    lat: row.latitude,
    lng: row.longitude,
    radius: row.radius_metr,
  }));

  // Tartiblash: "raqami" mavjud bo'lganlar o'sish tartibida (1,2,3,4,5...);
  // raqami bo'lmagan (null) yozuvlar ro'yxat oxirida, nomi bo'yicha.
  royxat.sort((a, b) => {
    const aBor = a.raqami !== null && a.raqami !== undefined && a.raqami !== "";
    const bBor = b.raqami !== null && b.raqami !== undefined && b.raqami !== "";
    if (aBor && bBor) {
      const aSon = Number(a.raqami);
      const bSon = Number(b.raqami);
      if (!Number.isNaN(aSon) && !Number.isNaN(bSon)) return aSon - bSon;
      return String(a.raqami).localeCompare(String(b.raqami), "uz", { numeric: true });
    }
    if (aBor) return -1; // raqami borlar oldinda
    if (bBor) return 1;
    return a.name.localeCompare(b.name, "uz"); // ikkalasida ham yo'q — nomi bo'yicha
  });

  return royxat;
}

/**
 * Bitta maktabning koordinatalarini (va zarur bo'lsa tumanini/radiusini)
 * tashkilot_manzillari jadvaliga saqlaydi.
 */
async function saveSchoolAddressApi(id, payload) {
  const { data, error } = await supabase
    .from(TABLE_NAME)
    .update({
      tuman_id: payload.tumanId,
      latitude: payload.lat,
      longitude: payload.lng,
      radius_metr: payload.radius,
    })
    .eq("id", id)
    .select(`
      id,
      maktab_id,
      tuman_id,
      latitude,
      longitude,
      radius_metr,
      maktablar ( nomi, raqami ),
      tumanlar ( name )
    `)
    .single();

  if (error) throw new Error(error.message);

  return {
    id: data.id,
    maktabId: data.maktab_id,
    name: data.maktablar?.nomi ?? "—",
    raqami: data.maktablar?.raqami ?? null,
    tumanId: data.tuman_id,
    tumanName: data.tumanlar?.name ?? "—",
    lat: data.latitude,
    lng: data.longitude,
    radius: data.radius_metr,
  };
}

/* ------------------------------------------------------------------ */
/*  Statik ma'lumotlar (faqat holat filtri statik, tumanlar bazadan)    */
/* ------------------------------------------------------------------ */

const HOLATLAR = ["Joylashuv biriktirilmagan", "Joylashuv biriktirilgan"];

/** Yozuvga qarab "Biriktirilgan"/"Biriktirilmagan" holatini aniqlaydi */
function resolveStatus(school) {
  const hasCoords =
    school.lat !== null &&
    school.lat !== undefined &&
    school.lng !== null &&
    school.lng !== undefined &&
    !Number.isNaN(Number(school.lat)) &&
    !Number.isNaN(Number(school.lng));
  return hasCoords ? "Biriktirilgan" : "Biriktirilmagan";
}

/* ------------------------------------------------------------------ */
/*  Parol qulfi — bo'lim ochilishidan oldin ko'rsatiladigan ekran       */
/* ------------------------------------------------------------------ */

function PasswordGate({ onUnlock }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [shake, setShake] = useState(false);

  function handleSubmit(e) {
    e.preventDefault();
    if (value === ACCESS_PASSWORD) {
      setError("");
      onUnlock();
    } else {
      setError("Parol noto'g'ri, qayta urinib ko'ring");
      setShake(true);
      setTimeout(() => setShake(false), 400);
    }
  }

  return (
    <div className="tm-gate-overlay">
      <form className={`tm-gate-card${shake ? " tm-gate-shake" : ""}`} onSubmit={handleSubmit}>
        <div className="tm-gate-icon">
          <Lock size={22} />
        </div>
        <h3>Bo'lim himoyalangan</h3>
        <p>Ushbu bo'limni ochish uchun maxsus kodni kiriting</p>
        <input
          type="password"
          autoFocus
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            if (error) setError("");
          }}
          placeholder="Maxsus kod"
          className={error ? "tm-error" : ""}
        />
        {error && <p className="tm-error-text">{error}</p>}
        <button type="submit" className="km-btn-primary tm-gate-btn">
          Ochish
        </button>
      </form>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Address modal — Tuman + Latitude / Longitude / Radius              */
/* ------------------------------------------------------------------ */

function AddressModal({ school, tumanlarList, onClose, onSave, isSaving }) {
  const [tumanId, setTumanId] = useState(school.tumanId || "");
  const [lat, setLat] = useState(school.lat ?? "");
  const [lng, setLng] = useState(school.lng ?? "");
  const [radius, setRadius] = useState(school.radius ?? 100);
  const [errors, setErrors] = useState({});

  function validate() {
    const next = {};
    if (!tumanId) next.tuman = "Tumanni tanlang";
    const latNum = parseFloat(lat);
    const lngNum = parseFloat(lng);
    if (lat === "" || Number.isNaN(latNum) || latNum < -90 || latNum > 90) {
      next.lat = "Kenglik -90..90 oralig'ida bo'lishi kerak";
    }
    if (lng === "" || Number.isNaN(lngNum) || lngNum < -180 || lngNum > 180) {
      next.lng = "Uzunlik -180..180 oralig'ida bo'lishi kerak";
    }
    const radiusNum = parseInt(radius, 10);
    if (radius === "" || Number.isNaN(radiusNum) || radiusNum <= 0) {
      next.radius = "Radius musbat son bo'lishi kerak";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function handleSave() {
    if (!validate()) return;
    onSave({
      id: school.id,
      tumanId,
      lat: parseFloat(lat),
      lng: parseFloat(lng),
      radius: parseInt(radius, 10),
    });
  }

  return (
    <div
      className="tm-modal-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="tm-modal">
        <div className="tm-modal-head">
          <div>
            <h3>Tashkilot manzilini kiritish</h3>
          </div>
          <button type="button" className="tm-icon-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="tm-modal-body">
          <div className="tm-field">
            <label>Tuman</label>
            <div className="tm-select-wrap">
              <select
                value={tumanId}
                onChange={(e) => setTumanId(e.target.value)}
                className={errors.tuman ? "tm-error" : ""}
              >
                <option value="" disabled>
                  Tumanni tanlang
                </option>
                {tumanlarList.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              <ChevronDown size={15} className="tm-select-chevron" />
            </div>
            {errors.tuman && <p className="tm-error-text">{errors.tuman}</p>}
          </div>

          <div className="tm-field-row">
            <div className="tm-field">
              <label>Latitude (kenglik)</label>
              <input
                type="number"
                step="0.000001"
                value={lat}
                onChange={(e) => setLat(e.target.value)}
                placeholder="40.386700"
                className={errors.lat ? "tm-error" : ""}
              />
              {errors.lat && <p className="tm-error-text">{errors.lat}</p>}
            </div>
            <div className="tm-field">
              <label>Longitude (uzunlik)</label>
              <input
                type="number"
                step="0.000001"
                value={lng}
                onChange={(e) => setLng(e.target.value)}
                placeholder="71.783300"
                className={errors.lng ? "tm-error" : ""}
              />
              {errors.lng && <p className="tm-error-text">{errors.lng}</p>}
            </div>
          </div>

          <div className="tm-field">
            <label>Radius (metr)</label>
            <input
              type="number"
              step="1"
              value={radius}
              onChange={(e) => setRadius(e.target.value)}
              placeholder="100"
              className={errors.radius ? "tm-error" : ""}
            />
            {errors.radius && <p className="tm-error-text">{errors.radius}</p>}
          </div>

          <p className="tm-hint">
            <MapPin size={14} />
            Koordinatalarni Google Xaritalar orqali topib, shu yerga kiriting.
          </p>
        </div>

        <div className="tm-modal-footer">
          <button type="button" className="km-btn-secondary" onClick={onClose} disabled={isSaving}>
            Bekor qilish
          </button>
          <button type="button" className="km-btn-primary" onClick={handleSave} disabled={isSaving}>
            {isSaving ? "Saqlanmoqda..." : "Saqlash"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main page — plugs into the shared AppShell, same as Dashboard.jsx  */
/* ------------------------------------------------------------------ */

export default function TashkilotManzillari({ session, onSignOut, onNavigate }) {
  const [unlocked, setUnlocked] = useState(false);

  const [schools, setSchools] = useState([]);
  const [tumanlarList, setTumanlarList] = useState([]);
  const [tumanFilter, setTumanFilter] = useState(""); // tuman_id
  const [holatFilter, setHolatFilter] = useState("Joylashuv biriktirilmagan");
  const [activeSchool, setActiveSchool] = useState(null);
  const [toast, setToast] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // Tumanlar ro'yxatini bir marta bazadan olib kelamiz — faqat parol
  // to'g'ri kiritilgandan keyin (bekorga so'rov yubormaslik uchun)
  useEffect(() => {
    if (!unlocked) return;
    fetchTumanlarApi()
      .then((list) => {
        setTumanlarList(list);
        if (list.length > 0) setTumanFilter(list[0].id);
      })
      .catch(() => setLoadError("Tumanlar ro'yxatini yuklashda xatolik"));
  }, [unlocked]);

  const loadSchools = useCallback(async () => {
    if (!tumanFilter) return;
    setIsLoading(true);
    setLoadError("");
    try {
      const data = await fetchSchoolsApi({ tumanId: tumanFilter, holat: holatFilter });
      setSchools(Array.isArray(data) ? data : []);
    } catch (err) {
      setLoadError("Ma'lumotlarni yuklashda xatolik yuz berdi");
    } finally {
      setIsLoading(false);
    }
  }, [tumanFilter, holatFilter]);

  useEffect(() => {
    if (!unlocked) return;
    loadSchools();
  }, [unlocked, loadSchools]);

  async function handleSave(payload) {
    setIsSaving(true);
    try {
      const updated = await saveSchoolAddressApi(payload.id, payload);
      setSchools((prev) =>
        prev.map((s) => (s.id === payload.id ? { ...s, ...updated } : s))
      );
      setActiveSchool(null);
      setToast("Manzil muvaffaqiyatli saqlandi");
      setTimeout(() => setToast(""), 2500);
      // Holat o'zgargani uchun (masalan "biriktirilmagan"dan chiqib ketishi
      // mumkin), ro'yxatni bazadan qayta so'raymiz (bu ham raqami bo'yicha
      // qayta tartiblanadi)
      loadSchools();
    } catch (err) {
      setToast("Saqlashda xatolik yuz berdi, qayta urinib ko'ring");
      setTimeout(() => setToast(""), 3000);
    } finally {
      setIsSaving(false);
    }
  }

  // Parol hali kiritilmagan bo'lsa, faqat qulf ekranini ko'rsatamiz —
  // AppShell va jadval umuman render qilinmaydi
  if (!unlocked) {
    return (
      <AppShell active="tashkilot-manzillari" onNavigate={onNavigate} onSignOut={onSignOut}>
        <PasswordGate onUnlock={() => setUnlocked(true)} />
      </AppShell>
    );
  }

  // Server tomonda tuman/holat bo'yicha filtrlangan va "raqami" bo'yicha
  // tartiblangan holda keladi, shu yerda faqat ro'yxatni chiqaramiz
  const filtered = schools;

  return (
    <AppShell active="tashkilot-manzillari" onNavigate={onNavigate} onSignOut={onSignOut}>
      <div className="km-page-header">
        <div>
          <h2>Tashkilot manzili kiritish</h2>
          <p>Maktablarning aniq joylashuvini (koordinatalarini) kiriting</p>
        </div>
      </div>

      {/* Filters */}
      <div className="km-card tm-filters">
        <p className="tm-section-title">Filtrlar</p>
        <div className="tm-filters-row">
          <div className="tm-field">
            <label>Tuman</label>
            <div className="tm-select-wrap">
              <select value={tumanFilter} onChange={(e) => setTumanFilter(e.target.value)}>
                {tumanlarList.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              <ChevronDown size={15} className="tm-select-chevron" />
            </div>
          </div>

          <div className="tm-field">
            <label>Holat</label>
            <div className="tm-select-wrap">
              <select value={holatFilter} onChange={(e) => setHolatFilter(e.target.value)}>
                {HOLATLAR.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
              <ChevronDown size={15} className="tm-select-chevron" />
            </div>
          </div>

          <button type="button" className="km-btn-primary" onClick={loadSchools} disabled={isLoading}>
            <Filter size={15} />
            {isLoading ? "Yuklanmoqda..." : "Filtrlash"}
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="km-card tm-table-card">
        <div className="tm-table-head">
          <p className="tm-section-title">Maktablar ro'yxati</p>
          <span className="tm-count-badge">{filtered.length} ta</span>
        </div>

        <table className="km-table">
          <thead>
            <tr>
              <th>№</th>
              <th>Maktab nomi</th>
              <th>Manzil holati</th>
              <th>Latitude</th>
              <th>Longitude</th>
              <th>Amallar</th>
            </tr>
          </thead>
          <tbody>
            {!isLoading && !loadError &&
              filtered.map((s, idx) => {
                const status = resolveStatus(s);
                return (
                  <tr key={s.id}>
                    <td className="muted">{idx + 1}</td>
                    <td>{s.name}</td>
                    <td>
                      <span className={`tm-status-tag ${status === "Biriktirilgan" ? "green" : "red"}`}>
                        {status}
                      </span>
                    </td>
                    <td className="muted">
                      {s.lat !== null && s.lat !== undefined ? Number(s.lat).toFixed(6) : "—"}
                    </td>
                    <td className="muted">
                      {s.lng !== null && s.lng !== undefined ? Number(s.lng).toFixed(6) : "—"}
                    </td>
                    <td>
                      <button type="button" className="tm-outline-btn" onClick={() => setActiveSchool(s)}>
                        <MapPin size={14} />
                        Manzil kiritish
                      </button>
                    </td>
                  </tr>
                );
              })}

            {isLoading && (
              <tr>
                <td colSpan={6} className="tm-empty">
                  <Loader2 size={18} className="tm-spin" />
                  Yuklanmoqda...
                </td>
              </tr>
            )}

            {!isLoading && loadError && (
              <tr>
                <td colSpan={6} className="tm-empty">
                  {loadError}
                </td>
              </tr>
            )}

            {!isLoading && !loadError && filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="tm-empty">
                  <Search size={18} />
                  Natija topilmadi
                </td>
              </tr>
            )}
          </tbody>
        </table>

        <div className="tm-pagination">
          <button className="tm-page-btn" type="button">
            <ChevronLeft size={15} />
          </button>
          <button className="tm-page-btn active" type="button">
            1
          </button>
          <button className="tm-page-btn" type="button">
            2
          </button>
          <button className="tm-page-btn" type="button">
            <ChevronRight size={15} />
          </button>
        </div>
      </div>

      {activeSchool && (
        <AddressModal
          school={activeSchool}
          tumanlarList={tumanlarList}
          onClose={() => setActiveSchool(null)}
          onSave={handleSave}
          isSaving={isSaving}
        />
      )}

      {toast && <div className="tm-toast">{toast}</div>}
    </AppShell>
  );
}