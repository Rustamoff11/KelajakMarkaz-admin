import { useState, useRef } from "react";
import { Turnstile } from "@marsidev/react-turnstile";
import { supabase } from "../supabaseClient";
import Ornament from "../components/Ornament";

const MAX_LOKAL_URINISH = 3;
const BLOKLASH_VAQTI_MS = 60_000; // 1 daqiqa

// verify-captcha Edge Function manzili (faqat veb-panel uchun captcha
// tekshiruvi — Supabase'dagi GLOBAL captcha talabi o'chirilgan, shuning
// uchun bu tekshiruv mobil ilovaga ta'sir qilmaydi)
const VERIFY_CAPTCHA_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/verify-captcha`;

export default function Login({ onSignedIn }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [captchaToken, setCaptchaToken] = useState("");
  const [muvaffaqiyatsizSoni, setMuvaffaqiyatsizSoni] = useState(0);
  const [bloklanganGacha, setBloklanganGacha] = useState(null);
  const turnstileRef = useRef(null);
  const yuborilmoqdaRef = useRef(false); // bir vaqtda faqat 1 ta submit

  const hozirBloklangan = bloklanganGacha && Date.now() < bloklanganGacha;

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    // Ikki marta bosilishi yoki React StrictMode tufayli qayta chaqirilishining oldini olamiz
    if (yuborilmoqdaRef.current) return;

    if (hozirBloklangan) {
      const qoldiqSon = Math.ceil((bloklanganGacha - Date.now()) / 1000);
      setError(`Juda ko'p urinish. ${qoldiqSon} soniyadan keyin qayta urinib ko'ring.`);
      return;
    }

    if (!captchaToken) {
      setError("Iltimos, robot emasligingizni tasdiqlang.");
      return;
    }

    yuborilmoqdaRef.current = true;
    setLoading(true);

    // Har bir urinishda tokenni darhol "band qilamiz" — token faqat bir marta
    // ishlatilishi mumkin (Cloudflay bir xil tokenni 2-marta rad etadi)
    const yuborilayotganToken = captchaToken;
    setCaptchaToken("");
    turnstileRef.current?.reset();

    // 1-QADAM: captcha'ni o'zimizning verify-captcha funksiyamiz orqali tekshiramiz
    let captchaTogri = false;
    try {
      const verifyRes = await fetch(VERIFY_CAPTCHA_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: yuborilayotganToken }),
      });

      let verifyData = null;
      try {
        verifyData = await verifyRes.json();
      } catch (parseErr) {
        console.error("verify-captcha javobi JSON emas:", parseErr);
      }

      // Debug uchun — muammoni topgach shu qatorlarni o'chirib tashlang
      console.log("verify-captcha status:", verifyRes.status);
      console.log("verify-captcha body:", verifyData);

      captchaTogri = verifyRes.ok && verifyData?.success === true;

      if (!captchaTogri) {
        console.warn(
          "Captcha rad etildi:",
          verifyData?.error || verifyData?.["error-codes"] || "sabab noma'lum"
        );
      }
    } catch (err) {
      // Bu yerga odatda: CORS xatosi, network xatosi yoki manzil noto'g'ri bo'lsa tushadi
      console.error("verify-captcha so'roviga chiqishda xato (network/CORS):", err);
      captchaTogri = false;
    }

    if (!captchaTogri) {
      setLoading(false);
      yuborilmoqdaRef.current = false;
      setError("Captcha tasdiqlanmadi. Iltimos, qaytadan urinib ko'ring.");
      return;
    }

    // 2-QADAM: captcha to'g'ri bo'lsa, oddiy login
    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    setLoading(false);
    yuborilmoqdaRef.current = false;

    if (signInError) {
      const yangiSon = muvaffaqiyatsizSoni + 1;
      setMuvaffaqiyatsizSoni(yangiSon);

      if (yangiSon >= MAX_LOKAL_URINISH) {
        setBloklanganGacha(Date.now() + BLOKLASH_VAQTI_MS);
        setMuvaffaqiyatsizSoni(0);
        setError(`Juda ko'p noto'g'ri urinish. 1 daqiqa kutib, qayta urinib ko'ring.`);
        return;
      }

      setError(
        signInError.message.includes("Invalid login credentials")
          ? "Email yoki parol noto'g'ri"
          : signInError.message
      );
      return;
    }

    setMuvaffaqiyatsizSoni(0);
    setBloklanganGacha(null);
    onSignedIn(data.session);
  }

  return (
    <div className="auth-screen">
      <Ornament className="auth-ornament top-right" />
      <Ornament className="auth-ornament bottom-left" />
      <div className="auth-card">
        <div className="auth-eyebrow">Farg'ona viloyati</div>
        <h1 className="auth-title">
          Kelajak Markazi
          <br />
          Super Admin panel
        </h1>
        <p className="auth-subtitle">
          Tizimga kirish uchun administrator hisobingiz ma'lumotlarini kiriting.
        </p>

        {error && <div className="alert-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@example.com"
              required
              disabled={hozirBloklangan}
            />
          </div>
          <div className="field">
            <label htmlFor="password">Parol</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              disabled={hozirBloklangan}
            />
          </div>

          <div className="field">
            <Turnstile
              ref={turnstileRef}
              siteKey={import.meta.env.VITE_TURNSTILE_SITE_KEY}
              onSuccess={setCaptchaToken}
              onExpire={() => setCaptchaToken("")}
              options={{ theme: "light" }}
            />
          </div>

          <button
            className="btn-primary"
            type="submit"
            disabled={loading || hozirBloklangan}
          >
            {loading ? "Kirilmoqda..." : "Kirish"}
          </button>
        </form>
      </div>
    </div>
  );
}