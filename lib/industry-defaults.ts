export type IndustryConfig = {
    name: string
    services: string[]
    questions: string[]
    specialInstructions: string
    urgencyKeywords: string[]
    sampleGreeting: string
  }
  
  export const industryDefaults: Record<string, IndustryConfig> = {
    'Dental Office': {
      name: 'Dental Office',
      services: ['Teeth cleaning', 'Fillings', 'Crowns', 'Root canals', 'Teeth whitening', 'Checkup', 'Emergency dental'],
      questions: [
        'Ask if they are a new or existing patient',
        'Ask what type of appointment they need (cleaning, checkup, pain/emergency, other)',
        'If emergency or pain, prioritize and flag for urgent callback',
      ],
      specialInstructions: 'New patients should arrive 15 minutes early. Always ask about dental insurance.',
      urgencyKeywords: ['pain', 'emergency', 'broken tooth', 'swelling', 'bleeding'],
      sampleGreeting: "Hi! Sorry we missed your call at [Business Name]. Are you calling to schedule an appointment, or do you have a dental concern we can help with?",
    },
  
    'Hair Salon / Barbershop': {
      name: 'Hair Salon / Barbershop',
      services: ['Haircut', 'Hair coloring', 'Highlights', 'Blowout', 'Hair treatment', 'Beard trim', 'Styling'],
      questions: [
        'Ask what service they need',
        'Ask if they have a preferred stylist/barber',
        'Ask if they are a new or returning client',
      ],
      specialInstructions: 'If they request a specific stylist, note it. Color appointments take longer.',
      urgencyKeywords: ['wedding', 'event', 'today', 'urgent'],
      sampleGreeting: "Hi! Sorry we missed your call at [Business Name]. Looking to book an appointment? What service are you interested in?",
    },
  
    'HVAC Company': {
      name: 'HVAC Company',
      services: ['AC repair', 'Heating repair', 'AC installation', 'Furnace installation', 'Maintenance', 'Duct cleaning', 'Thermostat installation'],
      questions: [
        'Ask if this is an emergency (no heat in winter, no AC in summer)',
        'Ask if it is for AC, heating, or general maintenance',
        'Ask for the address/service location',
      ],
      specialInstructions: 'Emergencies (no heat when below 40°F, no AC when above 90°F) should be flagged for immediate callback. Always get the service address.',
      urgencyKeywords: ['no heat', 'no AC', 'no air', 'not working', 'emergency', 'broken', 'water leak', 'smell gas'],
      sampleGreeting: "Hi! Sorry we missed your call at [Business Name]. Are you having an HVAC issue we can help with, or looking to schedule service?",
    },
  
    'Plumbing Company': {
      name: 'Plumbing Company',
      services: ['Leak repair', 'Drain cleaning', 'Water heater repair', 'Water heater installation', 'Toilet repair', 'Faucet repair', 'Pipe repair', 'Sewer line'],
      questions: [
        'Ask if this is an emergency (active leak, flooding, no water)',
        'Ask what the issue is',
        'Ask for the service address',
      ],
      specialInstructions: 'Active leaks and flooding are emergencies - flag for immediate callback. Always get the service address.',
      urgencyKeywords: ['leak', 'flooding', 'burst pipe', 'no water', 'sewage', 'emergency', 'water everywhere'],
      sampleGreeting: "Hi! Sorry we missed your call at [Business Name]. Do you have a plumbing issue we can help with?",
    },
  
    'Medical Practice': {
      name: 'Medical Practice',
      services: ['Annual physical', 'Sick visit', 'Follow-up appointment', 'Lab work', 'Vaccination', 'Consultation'],
      questions: [
        'Ask if they are a new or existing patient',
        'Ask the reason for their visit',
        'For urgent symptoms, advise them to call 911 or go to ER if life-threatening',
      ],
      specialInstructions: 'Never provide medical advice. For emergencies, direct to 911 or ER. New patients need to bring ID and insurance card.',
      urgencyKeywords: ['emergency', 'chest pain', 'breathing', 'severe', 'urgent'],
      sampleGreeting: "Hi! Sorry we missed your call at [Business Name]. Are you calling to schedule an appointment?",
    },
  
    'Auto Repair Shop': {
      name: 'Auto Repair Shop',
      services: ['Oil change', 'Brake repair', 'Tire service', 'Engine diagnostic', 'Transmission repair', 'AC repair', 'Inspection'],
      questions: [
        'Ask what issue they are experiencing with their vehicle',
        'Ask the make, model, and year of the vehicle',
        'Ask if the car is drivable',
      ],
      specialInstructions: 'If the car is not drivable, ask if they need towing recommendations.',
      urgencyKeywords: ['broke down', 'not starting', 'stranded', 'warning light', 'overheating'],
      sampleGreeting: "Hi! Sorry we missed your call at [Business Name]. Having car trouble, or looking to schedule service?",
    },
  
    'Law Firm': {
      name: 'Law Firm',
      services: ['Consultation', 'Case review', 'Legal advice', 'Document preparation', 'Court representation'],
      questions: [
        'Ask what type of legal matter they need help with',
        'Ask if they have an existing case or attorney with the firm',
        'Note: Do not provide any legal advice',
      ],
      specialInstructions: 'Never provide legal advice. Offer to schedule a consultation. Get a brief description of their legal matter.',
      urgencyKeywords: ['court date', 'arrested', 'deadline', 'emergency', 'urgent'],
      sampleGreeting: "Hi! Sorry we missed your call at [Business Name]. Are you calling about a legal matter? I can help schedule a consultation.",
    },
  
    'Spa / Wellness Center': {
      name: 'Spa / Wellness Center',
      services: ['Massage', 'Facial', 'Body treatment', 'Manicure', 'Pedicure', 'Waxing', 'Wellness consultation'],
      questions: [
        'Ask what service they are interested in',
        'Ask if they have a preferred therapist/technician',
        'Ask if this is for a special occasion',
      ],
      specialInstructions: 'For gift certificates, note it. Ask about any allergies or sensitivities for treatments.',
      urgencyKeywords: ['gift', 'birthday', 'wedding', 'event', 'today'],
      sampleGreeting: "Hi! Sorry we missed your call at [Business Name]. Looking to book a treatment? What service interests you?",
    },
  
    'Veterinary Clinic': {
      name: 'Veterinary Clinic',
      services: ['Wellness exam', 'Vaccinations', 'Sick visit', 'Surgery', 'Dental cleaning', 'Emergency care'],
      questions: [
        'Ask what type of pet (dog, cat, etc.)',
        'Ask if this is an emergency or routine visit',
        'Ask if they are a new or existing client',
      ],
      specialInstructions: 'For emergencies (pet not breathing, severe bleeding, poisoning), direct to emergency vet if after hours. Always ask pet type and name.',
      urgencyKeywords: ['emergency', 'not breathing', 'bleeding', 'poisoned', 'hit by car', 'not eating', 'vomiting'],
      sampleGreeting: "Hi! Sorry we missed your call at [Business Name]. Are you calling about your pet? I can help schedule an appointment.",
    },
  
    'Real Estate Agency': {
      name: 'Real Estate Agency',
      services: ['Buying consultation', 'Selling consultation', 'Property viewing', 'Market analysis', 'Rental assistance'],
      questions: [
        'Ask if they are looking to buy, sell, or rent',
        'Ask what area/neighborhood they are interested in',
        'Ask their timeline',
      ],
      specialInstructions: 'Get contact info and preferred callback time. Note their budget range if mentioned.',
      urgencyKeywords: ['urgent', 'moving soon', 'closing', 'offer'],
      sampleGreeting: "Hi! Sorry we missed your call at [Business Name]. Are you looking to buy, sell, or rent a property?",
    },
  
    'Accounting / Tax Services': {
      name: 'Accounting / Tax Services',
      services: ['Tax preparation', 'Tax planning', 'Bookkeeping', 'Payroll', 'Business consulting', 'Audit support'],
      questions: [
        'Ask if this is for personal or business taxes/accounting',
        'Ask what specific service they need',
        'During tax season, ask about their deadline',
      ],
      specialInstructions: 'Never provide specific tax advice. Note if they have an upcoming deadline.',
      urgencyKeywords: ['deadline', 'audit', 'IRS', 'urgent', 'extension'],
      sampleGreeting: "Hi! Sorry we missed your call at [Business Name]. Are you calling about tax or accounting services?",
    },
  
    'Other': {
      name: 'Other',
      services: [],
      questions: [
        'Ask what they are calling about',
        'Ask how you can help them today',
      ],
      specialInstructions: 'Gather their contact info and reason for calling. Offer to have someone call them back.',
      urgencyKeywords: ['emergency', 'urgent', 'asap'],
      sampleGreeting: "Hi! Sorry we missed your call. How can I help you today?",
    },
  }
  
  export function getIndustryDefaults(businessType: string): IndustryConfig {
    return industryDefaults[businessType] || industryDefaults['Other']
  }
  
  export function getAllIndustries(): string[] {
    return Object.keys(industryDefaults)
  }