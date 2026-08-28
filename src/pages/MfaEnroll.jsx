import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import Ornament from "../components/Ornament";

export default function MfaEnroll({ onEnrolled, onSignOut }) {
  const [factorId, setFactorId] = useState(null);
  const [qrCode, setQrCode] = useState("");
  const [secret, setSecret] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    startEnrollment();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function startEnrollment() {
    setLoading(true);
    setError("");
    const { data, error: enrollError } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: `totp-${Date.now()}`,
    });
    setLoading(false);

    if (enrollError) {
      setError(enrollError.message);
      return;
    }

    setFactorId(data.id);
    setQrCode(data.totp.qr_code);
    setSecret(data.totp.secret);
  }

  async function handleVerify(e) {
    e.preventDefault();
    setError("");
    setVerifying(true);

    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
      factorId,
    });

    if (challengeError) {
      setVerifying(false);
      setError(challengeError.message);
      return;
    }

    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challenge.id,
      code: code.trim(),
    });

    setVerifying(false);

    if (verifyError) {
      setError("Kod noto'g'ri. Ilovadagi 6 xonali kodni qayta tekshiring.");
      return;
    }

    onEnrolled();
  }

  return (
    <div className="auth-screen">
      <Ornament className="auth-ornament top-right" />
      <Ornament className="auth-ornament bottom-left" />
      <div className="auth-card">
        <div className="auth-eyebrow">Xavfsizlik sozlamasi</div>
        <h1 className="auth-title">2 bosqichli tasdiqlashni yoqing</h1>
        <p className="auth-subtitle">
          Super admin hisobi yangi foydalanuvchi yarata olishi uchun avtentifikator ilova
          (Google Authenticator, Authy va h.k.) orqali 2FA yoqilishi shart.
        </p>

        {error && <div className="alert-error">{error}</div>}

        {loading && <p className="loading-line">QR-kod tayyorlanmoqda...</p>}

        {!loading && qrCode && (
          <>
            <div className="qr-box">
              <img src={qrCode} alt="MFA QR kod" width={180} height={180} />
            </div>
            <p className="field-hint" style={{ marginBottom: 8 }}>
              QR-kodni skanerlay olmasangiz, ushbu kalitni ilovaga qo'lda kiriting:
            </p>
            <div className="secret-code">{secret}</div>

            <form onSubmit={handleVerify}>
              <div className="field">
                <label htmlFor="code">Ilovadagi 6 xonali kod</label>
                <input
                  id="code"
                  className="otp-input"
                  inputMode="numeric"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="000000"
                  required
                />
              </div>
              <button className="btn-primary" type="submit" disabled={verifying || code.length < 6}>
                {verifying ? "Tekshirilmoqda..." : "Tasdiqlash va davom etish"}
              </button>
            </form>
          </>
        )}

        <button className="btn-link" style={{ marginTop: 18 }} onClick={onSignOut}>
          Chiqish
        </button>
      </div>
    </div>
  );
}
