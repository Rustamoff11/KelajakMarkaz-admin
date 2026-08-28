import { useEffect, useRef, useState, useCallback } from "react";
import { Bell, X, FileBarChart2, MessageSquare, Loader2, Clock, User } from "lucide-react";
// ⚠️ Loyihangizdagi haqiqiy yo'lga moslang
import { supabase } from "../supabaseClient";
import "./NotificationBell.css";

function formatDateTime(dateStr) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleString("uz-UZ", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const MUROJAAT_HOLAT_LABEL = {
  kutilmoqda: "Kutilmoqda",
  korib_chiqilmoqda: "Ko'rib chiqilmoqda",
  javob_berilgan: "Javob berilgan",
  yopilgan: "Yopilgan",
};

const HISOBOT_HOLAT_LABEL = {
  kutilmoqda: "Kutilmoqda",
  tasdiqlangan: "Tasdiqlangan",
  rad_etilgan: "Rad etilgan",
};

/**
 * Bitta bildirishnoma iconi (Bell). Bosilganda:
 *  - hisobotlar (holat = 'kutilmoqda')
 *  - murojaatlar (holat = 'kutilmoqda' yoki 'korib_chiqilmoqda')
 * jadvallaridan haqiqiy ma'lumotni o'qib, ro'yxat ko'rinishida modal ochadi.
 *
 * onNavigate(key) — ixtiyoriy. Berilsa, bandni bosganda tegishli sahifaga
 * o'tkazadi (masalan "hisobotlar" yoki "murojaatlar"), agar sizda bunday
 * sahifa/route mavjud bo'lsa.
 */
export default function NotificationBell({ onNavigate }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hisobotlar, setHisobotlar] = useState([]);
  const [murojaatlar, setMurojaatlar] = useState([]);
  const [detail, setDetail] = useState(null); // { type: 'murojaat'|'hisobot', item }
  const wrapRef = useRef(null);

  const totalCount = hisobotlar.length + murojaatlar.length;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [hRes, mRes] = await Promise.all([
        supabase
          .from("hisobotlar")
          .select(
            "id, turi, izoh, holat, created_at, fayl_path, tuman_id, yuborgan:yuborgan_id(full_name, phone), tumanlar:tuman_id(name)"
          )
          .eq("holat", "kutilmoqda")
          .order("created_at", { ascending: false })
          .limit(20),
        supabase
          .from("murojaatlar")
          .select(
            "id, mavzu, matni, holat, created_at, tuman_id, yuboruvchi:yuboruvchi_id(full_name, phone), tumanlar:tuman_id(name)"
          )
          .in("holat", ["kutilmoqda", "korib_chiqilmoqda"])
          .order("created_at", { ascending: false })
          .limit(20),
      ]);
      if (hRes.error) throw hRes.error;
      if (mRes.error) throw mRes.error;
      setHisobotlar(hRes.data || []);
      setMurojaatlar(mRes.data || []);
    } catch (e) {
      setError(e.message || "Bildirishnomalarni yuklab bo'lmadi");
    } finally {
      setLoading(false);
    }
  }, []);

  // Dastlabki yuklash + har 60 soniyada yangilab turish
  useEffect(() => {
    load();
    const id = setInterval(load, 60000);
    return () => clearInterval(id);
  }, [load]);

  // Tashqariga bosilganda modalni yopish
  useEffect(() => {
    if (!open) return;
    function onOutside(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    function onEsc(e) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onOutside);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onOutside);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  const handleToggle = () => {
    setOpen((v) => {
      const next = !v;
      if (next) load(); // ochilganda yangilab olamiz
      return next;
    });
  };

  const openDetail = (type, item) => {
    setDetail({ type, item });
  };

  return (
    <div className="km-notif-wrap" ref={wrapRef}>
      <button
        className="km-icon-btn km-badge-icon"
        type="button"
        aria-label="Bildirishnomalar"
        aria-expanded={open}
        onClick={handleToggle}
      >
        <Bell size={18} />
        {totalCount > 0 && <span className="km-badge">{totalCount > 99 ? "99+" : totalCount}</span>}
      </button>

      {open && (
        <div className="km-notif-panel">
          <div className="km-notif-header">
            <h4>Bildirishnomalar</h4>
            {loading && <Loader2 className="km-notif-spin" size={14} />}
          </div>

          <div className="km-notif-body">
            {error && <div className="km-notif-error">{error}</div>}

            {!loading && totalCount === 0 && !error && (
              <div className="km-notif-empty">Yangi bildirishnoma yo'q</div>
            )}

            {hisobotlar.length > 0 && (
              <div className="km-notif-section">
                <div className="km-notif-section-title">
                  Kutilayotgan hisobotlar ({hisobotlar.length})
                </div>
                {hisobotlar.map((h) => (
                  <button
                    key={`h-${h.id}`}
                    className="km-notif-item"
                    onClick={() => openDetail("hisobot", h)}
                  >
                    <FileBarChart2 size={15} className="km-notif-item-icon" />
                    <div>
                      <div className="km-notif-item-title">{h.turi || "Hisobot"}</div>
                      <div className="km-notif-item-sub">
                        {h.yuborgan?.full_name || "Noma'lum"} · {formatDateTime(h.created_at)}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {murojaatlar.length > 0 && (
              <div className="km-notif-section">
                <div className="km-notif-section-title">
                  Javobsiz murojaatlar ({murojaatlar.length})
                </div>
                {murojaatlar.map((m) => (
                  <button
                    key={`m-${m.id}`}
                    className="km-notif-item"
                    onClick={() => openDetail("murojaat", m)}
                  >
                    <MessageSquare size={15} className="km-notif-item-icon" />
                    <div>
                      <div className="km-notif-item-title">{m.mavzu || "Murojaat"}</div>
                      <div className="km-notif-item-sub">
                        {m.yuboruvchi?.full_name || "Noma'lum"} · {formatDateTime(m.created_at)}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {detail && (
        <DetailModal
          type={detail.type}
          item={detail.item}
          onClose={() => setDetail(null)}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  To'liq xabar/hisobot tafsiloti — kim, qachon, to'liq matn          */
/* ------------------------------------------------------------------ */
function DetailModal({ type, item, onClose }) {
  const isMurojaat = type === "murojaat";
  const sender = isMurojaat ? item.yuboruvchi : item.yuborgan;
  const title = isMurojaat ? item.mavzu || "Murojaat" : item.turi || "Hisobot";
  const fullText = isMurojaat ? item.matni : item.izoh;
  const holatLabel = isMurojaat
    ? MUROJAAT_HOLAT_LABEL[item.holat] || item.holat
    : HISOBOT_HOLAT_LABEL[item.holat] || item.holat;

  return (
    <div className="km-notif-modal-overlay" onClick={onClose}>
      <div className="km-notif-modal" onClick={(e) => e.stopPropagation()}>
        <div className="km-notif-modal-header">
          <div className="km-notif-modal-header-icon">
            {isMurojaat ? <MessageSquare size={16} /> : <FileBarChart2 size={16} />}
          </div>
          <div className="km-notif-modal-header-text">
            <h3>{title}</h3>
            <span className={`km-notif-status km-notif-status-${item.holat}`}>{holatLabel}</span>
          </div>
          <button className="km-icon-btn" onClick={onClose} aria-label="Yopish">
            <X size={18} />
          </button>
        </div>

        <div className="km-notif-modal-meta">
          <div className="km-notif-meta-row">
            <User size={14} />
            <span>
              <strong>{sender?.full_name || "Noma'lum foydalanuvchi"}</strong>
              {sender?.phone ? ` · ${sender.phone}` : ""}
            </span>
          </div>
          <div className="km-notif-meta-row">
            <Clock size={14} />
            <span>{formatDateTime(item.created_at)}</span>
          </div>
          {item.tumanlar?.name && (
            <div className="km-notif-meta-row">
              <MessageSquare size={14} style={{ visibility: "hidden" }} />
              <span>{item.tumanlar.name}</span>
            </div>
          )}
        </div>

        <div className="km-notif-modal-body-text">
          {fullText ? fullText : <em>Matn kiritilmagan</em>}
        </div>
      </div>
    </div>
  );
}