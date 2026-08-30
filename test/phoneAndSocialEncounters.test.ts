import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { PhoneShellSystem } from '../src/features/gameplay/PhoneShellSystem';
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

describe('Phone Shell & App Architecture', () => {
  it('opens/closes phone, locks gameplay input, and switches apps', () => {
    const engine = createMockEngine();
    const phone = new PhoneShellSystem(engine, {
      enabled: true,
      openKey: 'KeyP',
      allowWhileDriving: true,
    });

    expect(phone.isPhoneOpen).toBe(false);

    // Open phone
    const opened = phone.openPhone();
    expect(opened).toBe(true);
    expect(phone.isPhoneOpen).toBe(true);
    expect(engine.player.setInputLocked).toHaveBeenCalledWith(true);
    expect(engine.sceneManager.events.emit).toHaveBeenCalledWith('phone_opened', expect.any(Object));

    // Switch app
    const switched = phone.openApp('contacts');
    expect(switched).toBe(true);
    expect(phone.currentApp).toBe('contacts');

    // Close phone
    phone.closePhone();
    expect(phone.isPhoneOpen).toBe(false);
    expect(engine.player.setInputLocked).toHaveBeenCalledWith(false);
    expect(engine.sceneManager.events.emit).toHaveBeenCalledWith('phone_closed', expect.any(Object));
  });
});

describe('Phone Messaging System', () => {
  it('navigates conversation threads, choices, and scheduled delayed responses', () => {
    const engine = createMockEngine();
    const messaging = new PhoneMessagingSystem(engine, {
      enabled: true,
      contacts: [DEMO_CONTACT_ELENA],
    });

    messaging.registerConversationGraph('thread_elena', DEMO_CONVERSATION_ELENA_NODES);

    // Start conversation
    const thread = messaging.startConversation('thread_elena', 'contact_elena', 'Blueprints Meeting', 'node_intro');
    expect(thread).not.toBeNull();
    expect(thread?.history.length).toBe(1);
    expect(thread?.pendingChoices?.length).toBe(2);

    // Player chooses to accept meeting
    const chosen = messaging.selectChoice('thread_elena', 'choice_accept_meeting');
    expect(chosen).toBe(true);
    expect(thread?.history.length).toBe(2); // Initial message + Player reply

    // Advance time by 1.2s to trigger delayed contact confirmation
    messaging.update(1.2);
    expect(thread?.history.length).toBe(3); // Contact response delivered
    expect(thread?.isCompleted).toBe(true);
    expect(engine.sceneManager.events.emit).toHaveBeenCalledWith('demo_date_invited', expect.any(Object));
  });
});

describe('Social Encounter & Location Visit Full Lifecycle', () => {
  it('arranges café date, attends, completes activity, and triggers optional loft visit', () => {
    const engine = createMockEngine();
    const radar = {
      registerMarker: vi.fn(),
      unregisterMarker: vi.fn(),
    };
    const encounter = new SocialEncounterSystem(engine, {
      enabled: true,
      templates: [DEMO_CAFE_ENCOUNTER],
    });
    const visits = new LocationVisitSystem(engine, {
      enabled: true,
      templates: [DEMO_HOME_VISIT],
    });

    engine.gameplayFeatures.radar = radar;
    engine.gameplayFeatures.locationVisits = visits;

    // 1. Invite to date
    encounter.inviteToEncounter('encounter_cafe_meeting');
    expect(encounter.getState().activeEncounter?.status).toBe('invited');

    // 2. Accept invitation -> schedules date & creates radar waypoint
    encounter.acceptInvitation(15);
    expect(encounter.getState().activeEncounter?.status).toBe('scheduled');
    expect(radar.registerMarker).toHaveBeenCalledWith(expect.objectContaining({ id: 'encounter_encounter_cafe_meeting' }));

    // 3. Arrive & start date
    encounter.startEncounter();
    expect(encounter.getState().activeEncounter?.status).toBe('active');

    // 4. Complete first activity
    const doneActivity1 = encounter.advanceActivity(30);
    expect(doneActivity1).toBe(false);
    expect(encounter.getState().activeEncounter?.status).toBe('activity_progress');

    // 5. Complete second activity -> succeeds and automatically offers loft visit
    const doneActivity2 = encounter.advanceActivity(30);
    expect(doneActivity2).toBe(true);
    expect(radar.unregisterMarker).toHaveBeenCalledWith('encounter_encounter_cafe_meeting');

    // 6. Check that location visit invitation was made available
    const visitState = visits.getState();
    expect(visitState.activeVisit).not.toBeNull();
    expect(visitState.activeVisit?.status).toBe('invitation_available');

    // 7. Player accepts loft visit -> creates travel destination
    visits.acceptInvitation();
    expect(visits.getState().activeVisit?.status).toBe('travelling');
    expect(radar.registerMarker).toHaveBeenCalledWith(expect.objectContaining({ id: 'visit_visit_elena_loft' }));

    // 8. Player arrives and completes visit
    visits.arriveAtLocation();
    expect(visits.getState().activeVisit?.status).toBe('arrived');

    visits.completeVisit();
    expect(visits.getState().activeVisit).toBeNull();
    expect(radar.unregisterMarker).toHaveBeenCalledWith('visit_visit_elena_loft');
    expect(engine.sceneManager.events.emit).toHaveBeenCalledWith('location_visit_completed', expect.objectContaining({
      completionEvent: 'demo_loft_visit_completed',
    }));
  });
});
