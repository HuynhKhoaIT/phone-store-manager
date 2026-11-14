/**
 * Ô chọn tiền lấy từ đâu (phiếu nhập hàng, khoản vật tư / xây dựng): quỹ cửa hàng hay tiền riêng của một người góp vốn.
 * Gửi `fund` = "STORE" | id người góp vốn | "" (chưa rõ) — server đọc bằng `parseFund` (actions.ts).
 * `keep`: người góp đã chọn trước đây nhưng nay đã ẩn → vẫn giữ trong danh sách khi sửa.
 */
export function FundSelect({
  investors,
  defaultValue,
  keep,
  hint,
}: {
  investors: { id: number; name: string }[];
  defaultValue: string;
  keep?: { id: number; name: string };
  hint: string;
}) {
  return (
    <label className="field">
      <span>Tiền từ *</span>
      <select name="fund" defaultValue={defaultValue} className="input">
        <option value="STORE">Quỹ cửa hàng (tiền bán hàng)</option>
        {investors.map((i) => (
          <option key={i.id} value={i.id}>
            Tiền riêng của {i.name}
          </option>
        ))}
        {keep && !investors.some((i) => i.id === keep.id) && (
          <option value={keep.id}>Tiền riêng của {keep.name}</option>
        )}
        <option value="">Chưa rõ (ghi sau)</option>
      </select>
      <small className="text-slate-500">{hint}</small>
    </label>
  );
}

/** Giá trị mặc định của FundSelect từ bản ghi đã lưu */
export function fundValue(r: { fundSource: string | null; investorId: number | null }) {
  return r.fundSource === "INVESTOR" ? String(r.investorId) : (r.fundSource ?? "");
}
