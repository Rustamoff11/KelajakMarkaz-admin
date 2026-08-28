import { useState } from "react";
import { supabase } from "../supabaseClient";
import Ornament from "../components/Ornament";

export default function MfaVerify({ factorId, onVerified, onSignOut }) {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
      factorId,
    });

    if (challengeError) {
      setLoading(false);
      setError(challengeError.message);
      return;
    }

    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challenge.id,
      code: code.trim(),
    });

    setLoading(false);

    if (verifyError) {
      setError("Kod noto'g'ri. Qaytadan urinib ko'ring.");
      return;
    }

    onVerified();
  }

  return (
    <div className="auth-screen">
      <Ornament className="auth-ornament top-right" />
      <Ornament className="auth-ornament bottom-left" />
      <div className="auth-card">
        <div className="auth-eyebrow">Xavfsizlik tekshiruvi</div>
        <h1 className="auth-title">Tasdiqlash kodini kiriting</h1>
        <p className="auth-subtitle">
          Avtentifikator ilovangizdagi 6 xonali kodni kiriting.
        </p>

        {error && <div className="alert-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="otp">Tasdiqlash kodi</label>
            <input
              id="otp"
              className="otp-input"
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              placeholder="000000"
              autoFocus
              required
            />
          </div>
          <button className="btn-primary" type="submit" disabled={loading || code.length < 6}>
            {loading ? "Tekshirilmoqda..." : "Tasdiqlash"}
          </button>
        </form>

        <button className="btn-link" style={{ marginTop: 18 }} onClick={onSignOut}>
          Chiqish
        </button>
      </div>
    </div>
  );
}
