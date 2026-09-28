// Built-in list of service-based industries used by owner sign-up: the smart
// industry search, pre-filled business details and recommended services.
// Each line: 'Industry name | search keywords | Service, Service, ...'
// Services are listed most common first; the first few are ticked by default.
import type { SymbolViewProps } from 'expo-symbols';

type IconName = SymbolViewProps['name'];

export type Industry = {
  id: string;
  name: string;
  category: string;
  keywords: string[];
  services: string[];
};

type Category = {
  name: string;
  icon: IconName;
  businessType: string;
  vehicles: string;
  lines: string[];
};

const CATEGORIES: Category[] = [
  {
    name: 'Construction & Trades',
    icon: { ios: 'hammer.fill', android: 'construction', web: 'construction' },
    businessType: 'Sole Trader',
    vehicles: '1',
    lines: [
      'Carpentry | carpenter timber wood joinery framing decking building | Residential Carpentry, Decks & Pergolas, Renovations, Framing, Carpentry Maintenance, Fit Outs, Door & Window Installation, Custom Joinery, Timber Flooring, Outdoor Structures',
      'Builder | building construction home builder extensions renovations | New Home Builds, Extensions, Renovations, Knockdown Rebuilds, Granny Flats, Project Management, Structural Repairs, Site Inspections',
      'Building & Carpentry | building carpenter construction | Residential Building, Carpentry, Renovations, Decks & Pergolas, Extensions, Maintenance & Repairs',
      'Building Inspection | building inspector pre-purchase pest report | Pre-Purchase Inspections, Pest Inspections, Building Defect Reports, Pre-Sale Inspections, Construction Stage Inspections, Dilapidation Reports',
      'Building Maintenance | building maintenance repairs strata | General Repairs, Preventative Maintenance, Strata Maintenance, Painting Touch-Ups, Gutter Repairs, Door & Lock Repairs',
      'Plumbing | plumber pipes drains hot water gas leaks | Blocked Drains, Hot Water Systems, Leak Detection & Repairs, Tap & Toilet Repairs, Bathroom Plumbing, Gas Fitting, Emergency Plumbing, New Installations, Backflow Testing',
      'Electrical | electrician sparky wiring lighting power | Lighting Installation, Power Points, Switchboard Upgrades, Safety Inspections, Fault Finding, Ceiling Fans, Smoke Alarms, Emergency Call-Outs, EV Charger Installation',
      'Painting & Decorating | painter paint interior exterior decorator | Interior Painting, Exterior Painting, Commercial Painting, Roof Painting, Wallpapering, Colour Consultation, Feature Walls, Deck Staining',
      'Tiling | tiler tiles bathroom floor splashback | Floor Tiling, Wall Tiling, Bathroom Tiling, Kitchen Splashbacks, Outdoor Tiling, Tile Repairs, Waterproofing, Regrouting',
      'Plastering | plasterer gyprock drywall ceiling | Plasterboard Installation, Ceiling Repairs, Cornice Installation, Patching & Repairs, Rendering, Suspended Ceilings',
      'Roofing | roofer roof tiles metal colorbond | Roof Repairs, Roof Restoration, New Roof Installation, Leak Detection, Re-Roofing, Roof Inspections, Guttering, Skylights',
      'Guttering | gutters downpipes fascia roof | Gutter Replacement, Gutter Repairs, Downpipes, Gutter Guards, Fascia Replacement, Gutter Cleaning',
      'Concreting | concreter concrete slab driveway footpath | Driveways, House Slabs, Paths & Patios, Exposed Aggregate, Polished Concrete, Concrete Repairs, Footings, Stencil Concrete',
      'Bricklaying | bricklayer brickie brick block masonry | Brick Walls, Retaining Walls, Brick Repairs, Block Work, Letterboxes & Pillars, Repointing',
      'Stonemasonry | stonemason stone masonry | Stone Walls, Stone Cladding, Stone Paving, Stone Repairs, Fireplaces, Headstones',
      'Fencing | fence fencer gates colorbond | Colorbond Fencing, Timber Fencing, Pool Fencing, Gates, Fence Repairs, Glass Fencing, Retaining Walls',
      'Welding & Fabrication | welder metal fabrication steel boilermaker | Custom Fabrication, Steel Welding, Aluminium Welding, Gates & Balustrades, Welding Repairs, Mobile Welding, Trailer Repairs',
      'Glazing | glazier glass windows shower screens | Window Glass Replacement, Glass Repairs, Shower Screens, Glass Splashbacks, Mirrors, Double Glazing, Emergency Boarding Up',
      'Flooring | floor installer timber vinyl laminate carpet | Timber Flooring, Vinyl Plank, Laminate Flooring, Floor Sanding & Polishing, Carpet Laying, Floor Repairs',
      'Cabinet Making | cabinetmaker joinery kitchen wardrobes | Kitchen Cabinets, Wardrobes, Vanities, Custom Joinery, Entertainment Units, Cabinet Repairs',
      'Kitchen Renovations | kitchen renovation remodel reno | Full Kitchen Renovations, Kitchen Design, Benchtops, Cabinetry, Splashbacks, Appliance Installation',
      'Bathroom Renovations | bathroom renovation remodel reno | Full Bathroom Renovations, Waterproofing, Bathroom Tiling, Vanity Installation, Shower Screens, Accessible Bathrooms',
      'Air Conditioning | aircon hvac heating cooling split ducted | Split System Installation, Ducted Air Conditioning, Air Con Servicing, Air Con Repairs, Heating Systems, Commercial HVAC',
      'Refrigeration | refrigeration fridge cool room commercial | Cool Room Repairs, Commercial Refrigeration, Fridge Repairs, Freezer Repairs, Maintenance Contracts',
      'Solar Installation | solar panels battery renewable energy | Solar Panel Installation, Battery Storage, Solar Repairs, Inverter Replacement, Solar Panel Cleaning, System Inspections',
      'Insulation | insulation batts ceiling walls | Ceiling Insulation, Wall Insulation, Underfloor Insulation, Insulation Removal, Roof Sarking',
      'Waterproofing | waterproof membrane leaks balcony | Bathroom Waterproofing, Balcony Waterproofing, Basement Waterproofing, Leak Repairs, Roof Membranes',
      'Demolition | demolition removal strip out asbestos | House Demolition, Internal Strip Outs, Asbestos Removal, Site Clearing, Partial Demolition',
      'Excavation & Earthmoving | excavator earthmoving digging bobcat | Site Preparation, Trenching, Bobcat Hire, Excavation, Land Clearing, Driveway Preparation',
      'Scaffolding | scaffold access height | Scaffold Hire, Scaffold Installation, Edge Protection, Mobile Scaffolds',
      'Surveying | surveyor land boundary | Land Surveys, Boundary Surveys, Subdivisions, Construction Set Out, Contour Surveys',
      'Drafting & Design | drafter plans architectural drafting | House Plans, Council Approvals, 3D Renders, Extension Plans, Commercial Drafting',
      'Pool Construction | pool builder swimming pools | Concrete Pools, Fibreglass Pools, Pool Renovations, Pool Fencing, Pool Paving',
      'Shopfitting | shopfitter retail fit out office | Retail Fit Outs, Office Fit Outs, Commercial Joinery, Signage Installation, Partitions',
      'Locksmith | locksmith locks keys security | Lockouts, Lock Installation, Rekeying, Key Cutting, Safes, Master Key Systems, Security Doors',
      'Gas Fitting | gasfitter gas appliances heater | Gas Appliance Installation, Gas Leak Repairs, Gas Heater Servicing, Gas Compliance Certificates, BBQ Connections',
      'Security Systems | alarms cctv cameras intercom | Alarm Installation, CCTV Cameras, Intercoms, Access Control, Alarm Monitoring, System Servicing',
      'Antenna & Data Cabling | antenna tv data cabling nbn | TV Antenna Installation, Data Cabling, TV Wall Mounting, NBN Connections, Signal Repairs',
      'Garage Doors | garage door roller opener | Garage Door Installation, Garage Door Repairs, Motor Installation, Garage Door Servicing, Remote Replacement',
    ],
  },
  {
    name: 'Automotive',
    icon: { ios: 'car.fill', android: 'directions_car', web: 'directions_car' },
    businessType: 'Sole Trader',
    vehicles: '1',
    lines: [
      'Car Detailing | car detail detailer wash polish cleaning auto | Interior Detailing, Exterior Wash & Wax, Paint Correction, Ceramic Coating, Mobile Detailing, Headlight Restoration, Engine Bay Cleaning, Upholstery Cleaning',
      'Car Mechanic | car mechanic auto service repairs garage | Logbook Servicing, General Repairs, Brake Repairs, Diagnostics, Suspension Repairs, Clutch Repairs, Roadworthy Certificates, Air Con Regas',
      'Mobile Mechanic | car mechanic mobile auto service | Mobile Car Servicing, Battery Replacement, Brake Repairs, Diagnostics, Pre-Purchase Inspections, Breakdown Repairs',
      'Auto Electrician | car auto electrical battery | Battery Testing, Starter & Alternator Repairs, Wiring Repairs, Accessory Fitting, Dash Cam Installation, Diagnostics',
      'Panel Beating | panel beater smash repairs car body dent | Smash Repairs, Dent Repairs, Paintless Dent Removal, Spray Painting, Insurance Repairs, Bumper Repairs',
      'Automotive Spray Painting | car paint respray auto | Full Resprays, Paint Touch Ups, Bumper Resprays, Custom Paint, Rust Repairs',
      'Car Wash | car wash cleaning hand wash | Hand Car Wash, Express Wash, Interior Vacuum, Wax & Polish, Fleet Washing',
      'Tyre Services | tyres tires wheels car alignment | Tyre Fitting, Wheel Alignment, Wheel Balancing, Puncture Repairs, Mobile Tyre Service',
      'Towing | tow truck roadside car | Vehicle Towing, Roadside Assistance, Accident Towing, Car Removal, Machinery Transport',
      'Window Tinting | car tint film window tinting | Car Window Tinting, Home Window Tinting, Commercial Tinting, Tint Removal',
      'Motorcycle Mechanic | motorbike motorcycle bike mechanic | Motorcycle Servicing, Motorcycle Repairs, Tyre Fitting, Diagnostics, Pre-Purchase Inspections',
      'Boat & Marine Services | marine boat outboard | Boat Servicing, Outboard Repairs, Antifouling, Marine Electrical, Boat Detailing',
      'Caravan & RV Repairs | caravan rv camper motorhome | Caravan Servicing, Caravan Repairs, Solar & Electrical, Water Damage Repairs, Pre-Trip Inspections',
      'Windscreen Repairs | car windscreen glass chip | Windscreen Replacement, Chip Repairs, Mobile Windscreen Service, Rear Window Replacement',
      'Car Upholstery | car seats trim interior upholstery | Seat Repairs, Retrimming, Headliner Replacement, Custom Interiors',
    ],
  },
  {
    name: 'Home Services',
    icon: { ios: 'house.fill', android: 'home_repair_service', web: 'home_repair_service' },
    businessType: 'Sole Trader',
    vehicles: '1',
    lines: [
      'Cleaning | cleaner house home residential domestic cleaning | Regular House Cleaning, Deep Cleaning, End of Lease Cleaning, Spring Cleaning, Window Cleaning, Oven Cleaning, Move In Cleaning',
      'Commercial Cleaning | office cleaning cleaner commercial | Office Cleaning, Retail Cleaning, Medical Centre Cleaning, Strata Cleaning, Washroom Services, After Hours Cleaning',
      'Carpet Cleaning | carpet cleaner steam cleaning | Carpet Steam Cleaning, Stain Removal, Rug Cleaning, Upholstery Cleaning, Mattress Cleaning, Odour Treatment',
      'Window Cleaning | windows cleaner glass cleaning | Residential Window Cleaning, Commercial Window Cleaning, Screen Cleaning, High Rise Windows, Solar Panel Cleaning',
      'Pressure Washing | pressure cleaning high pressure wash house wash | Driveway Cleaning, House Washing, Roof Cleaning, Deck Cleaning, Graffiti Removal, Commercial Pressure Cleaning',
      'End of Lease Cleaning | bond cleaning vacate lease cleaning | Bond Cleaning, Carpet Steam Cleaning, Window Cleaning, Oven & Rangehood Cleaning, Wall Spot Cleaning',
      'Gutter Cleaning | gutters cleaning downpipes | Gutter Cleaning, Downpipe Unblocking, Gutter Guard Installation, Roof Valley Cleaning',
      'Handyman | handyman odd jobs repairs maintenance | General Repairs, Furniture Assembly, Picture & TV Hanging, Door Repairs, Minor Carpentry, Painting Touch-Ups',
      'Pest Control | pest exterminator termites spiders | General Pest Control, Termite Inspections, Termite Treatment, Rodent Control, Cockroach Treatment, Bed Bug Treatment, Possum Removal',
      'Rubbish Removal | junk removal waste rubbish | Household Rubbish Removal, Green Waste Removal, Furniture Removal, Construction Waste, Deceased Estate Clean Ups',
      'Removalist | removals removalists moving furniture | Local Moves, Interstate Moves, Office Relocations, Packing Services, Furniture Removal, Piano Moving',
      'Appliance Repairs | washing machine fridge dryer appliance repair | Washing Machine Repairs, Fridge Repairs, Dryer Repairs, Dishwasher Repairs, Oven & Cooktop Repairs, Appliance Installation',
      'Blinds & Curtains | blinds curtains shutters awnings | Blinds Installation, Curtains, Plantation Shutters, Outdoor Blinds, Blind Repairs, Measure & Quote',
      'Upholstery Cleaning | couch sofa cleaning upholstery | Couch Cleaning, Leather Cleaning, Mattress Cleaning, Stain Protection',
      'Tile & Grout Cleaning | tile grout cleaning shower | Tile Cleaning, Grout Cleaning, Regrouting, Sealing, Shower Restoration',
      'Chimney Sweeping | chimney fireplace flue sweep | Chimney Sweeping, Flue Inspections, Fireplace Cleaning, Cowl Installation',
      'Mould Removal | mould mold remediation | Mould Inspections, Mould Removal, Mould Remediation, Ceiling Mould Treatment',
      'Home Organising | declutter organising organizer | Decluttering, Wardrobe Organising, Pantry Organising, Moving Help',
      'Ironing & Laundry | laundry ironing wash fold | Ironing, Wash & Fold, Pickup & Delivery, Linen Service',
      'Interior Design | interior designer decorating styling | Interior Design Consultations, Home Styling, Colour Consultation, Furniture Selection, Home Staging',
      'Property Maintenance | property maintenance rental repairs | Rental Property Maintenance, General Repairs, Property Inspections, Garden Maintenance, Make Ready Services',
      'Tailoring & Alterations | tailor alterations sewing seamstress | Clothing Alterations, Hemming, Custom Tailoring, Clothing Repairs',
      'Shoe Repairs | cobbler shoes key cutting | Shoe Repairs, Heel Replacement, Key Cutting, Leather Repairs',
    ],
  },
  {
    name: 'Outdoor & Garden',
    icon: { ios: 'leaf.fill', android: 'yard', web: 'yard' },
    businessType: 'Sole Trader',
    vehicles: '1',
    lines: [
      'Landscaping | landscaper garden design landscape | Landscape Design, Garden Installation, Retaining Walls, Paving, Turf Laying, Irrigation, Garden Edging, Planting',
      'Lawn Mowing | lawn mowing grass mower | Lawn Mowing, Edging & Trimming, Hedge Trimming, Green Waste Removal, Lawn Fertilising, Weed Control',
      'Gardening | gardener garden maintenance | Garden Maintenance, Weeding, Pruning, Mulching, Planting, Garden Clean Ups',
      'Tree Services | arborist tree lopping removal stump | Tree Removal, Tree Pruning, Stump Grinding, Hedge Trimming, Emergency Tree Work, Arborist Reports',
      'Irrigation | irrigation sprinklers watering reticulation | Irrigation Installation, Sprinkler Repairs, Drip Systems, Controller Programming',
      'Paving | pavers paving pavement | Driveway Paving, Patio Paving, Pool Paving, Paving Repairs, Paving Sealing',
      'Turf Supply & Laying | turf lawn instant | Turf Laying, Turf Supply, Soil Preparation, Lawn Renovation',
      'Pool Maintenance | pool cleaning swimming pool service | Pool Cleaning, Water Testing, Pool Equipment Repairs, Green Pool Recovery, Pool Inspections',
      'Artificial Grass | synthetic turf fake grass | Artificial Grass Installation, Putting Greens, Artificial Grass Repairs, Artificial Grass Cleaning',
      'Retaining Walls | retaining walls sleepers | Timber Retaining Walls, Concrete Sleeper Walls, Block Retaining Walls, Retaining Wall Repairs',
      'Weed Control | weeds spraying weed | Weed Spraying, Weed Removal, Acreage Spraying',
    ],
  },
  {
    name: 'Beauty',
    icon: { ios: 'scissors', android: 'content_cut', web: 'content_cut' },
    businessType: 'Sole Trader',
    vehicles: '0',
    lines: [
      'Hairdressing | hairdresser hair salon stylist | Haircuts, Hair Colouring, Highlights, Blow Dry & Styling, Hair Treatments, Bridal Hair, Keratin Smoothing',
      'Barber | barbershop barber haircut men | Men\'s Haircuts, Fades, Beard Trims, Hot Towel Shaves, Kids Cuts',
      'Beauty Therapy | beauty salon therapist beautician | Facials, Waxing, Lash Tint, Brow Shaping, Spray Tans, Skin Treatments',
      'Nail Technician | nails nail salon manicure pedicure | Manicures, Pedicures, Gel Nails, Acrylic Nails, Nail Art, Nail Removal',
      'Makeup Artist | makeup mua artist | Bridal Makeup, Event Makeup, Makeup Lessons, Photoshoot Makeup',
      'Lash & Brow | eyelash lash extensions brows | Lash Extensions, Lash Lift, Brow Lamination, Brow Tint, Lash Infills',
      'Spray Tanning | tan tanning spray tan | Spray Tans, Mobile Tanning, Express Tans',
      'Cosmetic Tattooing | brows microblading cosmetic tattoo | Microblading, Lip Blush, Eyeliner Tattoo, Touch Ups',
      'Skin Clinic | skin clinic laser dermal | Skin Consultations, Laser Treatments, Chemical Peels, Microneedling, Anti-Ageing Treatments',
      'Tattoo Studio | tattoo artist ink | Custom Tattoos, Flash Tattoos, Cover Ups, Tattoo Touch Ups',
      'Mobile Hairdresser | hairdresser mobile hair | Home Haircuts, Hair Colouring, Aged Care Visits, Event Styling',
    ],
  },
  {
    name: 'Health & Wellness',
    icon: { ios: 'heart.fill', android: 'favorite', web: 'favorite' },
    businessType: 'Company',
    vehicles: '0',
    lines: [
      'Massage Therapy | massage remedial therapist | Remedial Massage, Relaxation Massage, Sports Massage, Pregnancy Massage, Mobile Massage',
      'Physiotherapy | physio physiotherapist rehab | Initial Assessments, Treatment Sessions, Sports Injuries, Rehabilitation, Dry Needling',
      'Chiropractic | chiropractor chiro spine | Chiropractic Adjustments, Initial Consultations, Posture Assessments, Sports Chiropractic',
      'Myotherapy | myotherapist muscle | Myotherapy Sessions, Dry Needling, Cupping, Injury Management',
      'Podiatry | podiatrist feet foot | General Foot Care, Orthotics, Nail Surgery, Biomechanical Assessments',
      'Psychology & Counselling | psychologist counsellor therapy mental health | Individual Counselling, Couples Counselling, Telehealth Sessions, Assessments',
      'Naturopathy | naturopath natural health | Naturopathy Consultations, Herbal Medicine, Nutrition Plans, Follow Up Consultations',
      'Nutritionist & Dietitian | nutrition nutritionist dietitian diet | Nutrition Consultations, Meal Plans, Weight Management, Sports Nutrition',
      'Dental Practice | dentist dental teeth | Check Up & Clean, Fillings, Teeth Whitening, Emergency Dental, Crowns',
      'Occupational Therapy | ot occupational therapist | OT Assessments, Home Modifications, Therapy Sessions, NDIS Supports',
      'Speech Pathology | speech therapy therapist | Speech Assessments, Therapy Sessions, Telehealth Sessions, School Visits',
      'Acupuncture | acupuncturist chinese medicine | Acupuncture Sessions, Cupping, Chinese Herbal Medicine',
      'Optometry | optometrist eyes glasses | Eye Tests, Contact Lens Fitting, Glasses, Children\'s Vision',
    ],
  },
  {
    name: 'Fitness',
    icon: { ios: 'figure.run', android: 'fitness_center', web: 'fitness_center' },
    businessType: 'Sole Trader',
    vehicles: '0',
    lines: [
      'Personal Training | personal trainer pt fitness gym coach | 1-on-1 Training, Group Training, Online Coaching, Nutrition Coaching, Fitness Assessments, Outdoor Bootcamps',
      'Yoga Studio | yoga instructor teacher | Group Yoga Classes, Private Yoga Sessions, Yoga Workshops, Corporate Yoga',
      'Pilates Studio | pilates reformer instructor | Reformer Classes, Mat Pilates, Private Pilates Sessions, Clinical Pilates',
      'Gym | gym fitness centre | Gym Memberships, Group Classes, Personal Training, Casual Passes',
      'Martial Arts | karate boxing bjj taekwondo | Kids Martial Arts, Adult Classes, Private Lessons, Self Defence',
      'Swimming Lessons | swim school swimming teacher | Kids Swimming Lessons, Adult Swimming Lessons, Squad Training, Private Swimming Lessons',
      'Dance School | dance classes teacher | Kids Dance Classes, Adult Dance Classes, Private Dance Lessons, Wedding Dance',
      'Sports Coaching | coach sports coaching | Private Coaching, Group Clinics, Holiday Camps, Team Training',
      'Golf Instruction | golf lessons coach | Private Golf Lessons, Group Clinics, Club Fitting',
    ],
  },
  {
    name: 'Pet Services',
    icon: { ios: 'pawprint.fill', android: 'pets', web: 'pets' },
    businessType: 'Sole Trader',
    vehicles: '1',
    lines: [
      'Dog Grooming | dog groomer pet grooming dog wash | Full Groom, Wash & Dry, Nail Clipping, Mobile Grooming, De-shedding, Puppy Groom',
      'Dog Walking | dog walker pet walking | Dog Walking, Group Walks, Puppy Visits, Pet Sitting',
      'Pet Sitting | pet sitter house sitting pets | Home Visits, Overnight Stays, Pet Feeding, Medication Administration',
      'Dog Training | dog trainer obedience behaviour | Puppy School, Obedience Training, Behaviour Consultations, Private Training Sessions',
      'Veterinary Clinic | vet veterinarian animal | Vet Consultations, Vaccinations, Desexing, Pet Dental Care, Surgery',
      'Pet Boarding | kennels cattery boarding pets | Dog Boarding, Cat Boarding, Pet Day Care, Pick Up & Drop Off',
      'Doggy Day Care | daycare dogs dog day care | Full Day Care, Half Day Care, Enrichment Activities',
      'Mobile Vet | vet mobile veterinarian | Home Vet Consultations, Vaccinations, In-Home Euthanasia',
      'Horse Services | equine farrier horse | Farrier Services, Horse Training, Agistment, Horse Float Transport',
      'Aquarium Services | aquarium fish tank | Aquarium Setup, Tank Cleaning, Aquarium Maintenance',
    ],
  },
  {
    name: 'Events & Hospitality',
    icon: { ios: 'party.popper.fill', android: 'celebration', web: 'celebration' },
    businessType: 'Sole Trader',
    vehicles: '1',
    lines: [
      'Event Planning | event planner events coordinator | Event Planning, Event Coordination, Venue Sourcing, Event Theming, Supplier Management',
      'Wedding Planning | wedding planner weddings | Full Wedding Planning, On-the-Day Coordination, Wedding Styling, Destination Weddings',
      'Catering | caterer catering food | Event Catering, Corporate Catering, Wedding Catering, Grazing Tables, Waitstaff Hire',
      'DJ | dj music entertainer disc jockey | Wedding DJ, Party DJ, Corporate Events DJ, Lighting & Sound Hire',
      'Photo Booth Hire | photobooth photo booth | Photo Booth Hire, Props & Backdrops, Digital Sharing',
      'Party Hire | party hire marquee equipment | Marquee Hire, Furniture Hire, Party Equipment Hire, Setup & Pack Down',
      'Florist | florist flowers floral | Wedding Flowers, Event Flowers, Bouquets, Corporate Arrangements, Sympathy Flowers',
      'Event Styling | event styling stylist decorator | Event Styling, Balloon Styling, Table Settings, Backdrops',
      'Mobile Bar | mobile bar bartender coffee cart | Mobile Bar Hire, Bartenders, Cocktail Menus, Coffee Cart',
      'Celebrant | marriage celebrant wedding | Wedding Ceremonies, Naming Ceremonies, Vow Renewals, Funeral Ceremonies',
      'Entertainment | entertainer magician face painting kids party | Kids Party Entertainment, Face Painting, Magic Shows, Roving Entertainment',
      'Private Chef | chef cooking private | Private Dinners, Meal Prep, Cooking Classes, Event Chef',
    ],
  },
  {
    name: 'IT & Technology',
    icon: { ios: 'desktopcomputer', android: 'computer', web: 'computer' },
    businessType: 'Company',
    vehicles: '0',
    lines: [
      'IT Support | computer repairs tech help it | Computer Repairs, Network Setup, IT Support Contracts, Data Recovery, Virus Removal, Remote Support',
      'Web Design | website web developer designer | Website Design, Website Development, Website Maintenance, E-commerce Websites, Website Hosting',
      'Software Development | developer apps programming software | Custom Software, App Development, System Integrations, Software Maintenance & Support',
      'Digital Marketing | marketing seo social media ads | SEO, Google Ads, Social Media Management, Email Marketing, Content Marketing',
      'Phone Repairs | mobile phone screen repairs | Screen Replacement, Battery Replacement, Water Damage Repairs, Data Transfer',
      'Cyber Security | security cyber it | Security Audits, Penetration Testing, Staff Security Training, Managed Security',
      'Home Theatre Installation | av audio visual home theatre | Home Theatre Setup, TV Wall Mounting, Speaker Installation, Smart Home Setup',
      'Smart Home Automation | automation smart home | Smart Lighting, Home Automation, Voice Assistant Setup, Security Integration',
    ],
  },
  {
    name: 'Creative & Media',
    icon: { ios: 'camera.fill', android: 'photo_camera', web: 'photo_camera' },
    businessType: 'Sole Trader',
    vehicles: '0',
    lines: [
      'Photography | photographer photos photo | Wedding Photography, Portrait Sessions, Event Photography, Commercial Photography, Real Estate Photography, Product Photography',
      'Videography | videographer video filming | Wedding Videos, Corporate Videos, Event Videos, Social Media Content, Drone Footage',
      'Graphic Design | graphic designer branding logo | Logo Design, Branding, Print Design, Social Media Graphics, Signage Design',
      'Signwriting | signs signage signwriter | Shop Signs, Vehicle Signage, Banners, Window Graphics, Illuminated Signs',
      'Printing | printer print printing | Business Cards, Flyers, Banners, Brochures, Large Format Printing',
      'Drone Services | drone aerial | Aerial Photography, Roof Inspections, Drone Surveying, Real Estate Aerials',
      'Music Lessons | music teacher piano guitar singing | Piano Lessons, Guitar Lessons, Singing Lessons, Drum Lessons',
      'Copywriting | writer content copywriter | Website Copy, Blog Writing, Marketing Copy, Editing & Proofreading',
      'Picture Framing | framing framer frames | Custom Framing, Canvas Stretching, Mirror Framing',
    ],
  },
  {
    name: 'Professional Services',
    icon: { ios: 'briefcase.fill', android: 'business_center', web: 'business_center' },
    businessType: 'Company',
    vehicles: '0',
    lines: [
      'Accounting | accountant accounting tax returns | Tax Returns, BAS Lodgement, Bookkeeping, Payroll Services, Financial Reports, Business Advisory',
      'Bookkeeping | bookkeeper bas payroll | Bookkeeping, BAS Preparation, Payroll, Accounts Payable, Software Setup',
      'Legal Services | lawyer solicitor legal | Legal Advice, Contracts, Conveyancing, Wills & Estates, Family Law',
      'Conveyancing | conveyancer property settlement | Property Purchases, Property Sales, Contract Reviews, Title Transfers',
      'Real Estate | real estate agent property sales | Property Sales, Property Appraisals, Auctions, Marketing Campaigns',
      'Property Management | property manager rentals leasing | Property Management, Tenant Screening, Routine Inspections, Lease Renewals',
      'Business Consulting | consultant advisor business coach | Business Strategy, Operations Review, Workshops, Business Coaching',
      'Mortgage Broking | mortgage broker home loans finance | Home Loans, Refinancing, Investment Loans, Pre-Approvals',
      'Financial Planning | financial planner adviser | Financial Plans, Retirement Planning, Superannuation Advice, Insurance Advice',
      'Insurance Broking | insurance broker | Business Insurance, Home Insurance, Claims Assistance, Policy Reviews',
      'Recruitment | recruiter recruitment staffing | Permanent Recruitment, Temp Staffing, Candidate Screening, Job Advertising',
      'Virtual Assistant | va virtual assistant admin | Admin Support, Inbox Management, Scheduling, Data Entry',
      'Translation | translator interpreter translation | Document Translation, Interpreting, Certified Translations',
      'Architecture | architect architecture design | Residential Design, Commercial Design, Council Approvals, Renovation Design',
      'Engineering Consulting | engineer structural engineering | Structural Engineering, Site Inspections, Engineering Certifications, Design Reviews',
      'Security Services | security guards patrol guard | Event Security, Mobile Patrols, Static Guarding, Crowd Control',
    ],
  },
  {
    name: 'Education & Tutoring',
    icon: { ios: 'book.fill', android: 'school', web: 'school' },
    businessType: 'Sole Trader',
    vehicles: '0',
    lines: [
      'Tutoring | tutor tutoring lessons | Maths Tutoring, English Tutoring, Science Tutoring, Exam Preparation, Online Tutoring',
      'Driving School | driving instructor lessons | Driving Lessons, Driving Test Preparation, Automatic Lessons, Manual Lessons',
      'Childcare | child care daycare childcare | Long Day Care, Before & After School Care, Vacation Care',
      'Nanny & Babysitting | nanny babysitter babysitting | Babysitting, Nanny Services, School Pickups, Overnight Care',
      'Language School | languages language lessons | Group Language Classes, Private Language Lessons, Online Language Classes',
      'Training & Workshops | trainer workshops courses first aid | Workshops, Corporate Training, First Aid Courses, Online Courses',
    ],
  },
  {
    name: 'Transport & Logistics',
    icon: { ios: 'truck.box.fill', android: 'local_shipping', web: 'local_shipping' },
    businessType: 'Sole Trader',
    vehicles: '2',
    lines: [
      'Courier | courier delivery deliveries | Same Day Delivery, Parcel Delivery, Document Delivery, Scheduled Delivery Runs',
      'Freight & Trucking | truck freight haulage trucking | Local Freight, Interstate Freight, Tipper Hire, Machinery Transport',
      'Chauffeur & Transfers | chauffeur driver taxi transfers | Airport Transfers, Chauffeur Services, Wedding Cars, Corporate Travel',
      'Man with a Van | van hire moving small moves | Small Moves, Furniture Delivery, Item Pickups, Rubbish Runs',
      'Skip Bin Hire | skip bins waste bins | Skip Bin Hire, Mini Skips, Commercial Bins, Waste Disposal',
    ],
  },
  {
    name: 'Care Services',
    icon: { ios: 'hand.raised.fill', android: 'volunteer_activism', web: 'volunteer_activism' },
    businessType: 'Company',
    vehicles: '1',
    lines: [
      'Aged Care | aged care home care elderly | In-Home Care, Personal Care, Respite Care, Companionship, Transport Assistance',
      'Disability Support | ndis support worker disability | Personal Care, Community Access, Daily Living Support, Respite, Support Coordination',
      'Home Nursing | nurse nursing home nursing | Home Nursing, Wound Care, Medication Management, Post-Hospital Care',
      'Funeral Services | funeral director funerals | Funeral Arrangements, Cremations, Memorial Services, Pre-Paid Funerals',
    ],
  },
];

/** Services to suggest when the owner types their own industry. */
export const GENERAL_SERVICES = [
  'Consultation',
  'Quotes & Assessments',
  'Installation',
  'Repairs',
  'Maintenance',
  'Emergency Call-Outs',
  'Cleaning',
  'Custom Projects',
  'Ongoing Service Contracts',
];

/** How many of an industry's services are ticked by default. */
export const DEFAULT_SELECTED_COUNT = 4;

export const BUSINESS_TYPES = ['Service Business', 'Sole Trader', 'Partnership', 'Company', 'Trust'] as const;

const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

export const INDUSTRIES: Industry[] = CATEGORIES.flatMap((category) =>
  category.lines.map((line) => {
    const [name, keywords, services] = line.split('|').map((part) => part.trim());
    return {
      id: slug(name),
      name,
      category: category.name,
      keywords: keywords.toLowerCase().split(/\s+/).filter(Boolean),
      services: services.split(',').map((s) => s.trim()).filter(Boolean),
    };
  }),
);

const byCategory = new Map(CATEGORIES.map((c) => [c.name, c]));

export function categoryIcon(category: string | null): IconName {
  return byCategory.get(category ?? '')?.icon ?? { ios: 'briefcase.fill', android: 'category', web: 'category' };
}

export function findIndustry(name: string) {
  return INDUSTRIES.find((i) => i.name.toLowerCase() === name.trim().toLowerCase()) ?? null;
}

/** Sensible starting values for Step 3, based on the industry's category. */
export function industryDefaults(industry: Industry | null) {
  const category = industry ? byCategory.get(industry.category) : undefined;
  return {
    businessType: category?.businessType ?? 'Service Business',
    teamSize: '1–5',
    vehicles: category?.vehicles ?? '0',
  };
}

const words = (text: string) => text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

/**
 * Smart search: matches the start of any word in the industry name (best),
 * then the start of related keywords, then the category. Every typed word must match.
 */
export function searchIndustries(query: string, limit = 8): Industry[] {
  const terms = words(query);
  if (terms.length === 0) return [];

  const scored: { industry: Industry; score: number }[] = [];
  for (const industry of INDUSTRIES) {
    const nameWords = words(industry.name);
    const categoryWords = words(industry.category);
    let score = 0;
    let matchedAll = true;
    for (const term of terms) {
      if (nameWords[0]?.startsWith(term)) score += 100;
      else if (nameWords.some((w) => w.startsWith(term))) score += 60;
      // Short searches must match a whole keyword ("pt"); longer ones can match the start.
      else if (industry.keywords.some((k) => k === term || (term.length >= 4 && k.startsWith(term)))) score += 30;
      // Category matches need 4+ letters so "car" doesn't pull in "Care Services".
      else if (term.length >= 4 && categoryWords.some((w) => w.startsWith(term))) score += 10;
      else {
        matchedAll = false;
        break;
      }
    }
    if (matchedAll) scored.push({ industry, score });
  }

  return scored
    .sort((a, b) => b.score - a.score || a.industry.name.localeCompare(b.industry.name))
    .slice(0, limit)
    .map((s) => s.industry);
}
