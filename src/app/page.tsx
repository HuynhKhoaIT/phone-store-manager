import { redirect } from "next/navigation";
import { todayVN } from "@/lib/format";

export default function Home() {
  redirect(`/day/${todayVN()}`);
}
