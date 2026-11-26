import ActionForm from "@/components/ActionForm";
import {
  approveAndSendCampaign,
  createCampaign,
  deleteCampaign,
  rejectCampaign,
  submitForApproval,
} from "@/app/actions/campaigns";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const STATUS_LABEL: Record<string, string> = {
  draft: "초안",
  pending_approval: "승인 대기",
  approved: "승인됨",
  rejected: "반려됨",
  sent: "발송 완료",
};

type CampaignRow = {
  id: string;
  subject: string;
  status: string;
  created_at: string;
  approved_at: string | null;
  campaign_sends: { status: string }[];
};

export default async function CampaignsPage() {
  const me = await requireProfile();
  const isAdmin = me.role === "org_admin";

  if (!me.org_id) {
    return (
      <>
        <h1>마케팅 발송</h1>
        <div className="card">
          <p className="muted">소속 고객사가 있는 계정에서 마케팅 캠페인을 관리할 수 있습니다.</p>
        </div>
      </>
    );
  }

  const supabase = await createClient();
  const [{ data: campaignsData }, { data: consented }, { data: unsubs }] = await Promise.all([
    supabase
      .from("campaigns")
      .select("id, subject, status, created_at, approved_at, campaign_sends(status)")
      .eq("org_id", me.org_id)
      .order("created_at", { ascending: false }),
    supabase
      .from("contacts")
      .select("email")
      .eq("org_id", me.org_id)
      .eq("consent", "consented"),
    supabase.from("unsubscribes").select("email").eq("org_id", me.org_id),
  ]);

  const unsubSet = new Set((unsubs ?? []).map((u) => u.email.toLowerCase()));
  const eligibleCount = (consented ?? []).filter((c) => !unsubSet.has(c.email.toLowerCase())).length;
  const campaigns = (campaignsData ?? []) as unknown as CampaignRow[];

  return (
    <>
      <h1>마케팅 발송 (승인 기반)</h1>
      <p className="muted">
        현재 발송 가능한 <strong>수신 동의 담당자: {eligibleCount}명</strong> · 발송 시 제목에 <code>(광고)</code>와 하단 수신거부 링크가 자동 포함됩니다.
      </p>

      <div className="card">
        <h3>새 마케팅 메일 작성</h3>
        <ActionForm action={createCampaign} submitLabel="저장">
          <label>
            제목
            <input name="subject" placeholder="예: [히포티앤씨] 디지털 헬스케어 협업 제안서 안내" required />
          </label>
          <label>
            본문
            <textarea
              name="body"
              rows={5}
              placeholder="마케팅 안내 내용을 입력하세요."
              required
            />
          </label>
          <label>
            저장 방식
            <select name="mode" defaultValue="pending_approval">
              <option value="pending_approval">저장 후 바로 관리자 승인 요청</option>
              <option value="draft">초안으로만 저장</option>
            </select>
          </label>
        </ActionForm>
      </div>

      <div className="card">
        <h3>캠페인 목록</h3>
        <table className="table">
          <thead>
            <tr>
              <th>제목</th>
              <th>상태</th>
              <th>작성일</th>
              <th>발송 결과</th>
              <th>관리</th>
            </tr>
          </thead>
          <tbody>
            {campaigns.map((c) => {
              const sentCount = c.campaign_sends?.filter((s) => s.status === "sent").length ?? 0;
              const failCount = c.campaign_sends?.filter((s) => s.status === "failed").length ?? 0;
              return (
                <tr key={c.id}>
                  <td><strong>{c.subject}</strong></td>
                  <td>
                    <span
                      className={`badge ${
                        c.status === "sent"
                          ? "badge-ok"
                          : c.status === "rejected"
                          ? "badge-danger"
                          : ""
                      }`}
                    >
                      {STATUS_LABEL[c.status] ?? c.status}
                    </span>
                  </td>
                  <td className="small muted">{new Date(c.created_at).toLocaleDateString("ko-KR")}</td>
                  <td className="small muted">
                    {c.status === "sent" ? `성공 ${sentCount} / 실패 ${failCount}` : "-"}
                  </td>
                  <td>
                    <div className="row-actions">
                      {(c.status === "draft" || c.status === "rejected") && (
                        <form action={submitForApproval.bind(null, c.id)}>
                          <button className="btn btn-small btn-primary" type="submit">승인 요청</button>
                        </form>
                      )}
                      {c.status === "pending_approval" && isAdmin && (
                        <>
                          <form action={approveAndSendCampaign.bind(null, c.id)}>
                            <button className="btn btn-small btn-primary" type="submit">
                              승인 및 발송 ({eligibleCount}명)
                            </button>
                          </form>
                          <form action={rejectCampaign.bind(null, c.id)}>
                            <button className="btn btn-small btn-danger" type="submit">반려</button>
                          </form>
                        </>
                      )}
                      {c.status === "pending_approval" && !isAdmin && (
                        <span className="muted small">관리자 승인 대기</span>
                      )}
                      {c.status !== "sent" && (
                        <form action={deleteCampaign.bind(null, c.id)}>
                          <button className="btn btn-small btn-danger" type="submit">삭제</button>
                        </form>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {!campaigns.length && (
              <tr>
                <td colSpan={5} className="muted">등록된 캠페인이 없습니다.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
