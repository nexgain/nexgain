// =============================================================================
//  NexGain Bookings — business types and their preset services.
//  The ONE place to add or change booking business types. Nothing else needs
//  editing: sign-up, the services screen and the booking page all read this.
// =============================================================================
//
//  Each service: [name, minutes, AUD price]. Prices are starting suggestions,
//  pre-filled only for Australian businesses (other countries enter their own).
//  Types that already exist in System One (the service-based system) are left
//  out on purpose: Spray Tan, Cosmetic Tattoo, Myotherapy, Acupuncture,
//  Podiatry, Dietitian / Nutritionist, Psychologist / Counsellor, Dental Clinic,
//  Optometrist, Boxing / Martial Arts, Dance Studio, Swim School, Dog Training,
//  Vet Clinic, Pet Sitting / Dog Walking, Language Lessons, Videographer, Car
//  Detailing and Window Tinting. (See src/data/industries.ts for System One's list.)
//
//  To add a type: add a line to a category's `types`. To add a category: copy
//  one of the blocks below. Every category also gets "Other – enter my own"
//  automatically (an empty service list).
import type { SymbolViewProps } from 'expo-symbols';

type IconName = SymbolViewProps['name'];
type Preset = [name: string, minutes: number, audPrice: number];

export type BookingService = { name: string; minutes: number; audPrice: number };
export type BookingBusinessType = { id: string; name: string; categoryId: string; services: BookingService[]; other?: boolean };
export type BookingCategory = { id: string; name: string; icon: IconName; types: BookingBusinessType[] };

const icon = (ios: string, android: string): IconName => ({ ios, android, web: android }) as IconName;

const RAW: { id: string; name: string; icon: IconName; types: Record<string, Preset[]> }[] = [
  {
    id: 'hair',
    name: 'Hair & Barber',
    icon: icon('scissors', 'content_cut'),
    types: {
      Barber: [
        ['Standard Cut', 30, 35], ['Skin Fade', 45, 50], ['Zero Fade', 40, 45], ['Drop Fade', 45, 50], ['Taper Fade', 40, 45],
        ['Buzz Cut', 20, 25], ['Scissor Cut', 40, 45], ['Beard Trim', 20, 25], ['Beard Shape & Line Up', 25, 30],
        ['Hot Towel Shave', 30, 40], ['Cut & Beard', 60, 65], ['Kids Cut', 30, 28], ['Hair Design/Part', 15, 10],
      ],
      'Hair Salon': [
        ["Women's Cut & Blow-Dry", 60, 85], ["Men's Cut", 30, 45], ['Kids Cut', 30, 35], ['Blow-Dry', 45, 55], ['Root Colour', 90, 120],
        ['Full Colour', 120, 160], ['Half Head Foils', 120, 180], ['Full Head Foils', 150, 240], ['Balayage', 180, 280],
        ['Toner', 30, 50], ['Treatment', 30, 45], ['Keratin Smoothing', 180, 350], ['Updo/Event Styling', 60, 95],
      ],
      'Hair Extensions': [
        ['Consultation', 20, 0], ['Tape Extensions Install', 120, 450], ['Tape Move-Up', 90, 180], ['Weft Install', 150, 550], ['Removal', 45, 80],
      ],
      Braiding: [['Box Braids', 300, 250], ['Knotless Braids', 360, 300], ['Cornrows', 90, 80], ['Twists', 240, 200], ['Kids Braids', 120, 100]],
    },
  },
  {
    id: 'nails',
    name: 'Nails',
    icon: icon('hand.raised.fill', 'back_hand'),
    types: {
      'Nail Salon': [
        ['Classic Manicure', 30, 40], ['Gel Manicure', 45, 55], ['Classic Pedicure', 45, 55], ['Gel Pedicure', 60, 70],
        ['Acrylic Full Set', 75, 75], ['Acrylic Refill', 60, 55], ['SNS/Dip Powder', 60, 65], ['BIAB', 60, 70],
        ['Gel Removal', 20, 15], ['Nail Art (per set)', 15, 15], ['Mani & Pedi Combo', 90, 100],
      ],
    },
  },
  {
    id: 'beauty',
    name: 'Beauty',
    icon: icon('sparkles', 'auto_awesome'),
    types: {
      'Lash Studio': [
        ['Classic Full Set', 90, 130], ['Hybrid Full Set', 105, 150], ['Volume Full Set', 120, 170], ['Infill', 60, 70],
        ['Lash Lift & Tint', 60, 90], ['Lash Removal', 20, 25],
      ],
      'Brow Studio': [['Brow Shape', 20, 30], ['Brow Tint', 15, 20], ['Shape & Tint', 30, 45], ['Brow Lamination', 45, 85], ['Henna Brows', 45, 65]],
      'Makeup Artist': [['Event Makeup', 60, 120], ['Bridal Makeup', 90, 250], ['Bridal Trial', 90, 150], ['Formal/School Ball', 60, 110], ['Lesson', 90, 150]],
      Waxing: [
        ['Eyebrow', 15, 20], ['Lip', 10, 15], ['Underarm', 15, 25], ['Half Leg', 30, 45], ['Full Leg', 45, 70], ['Bikini', 20, 40],
        ['Brazilian', 30, 65], ['Back', 30, 50],
      ],
      'Beauty Salon (general)': [
        ['Facial', 60, 95], ['Waxing', 30, 45], ['Lash Lift', 60, 90], ['Brow Shape & Tint', 30, 45], ['Spray Tan', 20, 45], ['Gel Manicure', 45, 55],
      ],
    },
  },
  {
    id: 'skin',
    name: 'Skin & Aesthetics',
    icon: icon('drop.fill', 'water_drop'),
    types: {
      'Skin Clinic / Facials': [
        ['Express Facial', 30, 65], ['Signature Facial', 60, 120], ['Hydrafacial', 60, 199], ['Microdermabrasion', 45, 110],
        ['Chemical Peel', 45, 150], ['LED Therapy', 30, 60], ['Skin Needling', 60, 299], ['Consultation', 20, 0],
      ],
      'Cosmetic Injectables': [
        ['Consultation', 20, 0], ['Anti-Wrinkle Treatment', 30, 300], ['Lip Filler', 45, 550], ['Dermal Filler', 45, 600], ['Review Appointment', 15, 0],
      ],
      'Laser Hair Removal': [
        ['Patch Test', 15, 0], ['Underarms', 15, 69], ['Bikini', 20, 89], ['Brazilian', 30, 129], ['Full Legs', 60, 249], ['Face', 20, 79],
      ],
    },
  },
  {
    id: 'body-art',
    name: 'Body Art',
    icon: icon('paintbrush.pointed.fill', 'brush'),
    types: {
      'Tattoo Studio': [
        ['Consultation', 30, 0], ['Small Tattoo', 60, 150], ['Medium Tattoo', 120, 350], ['Hourly Session', 60, 180],
        ['Half Day Session', 240, 650], ['Full Day Session', 420, 1100], ['Touch-Up', 30, 60], ['Cover-Up Consult', 30, 0],
      ],
      'Piercing Studio': [['Lobe', 15, 50], ['Helix', 20, 60], ['Nose', 20, 60], ['Septum', 20, 70], ['Navel', 20, 70], ['Jewellery Change', 10, 20]],
    },
  },
  {
    id: 'wellness',
    name: 'Wellness',
    icon: icon('leaf.fill', 'spa'),
    types: {
      Massage: [
        ['Relaxation', 60, 90], ['Relaxation', 90, 130], ['Remedial', 60, 100], ['Deep Tissue', 60, 105], ['Sports Massage', 60, 100],
        ['Pregnancy Massage', 60, 100], ['Hot Stone', 75, 120], ['Couples Massage', 60, 190],
      ],
      'Day Spa': [['Signature Facial', 60, 120], ['Massage', 60, 100], ['Body Scrub', 45, 90], ['Spa Package', 120, 250], ['Couples Package', 120, 450]],
      'Sauna / Float / Recovery': [['Float Session', 60, 79], ['Infrared Sauna', 45, 40], ['Ice Bath & Sauna', 60, 45], ['Group Session', 60, 35]],
    },
  },
  {
    id: 'health',
    name: 'Health & Allied Health',
    icon: icon('cross.case.fill', 'medical_services'),
    types: {
      Physiotherapy: [
        ['Initial Consult', 45, 110], ['Standard Consult', 30, 90], ['Long Consult', 60, 140], ['Dry Needling (add-on)', 15, 20], ['Rehab Session', 45, 85],
      ],
      Chiropractor: [['Initial Consult', 45, 95], ['Standard Adjustment', 15, 65], ['Long Adjustment', 30, 85]],
      Osteopathy: [['Initial Consult', 60, 120], ['Follow-Up', 45, 100]],
    },
  },
  {
    id: 'fitness',
    name: 'Fitness',
    icon: icon('figure.run', 'fitness_center'),
    types: {
      'Personal Trainer': [['30 Min PT', 30, 50], ['60 Min PT', 60, 85], ['Partner PT', 60, 110], ['Free Consult', 20, 0], ['Small Group', 60, 35]],
      'Yoga Studio': [['Drop-In Class', 60, 28], ['Private Session', 60, 110], ['Intro Class', 60, 15]],
      'Pilates Studio': [['Reformer Class', 50, 35], ['Mat Class', 50, 25], ['Private Session', 55, 110], ['Intro Session', 50, 20]],
    },
  },
  {
    id: 'pets',
    name: 'Pets',
    icon: icon('pawprint.fill', 'pets'),
    types: {
      'Dog Grooming': [
        ['Small Dog Full Groom', 90, 80], ['Medium Dog Full Groom', 120, 100], ['Large Dog Full Groom', 150, 130],
        ['Bath & Brush', 60, 60], ['Nail Clip', 15, 20], ['Puppy Groom', 60, 50],
      ],
    },
  },
  {
    id: 'lessons',
    name: 'Lessons & Tutoring',
    icon: icon('book.fill', 'school'),
    types: {
      Tutoring: [['1 Hour Session', 60, 70], ['30 Min Session', 30, 40], ['Group Session', 60, 35], ['Exam Prep', 90, 100]],
      'Music Lessons': [['30 Min Lesson', 30, 40], ['45 Min Lesson', 45, 55], ['60 Min Lesson', 60, 70], ['Trial Lesson', 30, 25]],
      'Driving Instructor': [['1 Hour Lesson', 60, 75], ['2 Hour Lesson', 120, 145], ['Test Package', 120, 180]],
    },
  },
  {
    id: 'creative',
    name: 'Creative',
    icon: icon('camera.fill', 'photo_camera'),
    types: {
      Photographer: [
        ['Portrait Session', 60, 250], ['Family Session', 60, 300], ['Headshots', 30, 180], ['Event Coverage (per hour)', 60, 200],
        ['Wedding Package', 480, 2800],
      ],
      'Recording Studio': [['Studio Hire (per hour)', 60, 70], ['Mixing (per song)', 120, 150], ['Mastering (per song)', 60, 60]],
    },
  },
  {
    id: 'experiences',
    name: 'Experiences & Venues',
    icon: icon('ticket.fill', 'confirmation_number'),
    types: {
      'Escape Room / Golf Simulator / Karaoke Room': [
        ['1 Hour Booking', 60, 60], ['2 Hour Booking', 120, 110], ['Group Package', 120, 250], ['Party Package', 180, 400],
      ],
    },
  },
  {
    id: 'coaching',
    name: 'Coaching & Consulting',
    icon: icon('person.2.wave.2.fill', 'record_voice_over'),
    types: {
      'Life / Business Coach': [['Discovery Call', 20, 0], ['1 Hour Session', 60, 150], ['90 Min Session', 90, 220], ['4 Session Package', 240, 520]],
    },
  },
  {
    id: 'other',
    name: 'Other',
    icon: icon('ellipsis.circle.fill', 'more_horiz'),
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
    })),
    { id: `${c.id}/other`, name: 'Other – enter my own', categoryId: c.id, services: [], other: true },
  ],
}));

export const BOOKING_TYPES: BookingBusinessType[] = BOOKING_CATEGORIES.flatMap((c) => c.types);

export const findBookingType = (id: string) => BOOKING_TYPES.find((t) => t.id === id) ?? null;
export const findBookingCategory = (id: string) => BOOKING_CATEGORIES.find((c) => c.id === id) ?? null;

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
 * The preset services for the chosen types, all ticked. Prices are filled in
 * only for Australian businesses (they're AUD suggestions). Duplicate names
 * (e.g. "Kids Cut" in Barber and Hair Salon) appear once, from the first type.
 */
export function presetServices(typeIds: string[], country: string | null): ServiceDraft[] {
  const seen = new Set<string>();
  const out: ServiceDraft[] = [];
  for (const id of typeIds) {
    const type = findBookingType(id);
    if (!type) continue;
    type.services.forEach((s, i) => {
      const key = `${s.name.toLowerCase()}|${s.minutes}`;
      if (seen.has(key)) return;
      seen.add(key);
      out.push({
        key: `${type.id}:${i}`,
        name: s.name,
        minutes: s.minutes,
        price: country === 'AU' ? s.audPrice : null,
        category: type.name,
        selected: true,
      });
    });
  }
  return out;
}
