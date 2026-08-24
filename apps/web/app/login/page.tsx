import type { Metadata } from "next";
import { TelegramLogin } from "@/components/telegram-login";

export const metadata: Metadata = {
  title: "دخول النسخة التجريبية",
  description: "تسجيل دخول أعضاء AI Fitness Coach عن طريق Telegram.",
};

export default function PublicBetaLoginPage() {
  return <main className="member-login" dir="rtl"><TelegramLogin /></main>;
}
