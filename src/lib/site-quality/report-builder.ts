import type { ReportRecipient } from './report-recipients'
import type { SiteQualityLinkResult, SiteQualityLinkRun, SiteQualityPanelResult, SiteQualityPanelRun } from './types'

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function renderTable(headers: string[], rows: string[][]) {
  return `
    <table style="width:100%;border-collapse:collapse;margin-top:12px;">
      <thead>
        <tr>${headers.map((header) => `<th style="text-align:left;padding:10px;border-bottom:1px solid rgba(0,110,180,0.25);color:#bfdbfe;font-size:12px;">${escapeHtml(header)}</th>`).join('')}</tr>
      </thead>
      <tbody>
        ${rows.length > 0 ? rows.map((row) => `<tr>${row.map((cell) => `<td style="padding:10px;border-bottom:1px solid rgba(0,110,180,0.15);font-size:13px;color:#dbeafe;vertical-align:top;">${cell}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${headers.length}" style="padding:10px;color:#93c5fd;">No items.</td></tr>`}
      </tbody>
    </table>
  `
}

function renderAorSection(recipient: ReportRecipient, linkResults: SiteQualityLinkResult[], panelResults: SiteQualityPanelResult[]) {
  if (recipient.report_type !== 'aor' || !recipient.aor_owner) {
    return ''
  }

  const aorLinks = linkResults.filter((item) => item.aor_owner === recipient.aor_owner)
  const aorPanels = panelResults.filter((item) => item.aor_owner === recipient.aor_owner)

  return `
    <section style="margin-top:28px;padding:20px;border:1px solid rgba(0,110,180,0.25);border-radius:18px;background:rgba(0,65,115,0.25);">
      <h2 style="margin:0 0 8px 0;color:#ffffff;font-size:20px;">Your AOR - ${escapeHtml(recipient.aor_owner)}</h2>
      <p style="margin:0;color:#93c5fd;font-size:13px;">Filtered issues for your ownership area.</p>
      ${renderTable(['Broken links', 'Status', 'Source'], aorLinks.filter((item) => item.http_status !== 200).slice(0, 20).map((item) => [escapeHtml(item.link_url), escapeHtml(item.http_status?.toString() ?? 'error'), escapeHtml(item.source_label || item.page_url)]))}
      ${renderTable(['Panel', 'Score', 'Top issue'], aorPanels.slice(0, 20).map((item) => [escapeHtml(item.panel_name), escapeHtml(item.score.toString()), escapeHtml(item.issues[0]?.detail ?? 'No issues')]))}
    </section>
  `
}

export function buildReportEmail({
  recipient,
  type,
  linkRun,
  linkResults,
  panelRun,
  panelResults,
}: {
  recipient: ReportRecipient
  type: 'link' | 'panel'
  linkRun: SiteQualityLinkRun | null
  linkResults: SiteQualityLinkResult[]
  panelRun: SiteQualityPanelRun | null
  panelResults: SiteQualityPanelResult[]
}) {
  const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  const worstLinks = linkResults.filter((item) => item.http_status !== 200).slice(0, 5)
  const worstPanels = [...panelResults].sort((a, b) => a.score - b.score).slice(0, 3)
  const subject = `Helm Site Quality Report - ${today}`

  const html = `
    <div style="background:#001f3a;padding:32px;font-family:Arial,sans-serif;">
      <div style="max-width:920px;margin:0 auto;padding:28px;border-radius:24px;background:rgba(0,65,115,0.45);border:1px solid rgba(0,110,180,0.25);">
        <h1 style="margin:0;color:#ffffff;font-size:28px;">Helm Site Quality Report</h1>
        <p style="margin:8px 0 0;color:#93c5fd;font-size:14px;">${escapeHtml(type === 'link' ? 'Link Health dispatch' : 'Panel Intelligence dispatch')} for ${escapeHtml(today)}</p>

        <section style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-top:24px;">
          <div style="padding:16px;border-radius:18px;background:rgba(0,65,115,0.3);border:1px solid rgba(0,110,180,0.25);color:#dbeafe;">
            <div style="font-size:12px;color:#93c5fd;">Pages scanned</div>
            <div style="margin-top:6px;font-size:24px;color:#ffffff;">${linkRun?.total_pages ?? 0}</div>
          </div>
          <div style="padding:16px;border-radius:18px;background:rgba(0,65,115,0.3);border:1px solid rgba(0,110,180,0.25);color:#dbeafe;">
            <div style="font-size:12px;color:#93c5fd;">Links checked</div>
            <div style="margin-top:6px;font-size:24px;color:#ffffff;">${linkRun?.total_links ?? 0}</div>
          </div>
          <div style="padding:16px;border-radius:18px;background:rgba(0,65,115,0.3);border:1px solid rgba(0,110,180,0.25);color:#dbeafe;">
            <div style="font-size:12px;color:#93c5fd;">Broken / Redirects</div>
            <div style="margin-top:6px;font-size:24px;color:#ffffff;">${linkRun?.broken_links ?? 0} / ${linkRun?.redirect_links ?? 0}</div>
          </div>
          <div style="padding:16px;border-radius:18px;background:rgba(0,65,115,0.3);border:1px solid rgba(0,110,180,0.25);color:#dbeafe;">
            <div style="font-size:12px;color:#93c5fd;">Panels scored</div>
            <div style="margin-top:6px;font-size:24px;color:#ffffff;">${panelRun?.total_panels ?? 0}</div>
          </div>
          <div style="padding:16px;border-radius:18px;background:rgba(0,65,115,0.3);border:1px solid rgba(0,110,180,0.25);color:#dbeafe;">
            <div style="font-size:12px;color:#93c5fd;">Panel avg score</div>
            <div style="margin-top:6px;font-size:24px;color:#ffffff;">${panelRun?.avg_score?.toFixed(0) ?? '0'}</div>
          </div>
          <div style="padding:16px;border-radius:18px;background:rgba(0,65,115,0.3);border:1px solid rgba(0,110,180,0.25);color:#dbeafe;">
            <div style="font-size:12px;color:#93c5fd;">Issues flagged</div>
            <div style="margin-top:6px;font-size:24px;color:#ffffff;">${panelRun?.issues_flagged ?? 0}</div>
          </div>
        </section>

        <section style="margin-top:28px;">
          <h2 style="margin:0;color:#ffffff;font-size:20px;">Top offenders</h2>
          ${renderTable(['Broken link', 'Status', 'Source'], worstLinks.map((item) => [escapeHtml(item.link_url), escapeHtml(item.http_status?.toString() ?? 'error'), escapeHtml(item.source_label || item.page_url)]))}
          ${renderTable(['Panel', 'Score', 'Issue'], worstPanels.map((item) => [escapeHtml(item.panel_name), escapeHtml(item.score.toString()), escapeHtml(item.issues[0]?.detail ?? 'No issues')]))}
        </section>

        <div style="margin-top:24px;">
          <a href="https://helm.nexweb.dev/site-quality/link-health" style="display:inline-block;padding:12px 18px;border-radius:999px;background:#93c5fd;color:#001f3a;text-decoration:none;font-weight:700;">View full report in Helm</a>
        </div>

        ${renderAorSection(recipient, linkResults, panelResults)}
      </div>
    </div>
  `

  return { subject, html }
}
