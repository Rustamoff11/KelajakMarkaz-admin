  import React, { useEffect, useRef, useState } from "react";
  import {
    Home,
    MapPin,
    MapPinned,
    Users2,
    FileBarChart2,
    Users,
    UserCog,
    ShieldCheck,
    Settings,
    Search,
    ChevronDown,
    Menu,
    Landmark,
    Sun,
    Moon,
  } from "lucide-react";
  import NotificationBell from "../components/Notificationbell";
  import "./Dashboard.css";

  const THEME_STORAGE_KEY = "km-theme";

  // Har bir punktdagi "key" App.jsx dagi activePage bilan mos kelishi kerak
  const NAV_ITEMS = [
    { key: "dashboard", label: "Bosh sahifa", icon: Home },
    { key: "tumanlar", label: "Tumanlar", icon: MapPin },
    { key: "tashkilot-manzillari", label: "Tashkilot manzillari", icon: MapPinned },
    { key: "togaraklar", label: "To'garaklar", icon: Users2 },
    { key: "rahbarlar", label: "Rahbarlar", icon: UserCog },
    { key: "foydalanuvchilar", label: "Foydalanuvchilar", icon: Users },
    { key: "sozlamalar", label: "Sozlamalar", icon: Settings },
  ];

  export default function AppShell({ active, onNavigate, onSignOut, children }) {
    const [userMenuOpen, setUserMenuOpen] = useState(false);
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [theme, setTheme] = useState(() => {
      if (typeof window === "undefined") return "dark";
      return window.localStorage.getItem(THEME_STORAGE_KEY) || "dark";
    });

    const userCardRef = useRef(null);

    useEffect(() => {
      document.documentElement.setAttribute("data-theme", theme);
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    }, [theme]);

    // Tashqariga bosilganda foydalanuvchi dropdown menyusini yopish
    useEffect(() => {
      if (!userMenuOpen) return;

      function handleOutsideClick(e) {
        if (userCardRef.current && !userCardRef.current.contains(e.target)) {
          setUserMenuOpen(false);
        }
      }

      function handleEscKey(e) {
        if (e.key === "Escape") setUserMenuOpen(false);
      }

      document.addEventListener("mousedown", handleOutsideClick);
      document.addEventListener("keydown", handleEscKey);

      return () => {
        document.removeEventListener("mousedown", handleOutsideClick);
        document.removeEventListener("keydown", handleEscKey);
      };
    }, [userMenuOpen]);

    function handleNavClick(key) {
      setUserMenuOpen(false); // navigatsiya vaqtida dropdown yopilsin
      onNavigate && onNavigate(key);
    }

    return (
      <div className={`km-root ${sidebarOpen ? "" : "km-sidebar-collapsed"}`}>
        {/* ---------- Sidebar ---------- */}
        <aside className="km-sidebar">
          <div className="km-logo">
            <div className="km-logo-icon">
              <ShieldCheck size={18} color="#fff" strokeWidth={2.3} />
            </div>
            <div className="km-logo-text">
              <h1>KELAJAK MARKAZI</h1>
              <p>Superadmin paneli</p>
            </div>
          </div>

          <nav className="km-nav">
            {NAV_ITEMS.map((item) => {
              const isActive = active === item.key;
              return (
                <button
                  key={item.key}
                  className={`km-nav-item ${isActive ? "active" : ""}`}
                  type="button"
                  aria-current={isActive ? "page" : undefined}
                  onClick={() => handleNavClick(item.key)}
                >
                  <item.icon size={17} strokeWidth={2} />
                  {item.label}
                </button>
              );
            })}
          </nav>

          <div className="km-promo">
            <div className="km-promo-illustration">
              <Landmark size={22} color="#fff" />
            </div>
            <p>Kelajak sari birgalikda!</p>
          </div>

          <div className="km-user-card" style={{ position: "relative" }} ref={userCardRef}>
            <button
              type="button"
              className="km-user-card-trigger"
              aria-expanded={userMenuOpen}
              aria-haspopup="true"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                width: "100%",
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: 0,
              }}
              onClick={() => setUserMenuOpen((v) => !v)}
            >
              <div className="km-avatar">SA</div>
              <div className="km-user-info">
                <p className="km-user-name">Superadmin</p>
                <p className="km-user-role">Viloyat boshqaruvi</p>
              </div>
              <ChevronDown size={16} color="#8b96b4" />
            </button>

            {userMenuOpen && (
              <div
                className="km-user-dropdown"
                style={{
                  position: "absolute",
                  bottom: "110%",
                  left: 0,
                  right: 0,
                  background: "#fff",
                  borderRadius: 10,
                  boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
                  overflow: "hidden",
                  zIndex: 20,
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    setUserMenuOpen(false);
                    onSignOut && onSignOut();
                  }}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    padding: "10px 14px",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    fontSize: 14,
                    color: "#d92d20",
                  }}
                >
                  Chiqish
                </button>
              </div>
            )}
          </div>
        </aside>

        {/* ---------- Main ---------- */}
        <div className="km-main">
          {/* Topbar */}
          <header className="km-topbar">
            <button
              className="km-icon-btn"
              type="button"
              aria-label="Menyu"
              aria-pressed={sidebarOpen}
              onClick={() => setSidebarOpen((v) => !v)}
            >
              <Menu size={19} />
            </button>

            <div className="km-search">
              <Search size={15} />
              <input type="text" placeholder="Qidirish..." />
            </div>

            <div className="km-topbar-right">
              <button
                className="km-icon-btn km-theme-btn"
                type="button"
                aria-label={theme === "dark" ? "Yorug' rejimga o'tish" : "Qorong'i rejimga o'tish"}
                onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
              >
                {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
              </button>

              {/* Bitta bildirishnoma iconi — hisobotlar + murojaatlar bazadan haqiqiy hisoblanadi,
                  bosilganda ro'yxat ko'rinishidagi panel ochiladi (NotificationBell.jsx) */}
              <NotificationBell onNavigate={onNavigate} />

              <div className="km-topbar-divider" />
              <div className="km-topbar-user">
                <div className="km-avatar">SA</div>
                <span>Superadmin</span>
                <ChevronDown size={15} color="#98a2b3" />
              </div>
            </div>
          </header>

          {/* Content — har bir sahifa shu yerga tushadi */}
          <main className="km-content">{children}</main>
        </div>
      </div>
    );
  }