/**
 * MIX Engine Command Registry Index.
 * Aggregates all domain definitions into a canonical collection.
 */

import type { CommandDefinition } from '../types';
import { entityCommandDefinitions } from './entityCommands';
import { sceneCommandDefinitions } from './sceneCommands';
import { gameplayCommandDefinitions } from './gameplayCommands';
import { physicsCommandDefinitions } from './physicsCommands';
import { cinematicCommandDefinitions } from './cinematicCommands';
import { miscCommandDefinitions } from './miscCommands';
import { renderingCommandDefinitions } from './renderingCommands';
import { audioCommandDefinitions } from './audioCommands';
import { terrainCommandDefinitions } from './terrainCommands';
import { animationCommandDefinitions } from './animationCommands';
import { navigationCommandDefinitions } from './navigationCommands';
import { tweenCommandDefinitions } from './tweenCommands';
import { featureCommandDefinitions } from './featureCommands';

export const ALL_COMMAND_DEFINITIONS: readonly CommandDefinition[] = [
  ...entityCommandDefinitions,
  ...sceneCommandDefinitions,
  ...gameplayCommandDefinitions,
  ...physicsCommandDefinitions,
  ...cinematicCommandDefinitions,
  ...miscCommandDefinitions,
  ...renderingCommandDefinitions,
  ...audioCommandDefinitions,
  ...terrainCommandDefinitions,
  ...animationCommandDefinitions,
  ...navigationCommandDefinitions,
  ...tweenCommandDefinitions,
  ...featureCommandDefinitions,
];
