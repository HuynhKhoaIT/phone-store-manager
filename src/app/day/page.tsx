import { redirect } from "next/navigation";
import { todayVN } from "@/lib/format";

/** /day → trang bán hàng của hôm nay */
export default function DayIndex() {
  redirect(`/day/${todayVN()}`);
}
