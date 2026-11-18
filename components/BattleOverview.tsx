import React, { useId, useState } from 'react';

interface BattleOverviewProps {
  label: string;
  summary: React.ReactNode;
  notice?: React.ReactNode;
  children: React.ReactNode;
}

export default function BattleOverview({ label, summary, notice, children }: BattleOverviewProps) {
  const [expanded, setExpanded] = useState(false);
  const detailsId = useId();

  return <section className="battle-overview" aria-label={label} tabIndex={0}>
    {notice}
    <button type="button" className="overview-toggle" aria-expanded={expanded} aria-controls={detailsId}
      onClick={() => setExpanded(previous => !previous)}>
      <span className="overview-summary">{summary}</span>
      <span className="overview-action">{expanded ? '收起详情' : '战况详情'}<span className="overview-chevron" aria-hidden="true" /></span>
    </button>
    <div id={detailsId} className="overview-details" data-expanded={expanded}>
      {children}
    </div>
  </section>;
}
