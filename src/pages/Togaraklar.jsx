import { useEffect, useState } from "react";
import AppShell from "./AppShell";
// TODO: agar sizning loyihangizda supabase client boshqa joyda bo'lsa,
// quyidagi yo'lni moslashtiring (masalan "../lib/supabaseClient" yoki "@/lib/supabaseClient")
import { supabase } from "../supabaseClient";

function PeopleIcon({ className }) {
  return (
    <svg
      className={className}
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3Zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3Zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5Zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5Z"
        fill="currentColor"
      />
    </svg>
  );
}

export default function Togaraklar({ session, onSignOut, onNavigate, active }) {
  const [tumanlar, setTumanlar] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [selectedTuman, setSelectedTuman] = useState(null);
  const [togaraklar, setTogaraklar] = useState([]);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    loadOverview();
  }, []);

  async function loadOverview() {
    setLoading(true);
    setError(null);
    try {
      const { data: tumanRows, error: tumanErr } = await supabase
        .from("tumanlar")
        .select("id, name, is_shahar")
        .order("name", { ascending: true });
      if (tumanErr) throw tumanErr;

      const { data: togarakRows, error: togarakErr } = await supabase
        .from("togaraklar")
        .select("id, tuman_id");
      if (togarakErr) throw togarakErr;

      const counts = {};
      (togarakRows || []).forEach((t) => {
        counts[t.tuman_id] = (counts[t.tuman_id] || 0) + 1;
      });

      const merged = (tumanRows || []).map((t, idx) => ({
        ...t,
        raqam: idx + 1,
        togarakSoni: counts[t.id] || 0,
      }));

      setTumanlar(merged);
    } catch (err) {
      console.error(err);
      const msg =
        err?.message || err?.error_description || JSON.stringify(err) || "Noma'lum xatolik";
      setError(`Ma'lumotlarni yuklashda xatolik: ${msg}`);
    } finally {
      setLoading(false);
    }
  }

  async function openTuman(tuman) {
    setSelectedTuman(tuman);
    setDetailLoading(true);
    setError(null);
    try {
      const { data: togarakRows, error: togarakErr } = await supabase
        .from("togaraklar")
        .select("id, nomi, mavjud, maktab_id")
        .eq("tuman_id", tuman.id)
        .order("nomi", { ascending: true });
      if (togarakErr) throw togarakErr;

      const ids = (togarakRows || []).map((t) => t.id);
      const countsByTogarak = {};

      if (ids.length > 0) {
        const { data: oquvchiRows, error: oquvchiErr } = await supabase
          .from("oquvchilar")
          .select("togarak_id")
          .in("togarak_id", ids);
        if (oquvchiErr) throw oquvchiErr;

        (oquvchiRows || []).forEach((o) => {
          countsByTogarak[o.togarak_id] = (countsByTogarak[o.togarak_id] || 0) + 1;
        });
      }

      const merged = (togarakRows || []).map((t) => ({
        ...t,
        oquvchilarSoni: countsByTogarak[t.id] || 0,
      }));

      setTogaraklar(merged);
    } catch (err) {
      console.error(err);
      const msg =
        err?.message || err?.error_description || JSON.stringify(err) || "Noma'lum xatolik";
      setError(`To'garaklar ro'yxatini yuklashda xatolik: ${msg}`);
    } finally {
      setDetailLoading(false);
    }
  }

  function backToGrid() {
    setSelectedTuman(null);
    setTogaraklar([]);
    setError(null);
  }

  return (
    <AppShell active={active || "togaraklar"} onNavigate={onNavigate} onSignOut={onSignOut}>
      <style>{`
        .km-tg-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 24px;
          flex-wrap: wrap;
          gap: 12px;
        }
        .km-tg-header h2 {
          font-size: 26px;
          font-weight: 700;
          color: #111827;
          margin: 0 0 4px 0;
        }
        .km-tg-header p {
          font-size: 14px;
          color: #6b7280;
          margin: 0;
        }
        .km-tg-add-btn {
          background: #2563eb;
          color: #fff;
          border: none;
          border-radius: 10px;
          padding: 11px 18px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 8px;
        }
        .km-tg-add-btn:hover {
          background: #1d4ed8;
        }
        .km-tg-grid {
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 16px;
        }
        @media (max-width: 1200px) {
          .km-tg-grid { grid-template-columns: repeat(3, 1fr); }
        }
        @media (max-width: 768px) {
          .km-tg-grid { grid-template-columns: repeat(2, 1fr); }
        }
        .km-tg-card {
          background: #fff;
          border-radius: 16px;
          border: 1px solid #eef0f4;
          box-shadow: 0 1px 2px rgba(16, 24, 40, 0.04);
          padding: 18px;
          position: relative;
          cursor: pointer;
          transition: box-shadow 0.15s ease, transform 0.15s ease;
        }
        .km-tg-card:hover {
          box-shadow: 0 6px 16px rgba(16, 24, 40, 0.08);
          transform: translateY(-2px);
        }
        .km-tg-badge {
          position: absolute;
          top: 14px;
          left: 14px;
          width: 22px;
          height: 22px;
          border-radius: 50%;
          background: #2563eb;
          color: #fff;
          font-size: 12px;
          font-weight: 700;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .km-tg-name {
          margin: 4px 0 14px 30px;
          font-size: 15px;
          font-weight: 600;
          color: #1f2937;
        }
        .km-tg-icon {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          background: #eaf1ff;
          color: #2563eb;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 10px;
        }
        .km-tg-count {
          font-size: 24px;
          font-weight: 700;
          color: #111827;
          line-height: 1.1;
        }
        .km-tg-count-label {
          font-size: 12px;
          color: #9ca3af;
          margin-bottom: 10px;
        }
        .km-tg-detail-link {
          font-size: 13px;
          font-weight: 600;
          color: #2563eb;
          background: none;
          border: none;
          padding: 0;
          cursor: pointer;
        }
        .km-tg-back {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: none;
          border: none;
          color: #2563eb;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          margin-bottom: 16px;
          padding: 0;
        }
        .km-tg-detail-card {
          background: #fff;
          border-radius: 16px;
          border: 1px solid #eef0f4;
          overflow: hidden;
        }
        .km-tg-detail-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 20px;
          border-bottom: 1px solid #f1f2f6;
        }
        .km-tg-detail-row:last-child { border-bottom: none; }
        .km-tg-detail-name {
          font-size: 14px;
          font-weight: 600;
          color: #1f2937;
        }
        .km-tg-detail-sub {
          font-size: 12px;
          color: #9ca3af;
          margin-top: 2px;
        }
        .km-tg-count-pill {
          background: #eaf1ff;
          color: #2563eb;
          font-size: 13px;
          font-weight: 700;
          border-radius: 999px;
          padding: 6px 14px;
        }
        .km-tg-empty, .km-tg-error {
          padding: 40px 20px;
          text-align: center;
          color: #6b7280;
          font-size: 14px;
        }
        .km-tg-error { color: #dc2626; }
      `}</style>

      {selectedTuman === null ? (
        <>
          <div className="km-tg-header">
            <div>
              <h2>To'garaklar</h2>
              <p>19 ta tuman bo'yicha to'garaklar tahminiy ko'rinishi</p>
            </div>
            <button className="km-tg-add-btn" type="button" onClick={loadOverview}>
              + Yangi to'garak qo'shish
            </button>
          </div>

          {loading && <div className="km-tg-empty">Yuklanmoqda...</div>}
          {!loading && error && <div className="km-tg-error">{error}</div>}

          {!loading && !error && (
            <div className="km-tg-grid">
              {tumanlar.map((t) => (
                <div key={t.id} className="km-tg-card" onClick={() => openTuman(t)}>
                  <span className="km-tg-badge">{t.raqam}</span>
                  <div className="km-tg-name">{t.name}</div>
                  <div className="km-tg-icon">
                    <PeopleIcon />
                  </div>
                  <div className="km-tg-count">{t.togarakSoni}</div>
                  <div className="km-tg-count-label">to'garak</div>
                  <button
                    className="km-tg-detail-link"
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      openTuman(t);
                    }}
                  >
                    Batafsil →
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <button className="km-tg-back" type="button" onClick={backToGrid}>
            ← Barcha tumanlar
          </button>

          <div className="km-tg-header">
            <div>
              <h2>{selectedTuman.name}</h2>
              <p>Tuman bo'yicha to'garaklar ro'yxati va o'quvchilar soni</p>
            </div>
          </div>

          {detailLoading && <div className="km-tg-empty">Yuklanmoqda...</div>}
          {!detailLoading && error && <div className="km-tg-error">{error}</div>}

          {!detailLoading && !error && (
            <div className="km-tg-detail-card">
              {togaraklar.length === 0 ? (
                <div className="km-tg-empty">Bu tumanda hali to'garaklar mavjud emas.</div>
              ) : (
                togaraklar.map((tg) => (
                  <div key={tg.id} className="km-tg-detail-row">
                    <div>
                      <div className="km-tg-detail-name">{tg.nomi}</div>
                      <div className="km-tg-detail-sub">
                        {tg.mavjud === false ? "Faol emas" : "Faol"}
                      </div>
                    </div>
                    <span className="km-tg-count-pill">{tg.oquvchilarSoni} o'quvchi</span>
                  </div>
                ))
              )}
            </div>
          )}
        </>
      )}
    </AppShell>
  );
}