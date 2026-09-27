import type { Href } from 'expo-router';

import type { IconName } from '@/components/employee/ui';

export type AccountSection = {
  id: string;
  title: string;
  subtitle: string;
  icon: IconName;
  /** Screen to open. Rows without one open a placeholder at /account/[id]. */
  href?: Href;
};

// Rows on the More tab.
export const ACCOUNT_SECTIONS: AccountSection[] = [
  {
    id: 'profile',
    title: 'My Profile',
    subtitle: 'Personal details, contact info',
    icon: { ios: 'person.fill', android: 'person', web: 'person' },
  },
  {
    id: 'availability',
    title: 'Availability',
    subtitle: 'Set the days and times you are available to work',
    icon: { ios: 'calendar.badge.clock', android: 'event_available', web: 'event_available' },
    href: '/availability',
  },
  {
    id: 'payment',
    title: 'Payment',
    subtitle: 'Bank account details',
    icon: { ios: 'building.columns.fill', android: 'account_balance', web: 'account_balance' },
  },
  {
    id: 'tax',
    title: 'Tax',
    subtitle: 'TFN and tax information',
    icon: { ios: 'doc.text.fill', android: 'description', web: 'description' },
  },
  {
    id: 'employment',
    title: 'Employment',
    subtitle: 'Pay rate, superannuation, job details',
    icon: { ios: 'briefcase.fill', android: 'work', web: 'work' },
  },
  {
    id: 'qualifications',
    title: 'Qualifications',
    subtitle: 'View and manage your licences, tickets and certificates',
    icon: { ios: 'rosette', android: 'workspace_premium', web: 'workspace_premium' },
    href: '/qualifications',
  },
  {
    id: 'help',
    title: 'Help Centre',
    subtitle: 'FAQs and support',
    icon: { ios: 'questionmark.circle.fill', android: 'help', web: 'help' },
  },
  {
    id: 'contact-employer',
    title: 'Contact Employer',
    subtitle: 'Get in touch with your manager',
    icon: { ios: 'envelope.fill', android: 'mail', web: 'mail' },
  },
  {
    id: 'contact-support',
    title: 'Contact Support',
    subtitle: "Need more help? We're here.",
    icon: { ios: 'headphones', android: 'support_agent', web: 'support_agent' },
  },
  {
    id: 'notifications',
    title: 'Notifications',
    subtitle: 'Manage your preferences',
    icon: { ios: 'bell.fill', android: 'notifications', web: 'notifications' },
  },
];
