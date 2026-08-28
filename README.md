# Farg'ona Kelajak Markazi — Super Admin Panel

React + Supabase asosida qurilgan super admin paneli. Login → 2FA (MFA) → foydalanuvchi yaratish.

## O'rnatish

```bash
npm install
```

## Sozlash

`.env.example` faylidan nusxa oling:

```bash
cp .env.example .env
```

`.env` faylini oching va quyidagilarni to'ldiring:

- `VITE_SUPABASE_URL` — allaqachon to'ldirilgan (yzoavkxtburfhegmtbeb.supabase.co)
- `VITE_SUPABASE_ANON_KEY` — Supabase Dashboard > Settings > API > "anon public" key'ni qo'ying

## Ishga tushirish (development)

```bash
npm run dev
```

Brauzerda: http://localhost:5173

## Production build

```bash
npm run build
```

Natija `dist/` papkasida bo'ladi — uni istalgan statik hosting'ga (Vercel, Netlify, Cloudflare Pages va h.k.) joylashtirish mumkin.

## Ishlash tartibi

1. **Login** — email va parol bilan kirish (fargonaKmarkaz@gmail.com va yaratilgan parol).
2. **MFA sozlash** — birinchi marta kirganda tizim Google Authenticator (yoki shunga o'xshash ilova) orqali QR-kodni skanerlashni so'raydi. Bu **majburiy**, chunki `manage-users` funksiyasi faqat 2FA (aal2) o'tgan super_admin'dan foydalanuvchi yaratishga ruxsat beradi.
3. **Keyingi loginlar** — MFA yoqilgandan so'ng, har safar kirishda 6 xonali kod so'raladi.
4. **Dashboard** — yangi foydalanuvchi (direktor, markaz hodimi, to'garak rahbari va h.k.) yaratish formasi. Rolga qarab tuman tanlash maydoni ko'rsatiladi.

## Muhim eslatma

- `manage-users` Edge Function allaqachon Supabase'da joylashgan va o'zgartirilmagan.
- Bu panel faqat foydalanuvchi **yaratish**ni qo'llab-quvvatlaydi. Foydalanuvchilarni ko'rish/tahrirlash/o'chirish uchun Edge Function'ga qo'shimcha action'lar (masalan `list`, `update`, `delete`) qo'shish va shu asosida yangi UI qo'shish kerak bo'ladi — buni keyingi bosqichda amalga oshirish mumkin.
