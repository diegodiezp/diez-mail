'use client';
import { Tabs } from './ui';

export default function CampaignTabs() {
  return (
    <Tabs
      items={[
        { href: '/campaigns', label: 'Campaigns', exact: true },
        { href: '/campaigns/templates', label: 'Templates' },
      ]}
    />
  );
}
