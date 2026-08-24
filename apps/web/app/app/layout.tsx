import type { Metadata } from "next";
import { MemberShell } from "@/components/member-shell";

export const metadata: Metadata = {
  title: { default: "بوابة العضو", template: "%s · AI Fitness Coach" },
  description: "بوابة العضو للتمرين، التغذية، التقدم، والمدرب الذكي.",
};

export default function MemberAppLayout({ children }: { children: React.ReactNode }) {
  return <MemberShell>{children}</MemberShell>;
}
