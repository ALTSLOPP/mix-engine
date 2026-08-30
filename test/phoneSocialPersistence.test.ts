import { describe, it, expect, vi } from 'vitest';
import { PhoneMessagingSystem } from '../src/features/gameplay/PhoneMessagingSystem';
import { SocialEncounterSystem } from '../src/features/gameplay/SocialEncounterSystem';
import { LocationVisitSystem } from '../src/features/gameplay/LocationVisitSystem';
import {
  DEMO_CONTACT_ELENA,
  DEMO_CONVERSATION_ELENA_NODES,
  DEMO_CAFE_ENCOUNTER,
  DEMO_HOME_VISIT,
} from '../src/content/GtaSocialDemoPack';

function createMockEngine(): any {
  const events = {
    emit: vi.fn(),
    on: vi.fn(() => () => {}),
  };
  const mock: any = {
    sceneManager: { events },
    player: {
      setInputLocked: vi.fn(),
      getPossessedId: () => 1,
    },
    gameplayFeatures: {},
  };
  return mock;
}

describe('Phone & Social Systems Persistence (Save/Load)', () => {
  it('saves and restores conversation thread history without message duplication', () => {
    const engine1 = createMockEngine();
    const messaging1 = new PhoneMessagingSystem(engine1, {
      enabled: true,
      contacts: [DEMO_CONTACT_ELENA],
    });

    messaging1.registerConversationGraph('thread_elena', DEMO_CONVERSATION_ELENA_NODES);
    messaging1.startConversation('thread_elena', 'contact_elena', 'Blueprints', 'node_intro');
    messaging1.selectChoice('thread_elena', 'choice_accept_meeting');

    const savedJson = messaging1.toJSON();

    // Restore into a fresh system instance
    const engine2 = createMockEngine();
    const messaging2 = new PhoneMessagingSystem(engine2, {
      enabled: true,
      contacts: [DEMO_CONTACT_ELENA],
    });
    messaging2.registerConversationGraph('thread_elena', DEMO_CONVERSATION_ELENA_NODES);
    messaging2.fromJSON(savedJson);

    const restoredThread = messaging2.getThread('thread_elena');
    expect(restoredThread).toBeDefined();
    expect(restoredThread?.history.length).toBe(2);
    expect(restoredThread?.history[0].sender).toBe('contact');
    expect(restoredThread?.history[1].sender).toBe('player');
  });

  it('saves and restores active social encounter and location visit states', () => {
    const engine1 = createMockEngine();
    const encounter1 = new SocialEncounterSystem(engine1, {
      enabled: true,
      templates: [DEMO_CAFE_ENCOUNTER],
    });
    const visit1 = new LocationVisitSystem(engine1, {
      enabled: true,
      templates: [DEMO_HOME_VISIT],
    });

    encounter1.inviteToEncounter('encounter_cafe_meeting');
    encounter1.acceptInvitation(16);
    encounter1.startEncounter();
    encounter1.advanceActivity(30);

    visit1.offerInvitation('visit_elena_loft');
    visit1.acceptInvitation();

    const savedEncounter = encounter1.toJSON();
    const savedVisit = visit1.toJSON();

    // Restore into fresh instances
    const engine2 = createMockEngine();
    const encounter2 = new SocialEncounterSystem(engine2, {
      enabled: true,
      templates: [DEMO_CAFE_ENCOUNTER],
    });
    const visit2 = new LocationVisitSystem(engine2, {
      enabled: true,
      templates: [DEMO_HOME_VISIT],
    });

    encounter2.fromJSON(savedEncounter);
    visit2.fromJSON(savedVisit);

    expect(encounter2.getState().activeEncounter?.status).toBe('activity_progress');
    expect(encounter2.getState().activeEncounter?.accumulatedScore).toBe(30);

    expect(visit2.getState().activeVisit?.status).toBe('travelling');
    expect(visit2.getState().activeVisit?.templateId).toBe('visit_elena_loft');
  });
});
