'use client';
import { Tabs } from './ui';

export default function PeopleTabs() {
  return (
    <Tabs
      items={[
        { href: '/contacts', label: 'List', exact: true },
        { href: '/contacts/pipeline', label: 'Pipeline' },
        { href: '/works', label: 'Works' },
        { href: '/contacts/hygiene', label: 'Hygiene' },
        { href: '/links', label: 'Tracked links' },
      ]}
    />
  );
}
