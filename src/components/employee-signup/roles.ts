// Suggested positions for a new employee, based on the business's industry.

const BY_CATEGORY: Record<string, string[]> = {
  'Construction & Trades': ['Tradesperson', 'Apprentice', 'Labourer', 'Leading Hand', 'Site Supervisor', 'Estimator'],
  Automotive: ['Technician', 'Mechanic', 'Apprentice', 'Detailer', 'Service Advisor'],
  'Home Services': ['Cleaner', 'Senior Cleaner', 'Team Leader', 'Technician', 'Supervisor'],
  'Outdoor & Garden': ['Gardener', 'Landscaper', 'Groundskeeper', 'Labourer', 'Team Leader'],
  Beauty: ['Stylist', 'Senior Stylist', 'Beauty Therapist', 'Apprentice', 'Receptionist'],
  'Health & Wellness': ['Practitioner', 'Therapist', 'Assistant', 'Receptionist'],
  Fitness: ['Trainer', 'Instructor', 'Coach', 'Front Desk'],
  'Pet Services': ['Groomer', 'Dog Walker', 'Pet Carer', 'Trainer', 'Assistant'],
  'Events & Hospitality': ['Event Staff', 'Coordinator', 'Bartender', 'Chef', 'Waitstaff'],
  'IT & Technology': ['Technician', 'Developer', 'Support Specialist', 'Consultant'],
  'Creative & Media': ['Photographer', 'Designer', 'Editor', 'Assistant'],
  'Professional Services': ['Consultant', 'Associate', 'Administrator', 'Bookkeeper'],
  'Education & Tutoring': ['Tutor', 'Instructor', 'Educator', 'Assistant'],
  'Transport & Logistics': ['Driver', 'Courier', 'Offsider', 'Dispatcher'],
  'Care Services': ['Support Worker', 'Carer', 'Nurse', 'Coordinator'],
};

// A few industries have a clear job title of their own.
const BY_INDUSTRY: Record<string, string> = {
  Carpentry: 'Carpenter',
  Plumbing: 'Plumber',
  Electrical: 'Electrician',
  'Painting & Decorating': 'Painter',
  Tiling: 'Tiler',
  Roofing: 'Roofer',
  Landscaping: 'Landscaper',
  Cleaning: 'Cleaner',
  'Commercial Cleaning': 'Cleaner',
  'Window Cleaning': 'Window Cleaner',
  'Car Detailing': 'Detailer',
  'Dog Grooming': 'Dog Groomer',
  Hairdressing: 'Hairdresser',
  Barber: 'Barber',
  'Personal Training': 'Personal Trainer',
  Photography: 'Photographer',
};

const GENERAL = ['Team Member', 'Supervisor', 'Manager', 'Admin'];

export function suggestRoles(industry: string | null, category: string | null) {
  const list = [
    ...(industry && BY_INDUSTRY[industry] ? [BY_INDUSTRY[industry]] : []),
    ...(category ? (BY_CATEGORY[category] ?? []) : []),
    ...GENERAL,
  ];
  return [...new Set(list)];
}
