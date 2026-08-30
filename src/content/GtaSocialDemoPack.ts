import type {
  LocationVisitTemplate,
  MessageNode,
  PhoneContact,
  SocialEncounterTemplate,
} from '../features/gameplay/types';

export const DEMO_CONTACT_ELENA: PhoneContact = {
  id: 'contact_elena',
  name: 'Elena Harper',
  avatarIcon: '🏛️',
  relationshipScore: 10,
  status: 'available',
  homeLocation: { x: 80, y: 0, z: -30, name: "Elena's Skyline Loft" },
};

export const DEMO_CONVERSATION_ELENA_NODES: MessageNode[] = [
  {
    id: 'node_intro',
    sender: 'contact',
    text: 'Hey! Got a moment? I wanted to go over the blueprints for the downtown district project.',
    choices: [
      {
        id: 'choice_accept_meeting',
        text: "Sure! Let's grab a coffee at the Downtown Café and discuss it.",
        nextNodeId: 'node_accept_reply',
        eventTrigger: 'demo_date_invited',
      },
      {
        id: 'choice_postpone',
        text: 'A bit busy with vehicle trials right now, can we catch up later?',
        nextNodeId: 'node_postpone_reply',
      },
    ],
  },
  {
    id: 'node_accept_reply',
    sender: 'contact',
    text: "Sounds great. I'll meet you at the café shortly. Don't be late!",
    delaySeconds: 1.0,
    eventTrigger: 'demo_schedule_cafe_date',
  },
  {
    id: 'node_postpone_reply',
    sender: 'contact',
    text: 'No problem at all! Shoot me a text whenever you are free.',
    delaySeconds: 1.0,
  },
];

export const DEMO_CAFE_ENCOUNTER: SocialEncounterTemplate = {
  id: 'encounter_cafe_meeting',
  contactId: 'contact_elena',
  title: 'Downtown Café Business Meeting',
  kind: 'business_meeting',
  meetingLocation: { x: 25, y: 0, z: 40, radius: 6.0, name: 'Downtown Café' },
  timeWindowHours: { startHour: 14, endHour: 18 },
  activities: [
    {
      id: 'activity_blueprint_review',
      title: 'Reviewing Architectural Blueprints',
      description: 'Discuss building heights and zoning permits over espresso.',
      targetScore: 30,
      durationSeconds: 10,
    },
    {
      id: 'activity_project_agreement',
      title: 'Finalizing Project Terms',
      description: 'Align on city milestone deliverables and timelines.',
      targetScore: 30,
      durationSeconds: 10,
    },
  ],
  minSuccessScore: 50,
  allowHomeVisitOnSuccess: true,
};

export const DEMO_HOME_VISIT: LocationVisitTemplate = {
  id: 'visit_elena_loft',
  contactId: 'contact_elena',
  title: "Visit Elena's Skyline Loft",
  location: { x: 80, y: 0, z: -30, radius: 5.0, name: "Elena's Skyline Loft" },
  expiryDurationGameHours: 6,
  completionEvent: 'demo_loft_visit_completed',
};
