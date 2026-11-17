// =============================================================================
//  NexGain Bookings — business types, their preset services and their wording.
//  The ONE place to add or change booking business types. Nothing else needs
//  editing: sign-up, Services & Prices, the dashboards and the booking page
//  all read this.
// =============================================================================
//
//  Each service: [name, minutes, AUD price]. Prices are starting suggestions,
//  pre-filled only for Australian businesses (other countries enter their own).
//  Every service in a type belongs to that type only: a barber only gets barber
//  services, a beauty therapist only beauty therapy services. Business types are
//  never mixed (the business type is saved in booking_settings.business_types).
//
//  Types that already exist in System One (the service-based system) are left
//  out on purpose: Spray Tan, Cosmetic Tattoo, Myotherapy, Acupuncture,
//  Podiatry, Dietitian / Nutritionist, Psychologist / Counsellor, Dental Clinic,
//  Optometrist, Boxing / Martial Arts, Dance Studio, Swim School, Dog Training,
//  Vet Clinic, Pet Sitting / Dog Walking, Language Lessons, Videographer, Car
//  Detailing and Window Tinting. (See src/data/industries.ts for System One's list.)
//
//  Wording: each category says what its people, bookings and customers are
//  called (e.g. "barber", "appointment", "client"); a type can use its own
//  word for its people (Hair Salon: "stylist").
//
//  To add a type: add a line to a category's `types` (and its word to `staff`
//  if it has its own). To add a category: copy one of the blocks below. Every
//  category also gets "Other – enter my own" automatically (no preset services).
import type { SymbolViewProps } from 'expo-symbols';

type IconName = SymbolViewProps['name'];
type Preset = [name: string, minutes: number, audPrice: number];

/** What a business type calls its people, its bookings and its customers (all lower case, singular). */
export type BookingWords = { staff: string; booking: string; customer: string };

export type BookingService = { name: string; minutes: number; audPrice: number };
export type BookingBusinessType = {
  id: string;
  name: string;
  categoryId: string;
  services: BookingService[];
  words: BookingWords;
  other?: boolean;
};
export type BookingCategory = { id: string; name: string; icon: IconName; types: BookingBusinessType[] };

const icon = (ios: string, android: string): IconName => ({ ios, android, web: android }) as IconName;

const RAW: {
  id: string;
  name: string;
  icon: IconName;
  words: BookingWords;
  /** A type's own word for its people, if different from the category's. */
  staff?: Record<string, string>;
  /** A type's own word for its bookings, if different from the category's. */
  booking?: Record<string, string>;
  types: Record<string, Preset[]>;
}[] = [
  {
    id: 'hair',
    name: 'Hair & Barber',
    icon: icon('scissors', 'content_cut'),
    words: { staff: 'stylist', booking: 'appointment', customer: 'client' },
    staff: { Barber: 'barber', Braiding: 'braider' },
    types: {
      Barber: [
        ['Standard Cut', 30, 35], ['Skin Fade', 45, 50], ['Zero Fade', 40, 45], ['Drop Fade', 45, 50], ['Taper Fade', 40, 45],
        ['Buzz Cut', 20, 25], ['Scissor Cut', 40, 45], ['Head Shave', 30, 35], ['Senior Cut', 30, 28], ['Kids Cut', 30, 28],
        ['Beard Trim', 20, 25], ['Beard Shape & Line Up', 25, 30], ['Hot Towel Shave', 30, 40], ['Cut & Beard', 60, 65],
        ['Grey Blending', 30, 40], ['Eyebrow Tidy', 10, 10], ['Hair Design/Part', 15, 10],
      ],
      'Hair Salon': [
        ["Women's Cut & Blow-Dry", 60, 85], ["Men's Cut", 30, 45], ['Kids Cut', 30, 35], ['Fringe Trim', 15, 15], ['Blow-Dry', 45, 55],
        ['Root Colour', 90, 120], ['Full Colour', 120, 160], ['Half Head Foils', 120, 180], ['Full Head Foils', 150, 240],
        ['Balayage', 180, 280], ['Toner', 30, 50], ['Gloss', 45, 75], ['Treatment', 30, 45], ['Scalp Treatment', 30, 50],
        ['Keratin Smoothing', 180, 350], ['Updo/Event Styling', 60, 95],
      ],
      'Hair Extensions': [
        ['Consultation', 20, 0], ['Colour Match & Blend', 60, 90], ['Tape Extensions Install', 120, 450], ['Tape Move-Up', 90, 180],
        ['Weft Install', 150, 550], ['Keratin Bond Install', 240, 900], ['Extension Maintenance', 60, 120], ['Removal', 45, 80],
      ],
      Braiding: [
        ['Box Braids', 300, 250], ['Knotless Braids', 360, 300], ['Feed-In Braids', 180, 180], ['Fulani Braids', 300, 280],
        ['Cornrows', 90, 80], ['Twists', 240, 200], ['Kids Braids', 120, 100], ['Braid Takedown', 60, 60],
      ],
    },
  },
  {
    id: 'nails',
    name: 'Nails',
    icon: icon('hand.raised.fill', 'back_hand'),
    words: { staff: 'nail tech', booking: 'appointment', customer: 'client' },
    types: {
      'Nail Salon': [
        ['Classic Manicure', 30, 40], ['Gel Manicure', 45, 55], ['Classic Pedicure', 45, 55], ['Gel Pedicure', 60, 70], ['Gel Toes', 30, 40],
        ['Acrylic Full Set', 75, 75], ['Acrylic Refill', 60, 55], ['SNS/Dip Powder', 60, 65], ['BIAB', 60, 70], ['French Tips', 15, 15],
        ['Gel Removal', 20, 15], ['Nail Repair (per nail)', 10, 8], ['Nail Art (per set)', 15, 15], ['Paraffin Treatment', 15, 20],
        ['Mani & Pedi Combo', 90, 100],
      ],
    },
  },
  {
    id: 'beauty',
    name: 'Beauty',
    icon: icon('sparkles', 'auto_awesome'),
    words: { staff: 'beauty therapist', booking: 'appointment', customer: 'client' },
    staff: { 'Lash Studio': 'lash artist', 'Brow Studio': 'brow artist', 'Lash & Brow Bar': 'lash & brow artist', 'Makeup Artist': 'makeup artist', Waxing: 'waxing therapist' },
    types: {
      'Beauty Therapist': [
        ['Express Facial', 30, 65], ['Signature Facial', 60, 110], ['Microdermabrasion', 45, 110], ['Brow Shape', 20, 30],
        ['Brow Shape & Tint', 30, 45], ['Lash Tint', 15, 25], ['Lash Lift & Tint', 60, 90], ['Lip Wax', 10, 15], ['Underarm Wax', 15, 25],
        ['Half Leg Wax', 30, 45], ['Full Leg Wax', 45, 70], ['Brazilian Wax', 30, 65], ['Back Massage', 30, 60], ['Hand & Foot Treatment', 45, 70],
      ],
      'Lash Studio': [
        ['Classic Full Set', 90, 130], ['Hybrid Full Set', 105, 150], ['Volume Full Set', 120, 170], ['Mega Volume Full Set', 150, 200],
        ['Infill', 60, 70], ['Lash Lift', 45, 75], ['Lash Lift & Tint', 60, 90], ['Lash Tint', 15, 25], ['Lash Removal', 20, 25],
      ],
      'Brow Studio': [
        ['Brow Consultation', 15, 0], ['Brow Shape', 20, 30], ['Brow Tint', 15, 20], ['Shape & Tint', 30, 45], ['Brow Lamination', 45, 85],
        ['Brow Lamination & Tint', 60, 95], ['Henna Brows', 45, 65],
      ],
      'Lash & Brow Bar': [
        ['Classic Lash Set', 90, 130], ['Lash Infill', 60, 70], ['Lash Lift & Tint', 60, 90], ['Brow Shape', 20, 30], ['Brow Tint', 15, 20],
        ['Brow Lamination', 45, 85], ['Henna Brows', 45, 65], ['Lash Lift & Brow Lamination', 90, 160],
      ],
      'Makeup Artist': [
        ['Express Makeup', 30, 70], ['Event Makeup', 60, 120], ['Photoshoot Makeup', 60, 130], ['Formal/School Ball', 60, 110],
        ['Bridal Trial', 90, 150], ['Bridal Makeup', 90, 250], ['Bridesmaid Makeup', 60, 120], ['Lesson', 90, 150],
      ],
      Waxing: [
        ['Eyebrow', 15, 20], ['Lip', 10, 15], ['Chin', 10, 15], ['Underarm', 15, 25], ['Full Arm', 30, 45], ['Half Leg', 30, 45],
        ['Full Leg', 45, 70], ['Bikini', 20, 40], ['Brazilian', 30, 65], ['Back', 30, 50], ['Chest', 30, 45],
      ],
    },
  },
  {
    id: 'skin',
    name: 'Skin & Aesthetics',
    icon: icon('drop.fill', 'water_drop'),
    words: { staff: 'skin therapist', booking: 'appointment', customer: 'client' },
    staff: { 'Cosmetic Injectables': 'injector', 'Laser Hair Removal': 'laser technician' },
    types: {
      'Skin Clinic / Facials': [
        ['Consultation', 20, 0], ['Express Facial', 30, 65], ['Signature Facial', 60, 120], ['Acne Facial', 60, 120], ['Hydrafacial', 60, 199],
        ['Dermaplaning', 45, 90], ['Microdermabrasion', 45, 110], ['Chemical Peel', 45, 150], ['LED Therapy', 30, 60], ['Skin Needling', 60, 299],
      ],
      'Cosmetic Injectables': [
        ['Consultation', 20, 0], ['Anti-Wrinkle Treatment', 30, 300], ['Anti-Wrinkle Top-Up', 15, 150], ['Lip Filler', 45, 550],
        ['Dermal Filler', 45, 600], ['Skin Booster', 45, 400], ['Filler Dissolve', 30, 350], ['Review Appointment', 15, 0],
      ],
      'Laser Hair Removal': [
        ['Patch Test', 15, 0], ['Face', 20, 79], ['Underarms', 15, 69], ['Bikini', 20, 89], ['Brazilian', 30, 129], ['Full Arms', 45, 179],
        ['Half Legs', 30, 149], ['Full Legs', 60, 249], ['Back', 45, 199], ["Men's Chest", 30, 149],
      ],
    },
  },
  {
    id: 'body-art',
    name: 'Body Art',
    icon: icon('paintbrush.pointed.fill', 'brush'),
    words: { staff: 'artist', booking: 'session', customer: 'client' },
    staff: { 'Piercing Studio': 'piercer' },
    booking: { 'Piercing Studio': 'appointment' },
    types: {
      'Tattoo Studio': [
        ['Consultation', 30, 0], ['Flash Tattoo', 60, 120], ['Small Tattoo', 60, 150], ['Fine Line Tattoo', 90, 250], ['Medium Tattoo', 120, 350],
        ['Hourly Session', 60, 180], ['Half Day Session', 240, 650], ['Full Day Session', 420, 1100], ['Touch-Up', 30, 60], ['Cover-Up Consult', 30, 0],
      ],
      'Piercing Studio': [
        ['Lobe', 15, 50], ['Helix', 20, 60], ['Tragus', 20, 65], ['Industrial', 30, 80], ['Nose', 20, 60], ['Septum', 20, 70], ['Navel', 20, 70],
        ['Downsize', 10, 20], ['Jewellery Change', 10, 20],
      ],
    },
  },
  {
    id: 'wellness',
    name: 'Wellness',
    icon: icon('leaf.fill', 'spa'),
    words: { staff: 'therapist', booking: 'appointment', customer: 'client' },
    staff: { 'Sauna / Float / Recovery': 'team member' },
    booking: { 'Sauna / Float / Recovery': 'session' },
    types: {
      Massage: [
        ['Relaxation Massage (60 min)', 60, 90], ['Relaxation Massage (90 min)', 90, 130], ['Remedial Massage', 60, 100], ['Deep Tissue', 60, 105],
        ['Sports Massage', 60, 100], ['Pregnancy Massage', 60, 100], ['Head, Neck & Shoulders', 30, 60], ['Hot Stone', 75, 120],
        ['Reflexology', 45, 80], ['Lymphatic Drainage', 60, 110], ['Couples Massage', 60, 190],
      ],
      'Day Spa': [
        ['Express Facial', 30, 65], ['Signature Facial', 60, 120], ['Massage', 60, 100], ['Hot Stone Massage', 75, 130], ['Body Scrub', 45, 90],
        ['Body Wrap', 60, 120], ['Spa Package', 120, 250], ['Couples Package', 120, 450],
      ],
      'Sauna / Float / Recovery': [
        ['Float Session', 60, 79], ['Infrared Sauna', 45, 40], ['Infrared Sauna (couples)', 45, 70], ['Ice Bath & Sauna', 60, 45],
        ['Cold Plunge', 15, 20], ['Compression Therapy', 30, 35], ['Group Session', 60, 35],
      ],
    },
  },
  {
    id: 'health',
    name: 'Health & Allied Health',
    icon: icon('cross.case.fill', 'medical_services'),
    words: { staff: 'practitioner', booking: 'appointment', customer: 'patient' },
    staff: { Physiotherapy: 'physio', Chiropractor: 'chiropractor', Osteopathy: 'osteopath' },
    types: {
      Physiotherapy: [
        ['Initial Consult', 45, 110], ['Standard Consult', 30, 90], ['Long Consult', 60, 140], ['Sports Injury Assessment', 45, 110],
        ['Telehealth Consult', 30, 85], ['Dry Needling (add-on)', 15, 20], ['Rehab Session', 45, 85], ['Clinical Pilates (1:1)', 45, 95],
      ],
      Chiropractor: [
        ['Initial Consult', 45, 95], ['Standard Adjustment', 15, 65], ['Long Adjustment', 30, 85], ['Re-Assessment', 30, 85],
        ['Posture Assessment', 30, 75], ['Child Adjustment', 15, 45],
      ],
      Osteopathy: [
        ['Initial Consult', 60, 120], ['Standard Consult', 45, 100], ['Short Consult', 30, 80], ['Pregnancy Osteopathy', 45, 105],
        ['Infant Osteopathy', 30, 85], ['Dry Needling (add-on)', 15, 20],
      ],
    },
  },
  {
    id: 'fitness',
    name: 'Fitness',
    icon: icon('figure.run', 'fitness_center'),
    words: { staff: 'trainer', booking: 'session', customer: 'client' },
    staff: { 'Yoga Studio': 'instructor', 'Pilates Studio': 'instructor' },
    booking: { 'Yoga Studio': 'class', 'Pilates Studio': 'class' },
    types: {
      'Personal Trainer': [
        ['Free Consult', 20, 0], ['30 Min PT', 30, 50], ['45 Min PT', 45, 70], ['60 Min PT', 60, 85], ['Partner PT', 60, 110],
        ['Boxing PT', 45, 75], ['Small Group', 60, 35], ['Program Design', 60, 120],
      ],
      'Yoga Studio': [
        ['Intro Class', 60, 15], ['Drop-In Class', 60, 28], ['Beginners Class', 60, 22], ['Yin Class', 75, 28], ['Hot Yoga Class', 60, 30],
        ['Private Session', 60, 110], ['Group Private Session', 60, 180],
      ],
      'Pilates Studio': [
        ['Intro Session', 50, 20], ['Reformer Class', 50, 35], ['Mat Class', 50, 25], ['Barre Class', 45, 28], ['Private Session', 55, 110],
        ['Duet Session', 55, 140], ['Clinical Pilates', 55, 95],
      ],
    },
  },
  {
    id: 'pets',
    name: 'Pets',
    icon: icon('pawprint.fill', 'pets'),
    words: { staff: 'groomer', booking: 'appointment', customer: 'client' },
    types: {
      'Dog Grooming': [
        ['Small Dog Full Groom', 90, 80], ['Medium Dog Full Groom', 120, 100], ['Large Dog Full Groom', 150, 130], ['Puppy Groom', 60, 50],
        ['Bath & Brush', 60, 60], ['Face, Feet & Tail Tidy', 30, 40], ['De-Shedding Treatment', 60, 70], ['Nail Clip', 15, 20],
        ['Teeth Brushing', 10, 15], ['Cat Groom', 90, 110],
      ],
    },
  },
  {
    id: 'lessons',
    name: 'Lessons & Tutoring',
    icon: icon('book.fill', 'school'),
    words: { staff: 'tutor', booking: 'lesson', customer: 'student' },
    staff: { 'Music Lessons': 'teacher', 'Driving Instructor': 'instructor' },
    booking: { Tutoring: 'session' },
    types: {
      Tutoring: [
        ['Assessment Session', 45, 50], ['30 Min Session', 30, 40], ['1 Hour Session', 60, 70], ['Online Session', 60, 65],
        ['Homework Help', 30, 40], ['Group Session', 60, 35], ['Exam Prep', 90, 100],
      ],
      'Music Lessons': [
        ['Trial Lesson', 30, 25], ['30 Min Lesson', 30, 40], ['45 Min Lesson', 45, 55], ['60 Min Lesson', 60, 70], ['Group Lesson', 60, 35],
        ['Exam Prep Lesson', 60, 80],
      ],
      'Driving Instructor': [
        ['1 Hour Lesson', 60, 75], ['90 Min Lesson', 90, 110], ['2 Hour Lesson', 120, 145], ['Refresher Lesson', 60, 75],
        ['Logbook Assessment', 60, 80], ['Overseas Licence Conversion', 60, 85], ['Test Package', 120, 180],
      ],
    },
  },
  {
    id: 'creative',
    name: 'Creative',
    icon: icon('camera.fill', 'photo_camera'),
    words: { staff: 'photographer', booking: 'session', customer: 'client' },
    staff: { 'Recording Studio': 'engineer' },
    types: {
      Photographer: [
        ['Mini Session', 20, 120], ['Headshots', 30, 180], ['Portrait Session', 60, 250], ['Family Session', 60, 300],
        ['Engagement Session', 90, 350], ['Newborn Session', 120, 400], ['Product Photography (per hour)', 60, 180],
        ['Event Coverage (per hour)', 60, 200], ['Wedding Package', 480, 2800],
      ],
      'Recording Studio': [
        ['Studio Hire (per hour)', 60, 70], ['Studio Hire (4 hours)', 240, 250], ['Podcast Recording', 60, 80], ['Voiceover Session', 60, 90],
        ['Mixing (per song)', 120, 150], ['Mastering (per song)', 60, 60],
      ],
    },
  },
  {
    id: 'experiences',
    name: 'Experiences & Venues',
    icon: icon('ticket.fill', 'confirmation_number'),
    words: { staff: 'host', booking: 'booking', customer: 'guest' },
    types: {
      'Escape Room / Golf Simulator / Karaoke Room': [
        ['1 Hour Booking', 60, 60], ['90 Min Booking', 90, 85], ['2 Hour Booking', 120, 110], ['Group Package', 120, 250],
        ['Kids Party', 120, 300], ['Party Package', 180, 400], ['Corporate Package', 180, 600],
      ],
    },
  },
  {
    id: 'coaching',
    name: 'Coaching & Consulting',
    icon: icon('person.2.wave.2.fill', 'record_voice_over'),
    words: { staff: 'coach', booking: 'session', customer: 'client' },
    types: {
      'Life / Business Coach': [
        ['Discovery Call', 20, 0], ['1 Hour Session', 60, 150], ['Follow-Up Session', 45, 120], ['90 Min Session', 90, 220],
        ['Strategy Intensive', 180, 450], ['Group Workshop', 120, 80], ['4 Session Package', 240, 520],
      ],
    },
  },
  {
    id: 'other',
    name: 'Other',
    icon: icon('ellipsis.circle.fill', 'more_horiz'),
    words: { staff: 'team member', booking: 'appointment', customer: 'client' },
    types: {},
  },
];

const slug = (text: string) =>
  text
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

/** Every category, each ending with "Other – enter my own" (no preset services). */
export const BOOKING_CATEGORIES: BookingCategory[] = RAW.map((c) => ({
  id: c.id,
  name: c.name,
  icon: c.icon,
  types: [
    ...Object.entries(c.types).map(([name, list]) => ({
      id: `${c.id}/${slug(name)}`,
      name,
      categoryId: c.id,
      services: list.map(([n, minutes, audPrice]) => ({ name: n, minutes, audPrice })),
      words: { ...c.words, staff: c.staff?.[name] ?? c.words.staff, booking: c.booking?.[name] ?? c.words.booking },
    })),
    { id: `${c.id}/other`, name: 'Other – enter my own', categoryId: c.id, services: [], words: c.words, other: true },
  ],
}));

export const BOOKING_TYPES: BookingBusinessType[] = BOOKING_CATEGORIES.flatMap((c) => c.types);

export const findBookingType = (id: string) => BOOKING_TYPES.find((t) => t.id === id) ?? null;
export const findBookingCategory = (id: string) => BOOKING_CATEGORIES.find((c) => c.id === id) ?? null;

/**
 * The business's type from its saved business types (the first one is the type
 * picked at sign-up). Older ids that no longer exist fall back to their
 * category's "Other", so the wording still fits.
 */
export function businessTypeOf(typeIds: readonly string[] | null | undefined): BookingBusinessType | null {
  const id = typeIds?.[0];
  if (!id) return null;
  return findBookingType(id) ?? findBookingType(`${id.split('/')[0]}/other`);
}

const GENERAL_WORDS: BookingWords = { staff: 'team member', booking: 'appointment', customer: 'client' };

/** What this business calls its people, bookings and customers ("barber", "appointment", "client"). */
export function bookingWords(typeIds: readonly string[] | null | undefined): BookingWords {
  return businessTypeOf(typeIds)?.words ?? GENERAL_WORDS;
}

/** "barber" -> "Barber", "nail tech" -> "Nail Tech". */
export const titleCase = (text: string) => text.replace(/(^|[\s/&-])([a-z])/g, (_, gap: string, c: string) => gap + c.toUpperCase());

/** "barber" -> "barbers", "class" -> "classes". */
export const plural = (word: string) => (/(s|sh|ch|x)$/.test(word) ? `${word}es` : `${word}s`);

/** "an appointment", "a session". */
export const withArticle = (word: string) => `${/^[aeiou]/i.test(word) ? 'an' : 'a'} ${word}`;

/** Positions suggested when adding an employee, e.g. Barber, Senior Barber, Apprentice. */
export function roleSuggestions(typeIds: readonly string[] | null | undefined) {
  const staff = titleCase(bookingWords(typeIds).staff);
  const own = staff === 'Team Member' ? [] : [staff, `Senior ${staff}`];
  return [...new Set([...own, 'Apprentice', 'Team Member', 'Receptionist', 'Manager'])];
}

/** Types whose name matches the search (any word starting with what was typed). */
export function searchBookingTypes(query: string, categoryId: string | null) {
  const words = query.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  return BOOKING_TYPES.filter((t) => {
    if (categoryId && t.categoryId !== categoryId) return false;
    if (!words.length) return true;
    const name = t.name.toLowerCase().split(/[^a-z0-9]+/);
    return words.every((w) => name.some((n) => n.startsWith(w)));
  });
}

export type ServiceDraft = {
  /** Stable key while editing (preset: "<type id>:<index>", custom: "custom:<n>"). */
  key: string;
  name: string;
  minutes: number;
  /** null = not entered yet (non-Australian businesses enter their own). */
  price: number | null;
  /** The category name shown to customers, e.g. "Barber". */
  category: string;
  selected: boolean;
};

/**
 * The preset services for the business's type (only that one type, never
 * another's), all ticked. Prices are filled in only for Australian businesses
 * (they're AUD suggestions).
 */
export function presetServices(typeIds: readonly string[], country: string | null): ServiceDraft[] {
  const type = businessTypeOf(typeIds);
  if (!type || type.id !== typeIds[0]) return [];
  return type.services.map((s, i) => ({
    key: `${type.id}:${i}`,
    name: s.name,
    minutes: s.minutes,
    price: country === 'AU' ? s.audPrice : null,
    category: type.name,
    selected: true,
  }));
}
