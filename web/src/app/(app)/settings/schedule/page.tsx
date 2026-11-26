import ActionForm from "@/components/ActionForm";
import {
  addSchedule,
  deleteSchedule,
  toggleScheduleActive,
  toggleScheduleEmail,
} from "@/app/actions/schedule";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const HOURS = Array.from({ length: 24 }, (_, i) => i);

export default async function SchedulePage() {
  const me = await requireProfile();
  const isAdmin = me.role === "org_admin";

  if (!me.org_id) {
    return (
      <>
        <h1>수집 시간 설정</h1>
        <div className="card">
          <p className="muted">소속 고객사가 있는 계정에서 수집 시간을 설정할 수 있습니다.</p>
        </div>
      </>
    );
  }

  const supabase = await createClient();
  const [{ data: schedules }, { data: logs }] = await Promise.all([
    supabase
      .from("schedules")
      .select("id, hour_kst, send_email, active, created_at")
      .eq("org_id", me.org_id)
      .order("hour_kst", { ascending: true }),
    supabase
      .from("run_logs")
      .select("id, run_at, article_count, status, error")
      .eq("org_id", me.org_id)
      .order("run_at", { ascending: false })
      .limit(10),
  ]);

  return (
    <>
      <h1>수집 시간 설정</h1>
      <p className="muted">
        원하는 시각(한국 시간 기준)을 여러 개 등록해 하루 1회 또는 2회 이상 자동으로 뉴스를 수집할 수 있습니다.
      </p>

      {isAdmin && (
        <div className="card">
          <h3>수집 시간 추가</h3>
          <ActionForm action={addSchedule} submitLabel="시간 추가" className="form form-row">
            <select name="hour_kst" defaultValue="8" style={{ flex: "0 1 180px" }}>
              {HOURS.map((h) => (
                <option key={h} value={h}>
                  매일 {String(h).padStart(2, "0")}:00 (KST)
                </option>
              ))}
            </select>
            <label style={{ flexDirection: "row", alignItems: "center", fontWeight: 400 }}>
              <input type="checkbox" name="send_email" defaultChecked style={{ width: "auto" }} />
              이 시각에 브리핑 메일 발송
            </label>
          </ActionForm>
        </div>
      )}

      <div className="card">
        <h3>등록된 수집 스케줄 ({schedules?.length ?? 0}회/일)</h3>
        <table className="table">
          <thead>
            <tr>
              <th>수집 시각 (KST)</th>
              <th>브리핑 메일</th>
              <th>상태</th>
              {isAdmin && <th>관리</th>}
            </tr>
          </thead>
          <tbody>
            {(schedules ?? []).map((s) => (
              <tr key={s.id}>
                <td><strong>매일 {String(s.hour_kst).padStart(2, "0")}:00</strong></td>
                <td>
                  <span className={`badge ${s.send_email ? "badge-ok" : "badge-muted"}`}>
                    {s.send_email ? "메일 발송" : "DB 수집만"}
                  </span>
                </td>
                <td>
                  <span className={`badge ${s.active ? "badge-ok" : "badge-muted"}`}>
                    {s.active ? "활성" : "일시중지"}
                  </span>
                </td>
                {isAdmin && (
                  <td>
                    <div className="row-actions">
                      <form action={toggleScheduleEmail.bind(null, s.id, !s.send_email)}>
                        <button className="btn btn-small" type="submit">
                          {s.send_email ? "메일 끄기" : "메일 켜기"}
                        </button>
                      </form>
                      <form action={toggleScheduleActive.bind(null, s.id, !s.active)}>
                        <button className="btn btn-small" type="submit">
                          {s.active ? "중지" : "재개"}
                        </button>
                      </form>
                      <form action={deleteSchedule.bind(null, s.id)}>
                        <button className="btn btn-small btn-danger" type="submit">삭제</button>
                      </form>
                    </div>
                  </td>
                )}
              </tr>
            ))}
            {!schedules?.length && (
              <tr>
                <td colSpan={isAdmin ? 4 : 3} className="muted">
                  등록된 수집 시각이 없습니다. 위에서 수집 시각을 추가해 주세요.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3>최근 수집 실행 이력</h3>
        <table className="table">
          <thead>
            <tr>
              <th>실행 시각</th>
              <th>수집 건수</th>
              <th>결과</th>
              <th>비고</th>
            </tr>
          </thead>
          <tbody>
            {(logs ?? []).map((l) => (
              <tr key={l.id}>
                <td className="small">
                  {new Date(l.run_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}
                </td>
                <td>{l.article_count}건</td>
                <td>
                  <span className={`badge ${l.status === "success" ? "badge-ok" : "badge-danger"}`}>
                    {l.status === "success" ? "성공" : "오류"}
                  </span>
                </td>
                <td className="small muted">{l.error || "-"}</td>
              </tr>
            ))}
            {!logs?.length && (
              <tr>
                <td colSpan={4} className="muted">아직 실행 이력이 없습니다.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
