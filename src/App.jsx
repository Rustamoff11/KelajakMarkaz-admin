import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import Login from "./pages/Login";
import MfaEnroll from "./pages/MfaEnroll";
import MfaVerify from "./pages/MfaVerify";
import Dashboard from "./pages/Dashboard";
import Rahbarlar from "./pages/Rahbarlar";
import TashkilotManzillari from "./pages/Tashkilotmanzillari";
import Tumanlar from "./pages/Tumanlar";
import Togaraklar from "./pages/Togaraklar";
import Foydalanuvchilar from "./pages/Foydalanuvchilar";
import Sozlamalar from "./pages/Sozlamalar";

// screen: "loading" | "login" | "mfa_enroll" | "mfa_verify" | "dashboard"

// activePage kaliti -> shu sahifani ko'rsatadigan komponent
// AppShell.jsx dagi NAV_ITEMS ichidagi "key" qiymatlari bilan bir xil bo'lishi SHART
const PAGES = {
  dashboard: Dashboard,
  tumanlar: Tumanlar,
  "tashkilot-manzillari": TashkilotManzillari,
  togaraklar: Togaraklar,
  rahbarlar: Rahbarlar,
  foydalanuvchilar: Foydalanuvchilar,
  sozlamalar: Sozlamalar,
};

export default function App() {
  const [screen, setScreen] = useState("loading");
  const [session, setSession] = useState(null);
  const [verifyFactorId, setVerifyFactorId] = useState(null);
  const [activePage, setActivePage] = useState("dashboard");

  useEffect(() => {
    bootstrap();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (!newSession) {
        setSession(null);
        setScreen("login");
      }
    });

    return () => listener.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function bootstrap() {
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      setScreen("login");
      return;
    }
    setSession(data.session);
    await routeByAal();
  }

  async function routeByAal() {
    const { data: aal, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

    if (error) {
      setScreen("login");
      return;
    }

    if (aal.currentLevel === "aal2") {
      const { data: fresh } = await supabase.auth.getSession();
      setSession(fresh.session);
      setScreen("dashboard");
      return;
    }

    if (aal.nextLevel === "aal2") {
      const { data: factorsData } = await supabase.auth.mfa.listFactors();
      const verifiedTotp = factorsData?.totp?.find((f) => f.status === "verified");
      if (verifiedTotp) {
        setVerifyFactorId(verifiedTotp.id);
        setScreen("mfa_verify");
        return;
      }
    }

    setScreen("mfa_enroll");
  }

  async function handleSignedIn(newSession) {
    setSession(newSession);
    await routeByAal();
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    setSession(null);
    setScreen("login");
  }

  // Menyudan bosilganda AppShell shu funksiyani chaqiradi
  function handleNavigate(pageKey) {
    setActivePage(pageKey);
  }

  if (screen === "loading") {
    return (
      <div className="auth-screen">
        <p className="loading-line" style={{ color: "rgba(255,255,255,0.7)" }}>
          Yuklanmoqda...
        </p>
      </div>
    );
  }

  if (screen === "login") {
    return <Login onSignedIn={handleSignedIn} />;
  }

  if (screen === "mfa_enroll") {
    return <MfaEnroll onEnrolled={routeByAal} onSignOut={handleSignOut} />;
  }

  if (screen === "mfa_verify") {
    return (
      <MfaVerify
        factorId={verifyFactorId}
        onVerified={routeByAal}
        onSignOut={handleSignOut}
      />
    );
  }

  if (screen === "dashboard" && session) {
    // activePage kaliti bo'yicha kerakli komponentni tanlaymiz
    // topilmasa, xavfsizlik uchun Dashboard'ga qaytamiz
    const PageComponent = PAGES[activePage] || Dashboard;

    return (
      <PageComponent
        session={session}
        onSignOut={handleSignOut}
        onNavigate={handleNavigate}
        active={activePage}
      />
    );
  }

  return null;
}