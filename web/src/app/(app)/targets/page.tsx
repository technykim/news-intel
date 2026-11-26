import Link from "next/link";
import ActionForm from "@/components/ActionForm";
import {
  addContact,
  deleteContact,
  updateContactConsent,
  updateTargetCompany,
} from "@/app/actions/targets";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const STATUS_LABEL: Record<string, string> = {
  new: "신규",
  reviewing: "검토 중",
  to_contact: "연락 예정",
  excluded: "제외",
};

const TYPE_LABEL: Record<string, string> = {
  company: "기업",
  organization: "기관/단체",
  person: "인물",
};

const CONSENT_LABEL: Record<string, string> = {
  unknown: "미확인",
  consented: "수신 동의",
  refused: "수신 거부",
};

type TargetRow = {
  id: string;
  entity_id: string;
  status: string;
  memo: string | null;
  mention_count: number;
  last_seen: string | null;
  entities: {
    id: string;
    name: string;
    type: string;
    homepage: string | null;
    industry: string | null;
  } | null;
};

type ContactRow = {
  id: string;
  target_company_id: string | null;
  name: string | null;
  email: string;
  consent: string;
  source: string | null;
};

export default async function TargetsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const me = await requireProfile();
  const { status = "" } = await searchParams;

  if (!me.org_id) {
    return (
      <>
        <h1>타겟 회사 DB</h1>
        <div className="card">
          <p className="muted">소속 고객사가 있는 계정에서 타겟 회사를 관리할 수 있습니다.</p>
        </div>
      </>
    );
  }

  const supabase = await createClient();
  let tQuery = supabase
    .from("target_companies")
    .select("id, entity_id, status, memo, mention_count, last_seen, entities(id, name, type, homepage, industry)")
    .eq("org_id", me.org_id)
    .order("mention_count", { ascending: false })
    .order("last_seen", { ascending: false })
    .limit(100);

  if (status && STATUS_LABEL[status]) {
    tQuery = tQuery.eq("status", status);
  }

  const [{ data: targetsData }, { data: contactsData }] = await Promise.all([
    tQuery,
    supabase
      .from("contacts")
      .select("id, target_company_id, name, email, consent, source")
      .eq("org_id", me.org_id)
      .order("created_at", { ascending: false }),
  ]);

  const targets = (targetsData ?? []) as unknown as TargetRow[];
  const contacts = (contactsData ?? []) as unknown as ContactRow[];
  const targetNameById = new Map(targets.map((t) => [t.id, t.entities?.name ?? "-"]));

  return (
    <>
      <h1>타겟 회사 DB</h1>
      <p className="muted">AI가 기사에서 자동 추출해 누적한 회사·기관·인물 목록과 담당자 연락처입니다.</p>

      <div className="card">
        <div className="row-actions" style={{ flexWrap: "wrap" }}>
          <Link href="/targets" className={`btn btn-small ${!status ? "btn-primary" : ""}`}>전체</Link>
          {Object.entries(STATUS_LABEL).map(([k, label]) => (
            <Link key={k} href={`/targets?status=${k}`} className={`btn btn-small ${status === k ? "btn-primary" : ""}`}>
              {label}
            </Link>
          ))}
        </div>

        <table className="table">
          <thead>
            <tr>
              <th>대상</th>
              <th>언급</th>
              <th>홈페이지 / 상태 / 메모</th>
            </tr>
          </thead>
          <tbody>
            {targets.map((t) => (
              <tr key={t.id}>
                <td style={{ minWidth: 180 }}>
                  <strong>{t.entities?.name ?? "-"}</strong>
                  <div className="small muted">
                    {TYPE_LABEL[t.entities?.type ?? ""] ?? t.entities?.type}
                    {t.entities?.industry ? ` · ${t.entities.industry}` : ""}
                  </div>
                  {t.entities?.homepage && (
                    <a href={t.entities.homepage} target="_blank" rel="noreferrer" className="small">
                      홈페이지 ↗
                    </a>
                  )}
                </td>
                <td style={{ width: 90 }}>
                  <strong>{t.mention_count}회</strong>
                  <div className="small muted">
                    {t.last_seen ? new Date(t.last_seen).toLocaleDateString("ko-KR") : "-"}
                  </div>
                </td>
                <td>
                  <form action={updateTargetCompany} className="form form-row" style={{ marginTop: 0 }}>
                    <input type="hidden" name="target_id" value={t.id} />
                    <input type="hidden" name="entity_id" value={t.entity_id} />
                    <select name="status" defaultValue={t.status} style={{ flex: "0 1 120px" }}>
                      {Object.entries(STATUS_LABEL).map(([k, label]) => (
                        <option key={k} value={k}>{label}</option>
                      ))}
                    </select>
                    <input
                      name="homepage"
                      defaultValue={t.entities?.homepage ?? ""}
                      placeholder="https://홈페이지"
                      style={{ flex: "1 1 170px" }}
                    />
                    <input
                      name="memo"
                      defaultValue={t.memo ?? ""}
                      placeholder="메모"
                      style={{ flex: "1 1 180px" }}
                    />
                    <button type="submit" className="btn btn-small">저장</button>
                  </form>
                </td>
              </tr>
            ))}
            {!targets.length && (
              <tr>
                <td colSpan={3} className="muted">누적된 타겟 회사가 없습니다.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3>담당자 연락처 등록</h3>
        <p className="muted small">
          정보통신망법 준수를 위해 <strong>수신 동의</strong> 상태인 담당자에게만 마케팅 캠페인이 발송됩니다.
        </p>
        <ActionForm action={addContact} submitLabel="담당자 추가" className="form form-row">
          <select name="target_company_id" defaultValue="">
            <option value="">타겟 회사 선택 (선택)</option>
            {targets.map((t) => (
              <option key={t.id} value={t.id}>{t.entities?.name ?? t.id}</option>
            ))}
          </select>
          <input name="name" placeholder="담당자 이름" />
          <input name="email" type="email" placeholder="담당자 이메일" required />
          <select name="consent" defaultValue="unknown">
            <option value="unknown">동의 미확인</option>
            <option value="consented">수신 동의</option>
            <option value="refused">수신 거부</option>
          </select>
          <input name="source" placeholder="동의 출처 (예: 명함교환, 문의폼)" />
        </ActionForm>

        <table className="table" style={{ marginTop: 18 }}>
          <thead>
            <tr>
              <th>회사</th>
              <th>담당자</th>
              <th>이메일</th>
              <th>동의 상태</th>
              <th>출처</th>
              <th>관리</th>
            </tr>
          </thead>
          <tbody>
            {contacts.map((c) => (
              <tr key={c.id}>
                <td>{c.target_company_id ? targetNameById.get(c.target_company_id) ?? "-" : "-"}</td>
                <td>{c.name || "-"}</td>
                <td>{c.email}</td>
                <td>
                  <span
                    className={`badge ${
                      c.consent === "consented"
                        ? "badge-ok"
                        : c.consent === "refused"
                        ? "badge-danger"
                        : "badge-muted"
                    }`}
                  >
                    {CONSENT_LABEL[c.consent] ?? c.consent}
                  </span>
                </td>
                <td className="small muted">{c.source || "-"}</td>
                <td>
                  <div className="row-actions">
                    {c.consent !== "consented" && (
                      <form action={updateContactConsent.bind(null, c.id, "consented")}>
                        <button className="btn btn-small" type="submit">동의 처리</button>
                      </form>
                    )}
                    {c.consent !== "refused" && (
                      <form action={updateContactConsent.bind(null, c.id, "refused")}>
                        <button className="btn btn-small" type="submit">거부 처리</button>
                      </form>
                    )}
                    <form action={deleteContact.bind(null, c.id)}>
                      <button className="btn btn-small btn-danger" type="submit">삭제</button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
            {!contacts.length && (
              <tr>
                <td colSpan={6} className="muted">등록된 담당자가 없습니다.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
